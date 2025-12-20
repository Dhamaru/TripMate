import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { AuthProvider } from "@/components/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PublicRoute } from "@/components/PublicRoute";

import Landing from "@/pages/Landing";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import SignInPage from "@/pages/auth/SignInPage";
import SignUpPage from "@/pages/auth/SignUpPage";

import HelpCenter from "@/pages/support/HelpCenter";
import PrivacyPolicy from "@/pages/support/PrivacyPolicy";
import TermsOfService from "@/pages/support/TermsOfService";
import ContactUs from "@/pages/support/ContactUs";

import Home from "@/pages/Home";
import Features from "@/pages/Features";
import TripPlanner from "@/pages/TripPlanner";
import Journal from "@/pages/Journal";
import JournalDetail from "@/pages/JournalDetail";
import TripDetail from "@/pages/TripDetail";
import CropImagePage from "@/pages/CropImage";
import Maps from "@/pages/Maps";
import PackingListPage from "@/pages/app/packing";
import ProfilePage from "@/pages/Profile";
import Sessions from "@/pages/Sessions";
import CurrencyPage from "@/pages/app/currency";
import WeatherPage from "@/pages/app/weather";
import TranslatePage from "@/pages/app/translate";
import EmergencyPage from "@/pages/app/emergency";
import Tools from "@/pages/Tools";
import Feedback from "@/pages/Feedback";
import TripsHistory from "@/pages/TripsHistory";
import NotFound from "@/pages/not-found";

import AuthLayout from "@/components/layout/AuthLayout";
import AppLayout from "@/components/layout/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";

function TripsAlias({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  // forward to the actual route used by the app
  navigate(`/app/trips/${params.id}`, { replace: true });
  return null;
  return null;
}

function AppRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/app/home", { replace: true });
  }, [navigate]);
  return null;
}

function Router() {
  const { isAuthenticated, isLoading, token } = useAuth() as any;

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/">
        <PublicRoute>
          <Landing />
        </PublicRoute>
      </Route>
      <Route path="/signin">
        <PublicRoute>
          <AuthLayout>
            <SignInPage />
          </AuthLayout>
        </PublicRoute>
      </Route>
      <Route path="/signup">
        <PublicRoute>
          <AuthLayout>
            <SignUpPage />
          </AuthLayout>
        </PublicRoute>
      </Route>
      <Route path="/forgot-password">
        <PublicRoute>
          <AuthLayout>
            <ForgotPasswordPage />
          </AuthLayout>
        </PublicRoute>
      </Route>
      <Route path="/reset-password">
        <PublicRoute>
          <AuthLayout>
            <ResetPasswordPage />
          </AuthLayout>
        </PublicRoute>
      </Route>

      {/* Support Routes */}
      <Route path="/help">
        <PublicRoute>
          <HelpCenter />
        </PublicRoute>
      </Route>
      <Route path="/privacy">
        <PublicRoute>
          <PrivacyPolicy />
        </PublicRoute>
      </Route>
      <Route path="/terms">
        <PublicRoute>
          <TermsOfService />
        </PublicRoute>
      </Route>
      <Route path="/contact">
        <PublicRoute>
          <ContactUs />
        </PublicRoute>
      </Route>


      {/* Protected routes under /app */}

      <Route path="/app/home">
        <ProtectedRoute>
          <AppLayout>
            <Home />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/features">
        <ProtectedRoute>
          <AppLayout>
            <Features />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/tools">
        <ProtectedRoute>
          <AppLayout>
            <Tools />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/planner">
        <ProtectedRoute>
          <AppLayout>
            <TripPlanner />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/trips">
        <ProtectedRoute>
          <AppLayout>
            <TripsHistory />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/journal">
        <ProtectedRoute>
          <AppLayout>
            <Journal />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/journal/:id">
        <ProtectedRoute>
          <AppLayout>
            <JournalDetail />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/maps">
        <ProtectedRoute>
          <AppLayout>
            <Maps />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/packing">
        <ProtectedRoute>
          <AppLayout>
            <PackingListPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/feedback">
        <ProtectedRoute>
          <AppLayout>
            <Feedback />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/profile">
        <ProtectedRoute>
          <AppLayout>
            <ProfilePage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/sessions">
        <ProtectedRoute>
          <AppLayout>
            <Sessions />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/profile/crop">
        <ProtectedRoute>
          <AppLayout>
            <CropImagePage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/trips/:id">
        <ProtectedRoute>
          <AppLayout>
            <TripDetail />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/currency">
        <ProtectedRoute>
          <AppLayout>
            <CurrencyPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/weather">
        <ProtectedRoute>
          <AppLayout>
            <WeatherPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/translate">
        <ProtectedRoute>
          <AppLayout>
            <TranslatePage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app/emergency">
        <ProtectedRoute>
          <AppLayout>
            <EmergencyPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/app" component={AppRedirect} />


      {/* Aliases for deep links without /app prefix */}
      <Route path="/trips/:id" component={TripsAlias} />

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function AppRoutes() {
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && String(e.key).toLowerCase() === 'z';
      if (isUndo) { e.preventDefault(); e.stopPropagation(); }
    };
    const beforeInputHandler = (e: any) => {
      if (String(e.inputType) === 'historyUndo') { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', keyHandler, { capture: true } as any);
    window.addEventListener('beforeinput', beforeInputHandler as EventListener, { capture: true } as any);
    return () => {
      window.removeEventListener('keydown', keyHandler, { capture: true } as any);
      window.removeEventListener('beforeinput', beforeInputHandler as EventListener, { capture: true } as any);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default AppRoutes;
