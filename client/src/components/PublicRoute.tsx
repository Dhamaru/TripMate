import { useAuth } from "@/hooks/useAuth"
import { useLocation } from "wouter"

interface PublicRouteProps {
  children: React.ReactNode
}

export function PublicRoute({ children }: PublicRouteProps) {
  const { isAuthenticated, isLoading, token } = useAuth() as any
  const [, navigate] = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ios-darker flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ios-blue mx-auto mb-4"></div>
          <p className="text-ios-gray">Loading...</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated || !!token) {
    navigate("/app/home")
    return null
  }

  return <>{children}</>
}

export default PublicRoute
