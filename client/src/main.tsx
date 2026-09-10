import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

import { ThemeProvider } from "./components/layout/ThemeProvider";

// Service worker: auto-updates, but also surface a visible "Update" banner
// so a user on a stale cache (e.g. an installed PWA/TWA that hasn't
// reloaded) can force it without digging into system settings.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (document.getElementById("tm-update-banner")) return;
    const bar = document.createElement("div");
    bar.id = "tm-update-banner";
    bar.setAttribute("role", "status");
    bar.style.cssText =
      "position:fixed;left:12px;right:12px;bottom:88px;z-index:9999;display:flex;" +
      "align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;" +
      "border-radius:14px;background:#c2410c;color:#fff;font:600 13px/1.3 'Work Sans',system-ui,sans-serif;" +
      "box-shadow:0 8px 32px rgba(0,0,0,.4)";
    bar.innerHTML =
      "<span>A new version of TripMate is ready.</span>" +
      "<button id='tm-update-btn' style=\"flex-shrink:0;background:#fff;color:#c2410c;border:0;" +
      'border-radius:8px;padding:7px 14px;font:700 13px system-ui;cursor:pointer">Update</button>';
    document.body.appendChild(bar);
    document.getElementById("tm-update-btn")?.addEventListener("click", () => {
      updateSW(true); // activates the new SW and reloads
    });
  },
});

// Manual check — call window.tripmateCheckForUpdate() (also wired to the
// Profile page button). Re-registers to pull a fresh SW if one shipped.
(window as any).tripmateCheckForUpdate = async () => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {}
};

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
