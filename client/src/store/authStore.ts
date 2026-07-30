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
    checkSession: () => Promise<void>
    guestSignIn: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
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
    checkSession: async () => {
        try {
            const user = await authApi.getSession()
            set({ user, isAuthenticated: true, isLoading: false })
        } catch {
            set({ user: null, isAuthenticated: false, isLoading: false })
        }
    },
    guestSignIn: async () => {
        const { user } = await authApi.guestSignIn()
        set({ user, isAuthenticated: true, isLoading: false })
    },
}))
