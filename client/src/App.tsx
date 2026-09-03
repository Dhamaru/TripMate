import { useEffect } from "react";
import AppRoutes from "@/components/AppRoutes";
import { useAuthStore, useAgentStore } from "./store";
import { AgentOverlayPanel } from "./components/agent/AgentOverlayPanel";
import { AtlasTriggerButton } from "./components/agent/AtlasTriggerButton";
import { useLocation } from "wouter";

function App() {
  const { checkSession, isAuthenticated } = useAuthStore();
  const isChatOpen = useAgentStore((s) => s.isChatOpen);
  const [location] = useLocation();

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // Only show Atlas on authenticated app pages.
  const showAtlas = isAuthenticated && location.startsWith("/app");
  // /app/maps runs its own full-bleed "focus mode" layout with a bottom
  // sheet that already occupies the same bottom-right zone the floating
  // trigger button would float in — hide just the button there. /app/profile
  // and /app/planner both have real form controls (the email field, the
  // Group Size dropdown) that a real mobile QA pass found the FAB visually
  // sitting on top of at 375-430px — same bottom-right-corner collision
  // class as maps, just with form inputs instead of a bottom sheet. The
  // panel itself (AgentOverlayPanel) must stay mounted on every authenticated
  // page regardless, since its Ctrl+K listener only registers while it's
  // mounted — gating it the same way as the button silently broke the
  // keyboard shortcut on /app/maps entirely, contradicting the "still
  // reachable via Ctrl+K" this exclusion was meant to preserve.
  // Hidden while the chat panel itself is open — the panel already has its
  // own close (X) control, and the trigger otherwise sits fixed on top of
  // the panel's own send button in the same bottom-right corner.
  // Live-reported: the FAB sat directly on top of the Packing List's
  // category headers/badges at 375px — this route was never added when
  // the profile/planner exclusions landed, same overlap class as those.
  const FAB_EXCLUDED_ROUTES = ["/app/maps", "/app/profile", "/app/planner", "/app/packing"];
  const showAtlasButton =
    showAtlas && !FAB_EXCLUDED_ROUTES.some((r) => location.startsWith(r)) && !isChatOpen;

  return (
    <main id="main">
      <AppRoutes />
      {showAtlas && <AgentOverlayPanel />}
      {showAtlasButton && <AtlasTriggerButton />}
    </main>
  );
}

export default App;
