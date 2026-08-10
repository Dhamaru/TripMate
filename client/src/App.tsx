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

  // Only show Atlas on authenticated app pages — except /app/maps, which runs
  // its own full-bleed "focus mode" layout with a bottom sheet that already
  // occupies the same bottom-right zone this fixed button would float in.
  // Still reachable there via Ctrl+K.
  const showAtlas = isAuthenticated && location.startsWith('/app') && !location.startsWith('/app/maps');

  return (
    <main id="main">
      <AppRoutes />
      {showAtlas && <AgentOverlayPanel />}
      {showAtlas && <AtlasTriggerButton />}
    </main>
  );
}

export default App;
