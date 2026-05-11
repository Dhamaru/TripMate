import { useAuthStore } from "@/store"
import { useLocation } from "wouter"
import React, { useEffect } from "react"

interface PublicRouteProps {
  children: React.ReactNode
}

export function PublicRoute({ children }: PublicRouteProps) {
  const { isAuthenticated, isLoading } = useAuthStore()
  const [, navigate] = useLocation()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/app/home")
    }
  }, [isLoading, isAuthenticated, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F59E0B] mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated) return null

  return <>{children}</>
}

export default PublicRoute
