import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, token } = useAuth() as any;
  const [, setLocation] = useLocation();
  const devMode = false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ios-darker flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ios-blue mx-auto mb-4"></div>
          <p className="text-ios-gray">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !token) {
    setLocation("/signin");
    return null;
  }

  return <>{children}</>;
}
