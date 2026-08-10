import { useEffect } from 'react';
import AppRoutes from "@/components/AppRoutes";
import { useAuthStore } from './store';
import { AgentOverlayPanel } from './components/agent/AgentOverlayPanel';
import { AtlasTriggerButton } from './components/agent/AtlasTriggerButton';
import { useLocation } from 'wouter';

function App() {
  const { checkSession, isAuthenticated } = useAuthStore();
  const [location] = useLocation();

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // Only show Atlas on authenticated app pages.
  const showAtlas = isAuthenticated && location.startsWith('/app');
  // /app/maps runs its own full-bleed "focus mode" layout with a bottom
  // sheet that already occupies the same bottom-right zone the floating
  // trigger button would float in — hide just the button there. The panel
  // itself (AgentOverlayPanel) must stay mounted on every authenticated page
  // regardless, since its Ctrl+K listener only registers while it's
  // mounted — gating it the same way as the button silently broke the
  // keyboard shortcut on /app/maps entirely, contradicting the "still
  // reachable via Ctrl+K" this exclusion was meant to preserve.
  const showAtlasButton = showAtlas && !location.startsWith('/app/maps');

  return (
    <main id="main">
      <AppRoutes />
      {showAtlas && <AgentOverlayPanel />}
      {showAtlasButton && <AtlasTriggerButton />}
    </main>
  );
}

export default App;
