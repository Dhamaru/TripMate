import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from "virtual:pwa-register";
import App from './App'
import './index.css'

import { ThemeProvider } from './components/layout/ThemeProvider'

registerSW({ immediate: true });

const el = document.getElementById('root')
if (!el) throw new Error('Root element #root not found in index.html')
createRoot(el).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="tripmate-ui-theme">
      <App />
    </ThemeProvider>
  </StrictMode>
)
