import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

import { ThemeProvider } from "./components/layout/ThemeProvider";

registerSW({ immediate: true });

const el = document.getElementById("root");
if (!el) throw new Error("Root element #root not found in index.html");
createRoot(el).render(
  <StrictMode>
    {/* DESIGN.md's tokens are dark-by-default (":root" is the ink-navy
        palette; ".light" is the override) — this default only governs a
        first-time visitor with nothing in localStorage yet, so it can't
        flip any existing user's already-saved theme choice. */}
    <ThemeProvider defaultTheme="dark" storageKey="tripmate-ui-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
