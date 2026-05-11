import client from './client'
import type { AuthUser, SignInRequest, SignUpRequest } from '../../types/api.types'

export const authApi = {
    signIn: (data: SignInRequest) => client.post<{ user: AuthUser; token: string }, { user: AuthUser; token: string }>('/api/v1/auth/signin', data),
    signUp: (data: SignUpRequest) => client.post<{ user: AuthUser; token: string }, { user: AuthUser; token: string }>('/api/v1/auth/signup', data),
    signOut: () => client.post('/api/v1/auth/signout'),
    getSession: () => client.get<AuthUser, AuthUser>('/api/v1/auth/profile'),
    changePassword: (data: any) => client.put('/api/v1/auth/change-password', data),
    uploadAvatar: (data: any) => client.post<{ avatar: string }, { avatar: string }>('/api/v1/auth/upload-avatar', data),
    deleteAccount: (data: any) => client.post('/api/v1/auth/delete-account', data),
    guestSignIn: () => client.post<{ user: AuthUser; token: string }, { user: AuthUser; token: string }>('/api/v1/auth/guest'),
}
