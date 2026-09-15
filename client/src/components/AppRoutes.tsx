import { useEffect, Suspense, lazy } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/store";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PublicRoute } from "@/components/PublicRoute";

// Performance-audit finding: every route below was a static top-level
// import, so a single ~1.9MB vendor+app chunk was the fixed cost of even
// just loading the sign-in page — the itinerary manager, maps, journal
// photo viewer etc. all shipped on that very first request regardless of
// which page (if any of these) the visitor ever opened. Kept eager only
// the handful of pages a real visit almost always touches immediately
// (the public landing page, sign in/up, and the post-login home page) —
// everything reachable only through in-app navigation is now its own
// chunk, fetched on first visit to that route.
import Landing from "@/pages/Landing";
import SignInPage from "@/pages/auth/SignInPage";
import SignUpPage from "@/pages/auth/SignUpPage";
import Home from "@/pages/Home";

const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));

const HelpCenter = lazy(() => import("@/pages/support/HelpCenter"));
const PrivacyPolicy = lazy(() => import("@/pages/support/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/support/TermsOfService"));
const ContactUs = lazy(() => import("@/pages/support/ContactUs"));

const Features = lazy(() => import("@/pages/Features"));
const TripPlanner = lazy(() => import("@/pages/TripPlanner"));
const Journal = lazy(() => import("@/pages/Journal"));
const JournalDetail = lazy(() => import("@/pages/JournalDetail"));
const TripDetail = lazy(() => import("@/pages/TripDetail"));
const CropImagePage = lazy(() => import("@/pages/CropImage"));
const Maps = lazy(() => import("@/pages/Maps"));
const PackingListPage = lazy(() => import("@/pages/app/packing"));
const ProfilePage = lazy(() => import("@/pages/Profile"));
const Sessions = lazy(() => import("@/pages/Sessions"));
const CurrencyPage = lazy(() => import("@/pages/app/currency"));
const WeatherPage = lazy(() => import("@/pages/app/weather"));
const TranslatePage = lazy(() => import("@/pages/app/translate"));
const EmergencyPage = lazy(() => import("@/pages/app/emergency"));
const Tools = lazy(() => import("@/pages/Tools"));
const Feedback = lazy(() => import("@/pages/Feedback"));
const TripsHistory = lazy(() => import("@/pages/TripsHistory"));
const NotFound = lazy(() => import("@/pages/not-found"));
const PublicTripPage = lazy(() => import("@/pages/PublicTrip"));

import AuthLayout from "@/components/layout/AuthLayout";
import AppLayout from "@/components/layout/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";

// Same spinner ProtectedRoute.tsx already uses for its own full-page
// auth-check fallback — a lazy chunk fetch is typically much faster than
// that check anyway, so this is rarely visible, but it exists for the real
// cold case (slow connection, first visit to a route in this session).
function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#163F73]" />
    </div>
  );
}

function TripsAlias({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(`/app/trips/${params.id}`, { replace: true });
  }, [navigate, params.id]);
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
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        {/* Public routes */}
        <Route path="/" component={Landing} />

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
          <AuthLayout>
            <ResetPasswordPage />
          </AuthLayout>
        </Route>

        {/* Public trip share link — no auth, matches server's
          GET /api/v1/trips/public/:shareId */}
        <Route path="/share/:shareId" component={PublicTripPage} />

        {/* Support Routes */}
        <Route path="/help" component={HelpCenter} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/contact" component={ContactUs} />

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
    </Suspense>
  );
}

function AppRoutes() {
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && String(e.key).toLowerCase() === "z";
      if (isUndo) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const beforeInputHandler = (e: any) => {
      if (String(e.inputType) === "historyUndo") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", keyHandler, { capture: true } as any);
    window.addEventListener(
      "beforeinput",
      beforeInputHandler as EventListener,
      { capture: true } as any,
    );
    return () => {
      window.removeEventListener("keydown", keyHandler, { capture: true } as any);
      window.removeEventListener(
        "beforeinput",
        beforeInputHandler as EventListener,
        { capture: true } as any,
      );
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default AppRoutes;
