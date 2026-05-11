import { Redirect } from 'wouter'
import { useAuthStore } from '../store'

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuthStore()
    if (isLoading) return null
    if (!isAuthenticated) return <Redirect to="/signin" />
    return <>{children}</>
}
