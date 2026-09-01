import { create } from "zustand";
import type { AuthUser } from "../types/api.types";
import { authApi } from "../lib/api";

interface AuthStore {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkSession: (retryCount?: number) => Promise<void>;
  guestSignIn: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  signIn: async (email, password) => {
    const { user } = await authApi.signIn({ email, password });
    set({ user, isAuthenticated: true, isLoading: false });
  },
  signUp: async (email, password, firstName, lastName) => {
    const { user } = await authApi.signUp({ email, password, firstName, lastName });
    set({ user, isAuthenticated: true, isLoading: false });
  },
  signOut: async () => {
    await authApi.signOut();
    set({ user: null, isAuthenticated: false });
  },
  checkSession: async (retryCount = 0) => {
    try {
      const user = await authApi.getSession();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 0;
      if (status === 401 || status === 403) {
        set({ user: null, isAuthenticated: false, isLoading: false });
      } else if ((status === 429 || status >= 500 || status === 0) && retryCount < 3) {
        // On a fresh page load there's no prior authenticated state to
        // fall back on — the store just initialized with
        // isAuthenticated: false — so a transient failure on this
        // very first check makes a validly-logged-in user look
        // logged out, with nothing to "preserve" (this is exactly
        // what happened live: a user who'd just signed up got
        // bounced back to /signin on reload because a shared-IP rate
        // limit burst hit both the initial check and its one retry).
        // Retry with backoff — a rate-limit window or transient 5xx
        // typically clears within a few seconds, not one blip.
        await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
        return get().checkSession(retryCount + 1);
      } else {
        // Exhausted retries on a transient failure, or a genuine
        // network error — keep isLoading false but do NOT assert
        // isAuthenticated: false here; we don't actually know. The
        // store's initial isAuthenticated stays whatever it already
        // was (false on a fresh load — unavoidable without a
        // separate "unknown" state), but we no longer overwrite an
        // already-true value on a re-check.
        set({ isLoading: false });
      }
    }
  },
  guestSignIn: async () => {
    const { user } = await authApi.guestSignIn();
    set({ user, isAuthenticated: true, isLoading: false });
  },
}));
