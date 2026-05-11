import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ios-darker px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl mb-6" aria-hidden="true">🗺️</div>
        <h1 className="text-3xl font-bold text-white mb-3">We lost this page</h1>
        <p className="text-ios-gray mb-8 leading-relaxed">
          The page you are looking for does not exist or has been moved.
          Head back home and pick up where you left off.
        </p>
        <Button
          onClick={() => navigate(isAuthenticated ? "/app/home" : "/")}
          className="bg-ios-blue hover:bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold"
        >
          Back to TripMate
        </Button>
      </div>
    </div>
  );
}
