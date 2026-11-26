import { create } from "zustand";
import type { AuthUser } from "../types/api.types";
import { apiRequestJson, queryClient } from "../lib/queryClient";

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

// Whenever the account changes, drop everything cached for the previous one
// so the next person on a shared device can't be shown their trips. The
// service worker's trips cache also serves offline, outliving the tab.
function clearUserCaches() {
  queryClient.clear();
  if (typeof caches !== "undefined") caches.delete("trips-api-cache").catch(() => {});
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  signIn: async (email, password) => {
    const { user } = await apiRequestJson<{ user: AuthUser }>("POST", "/api/v1/auth/signin", {
      email,
      password,
    });
    clearUserCaches();
    set({ user, isAuthenticated: true, isLoading: false });
  },
  signUp: async (email, password, firstName, lastName) => {
    const { user } = await apiRequestJson<{ user: AuthUser }>("POST", "/api/v1/auth/signup", {
      email,
      password,
      firstName,
      lastName,
    });
    clearUserCaches();
    set({ user, isAuthenticated: true, isLoading: false });
  },
  signOut: async () => {
    try {
      await apiRequestJson("POST", "/api/v1/auth/signout");
    } finally {
      clearUserCaches();
      set({ user: null, isAuthenticated: false });
    }
  },
  checkSession: async (retryCount = 0) => {
    try {
      const user = await apiRequestJson<AuthUser>("GET", "/api/v1/auth/profile");
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      if (status === 401 || status === 403) {
        // Expired or revoked session: the next person must not see its data.
        clearUserCaches();
        set({ user: null, isAuthenticated: false, isLoading: false });
      } else if (status === 0 && typeof navigator !== "undefined" && !navigator.onLine) {
        // Offline cold start: trust the last confirmed sign-in so downloaded
        // offline maps stay reachable. The server still checks the session
        // on every request once the device is back online.
        const remembered = readRememberedUser();
        if (remembered) set({ user: remembered, isAuthenticated: true, isLoading: false });
        else set({ isLoading: false });
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
    clearUserCaches();
    const { user } = await apiRequestJson<{ user: AuthUser }>("POST", "/api/v1/auth/guest");
    set({ user, isAuthenticated: true, isLoading: false });
  },
}));

const REMEMBERED_USER_KEY = "tripmate-last-user";

function readRememberedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(REMEMBERED_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

// Kept only while signed in: sign-out, a 401 and account deletion all set
// user to null, which removes it.
useAuthStore.subscribe((state, prev) => {
  if (state.user === prev.user) return;
  try {
    if (state.user) localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify(state.user));
    else localStorage.removeItem(REMEMBERED_USER_KEY);
  } catch {
    /* storage unavailable: offline cold start just won't be signed in */
  }
});

if (typeof window !== "undefined") {
  window.addEventListener("tripmate:unauthorized", () => {
    if (useAuthStore.getState().isAuthenticated) useAuthStore.getState().checkSession();
  });
}
