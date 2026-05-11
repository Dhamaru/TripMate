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

  // Only show Atlas on authenticated app pages
  const showAtlas = isAuthenticated && location.startsWith('/app');

  return (
    <main id="main">
      <AppRoutes />
      {showAtlas && <AgentOverlayPanel />}
      {showAtlas && <AtlasTriggerButton />}
    </main>
  );
}

export default App;
