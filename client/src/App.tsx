import { useEffect } from 'react';
import AppRoutes from "@/components/AppRoutes";
import { useAuthStore } from './store';

import { AgentOverlayPanel } from './components/agent/AgentOverlayPanel';
import { AtlasTriggerButton } from './components/agent/AtlasTriggerButton';

function App() {
  const { checkSession } = useAuthStore();

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  return (
    <main id="main">
      <AppRoutes />
      <AgentOverlayPanel />
      <AtlasTriggerButton />
    </main>
  );
}

export default App;
