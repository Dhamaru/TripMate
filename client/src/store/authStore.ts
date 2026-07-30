import { create } from 'zustand'
import type { AuthUser } from '../types/api.types'
import { authApi } from '../lib/api'

interface AuthStore {
    user: AuthUser | null
    isLoading: boolean
    isAuthenticated: boolean
    signIn: (email: string, password: string) => Promise<void>
    signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<void>
    signOut: () => Promise<void>
    checkSession: (isRetry?: boolean) => Promise<void>
    guestSignIn: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    signIn: async (email, password) => {
        const { user } = await authApi.signIn({ email, password })
        set({ user, isAuthenticated: true, isLoading: false })
    },
    signUp: async (email, password, firstName, lastName) => {
        const { user } = await authApi.signUp({ email, password, firstName, lastName })
        set({ user, isAuthenticated: true, isLoading: false })
    },
    signOut: async () => {
        await authApi.signOut()
        set({ user: null, isAuthenticated: false })
    },
    checkSession: async (isRetry = false) => {
        try {
            const user = await authApi.getSession()
            set({ user, isAuthenticated: true, isLoading: false })
        } catch (err) {
            const status = (err as { statusCode?: number }).statusCode ?? 0
            if (status === 401 || status === 403) {
                set({ user: null, isAuthenticated: false, isLoading: false })
            } else if (status === 429 && !isRetry) {
                // On a fresh page load there's no prior authenticated state to
                // fall back on — the store just initialized with
                // isAuthenticated: false — so a 429 on this very first check
                // makes a validly-logged-in user look logged out, with
                // nothing to "preserve". Retry once after a short delay
                // rather than accepting that as the final answer; 429s are
                // typically a burst-limit blip that clears within a second.
                await new Promise((resolve) => setTimeout(resolve, 1500))
                return get().checkSession(true)
            } else {
                // 429 on retry, 5xx, network error: keep valid session alive
                set({ isLoading: false })
            }
        }
    },
    guestSignIn: async () => {
        const { user } = await authApi.guestSignIn()
        set({ user, isAuthenticated: true, isLoading: false })
    },
}))
