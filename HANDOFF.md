# Handoff

## Done and verified

- Packing-list review screen: removed backwards strikethrough on unselected items (`0dc2953`).
- Day 1 itinerary now told to account for arrival travel time from origin + kept lighter (`1e53dd4`). Prompt-only change, not yet live-generation-tested.
- Desktop app: added `tauri-plugin-notification` so the app can register for real OS notification permission (WebView2 had no native registration before, independent of Chrome's own site permission) (`693dad4`).
- Desktop app: fixed the fully-dead `/download` Windows installer link (file didn't exist), built and published a real signed 1.0.2 release (`TripMate-Setup.exe`, `TripMate_1.0.2_x64-setup.exe`, updated `latest.json` with signature) so existing installs auto-update too (`693dad4`).
- Offline Maps / TripMap tile provider — went through three failed providers before landing on one that actually works, live-verified via curl + DevTools each time:
  - `5fdbf45` / `f0e47c3`: re-enabled MapTiler (two duplicated `USE_MAPTILER` flags existed across files and had drifted out of sync).
  - `88be8bb`: MapTiler's key kept rejecting as invalid even after correction — switched to CARTO's free anonymous tile endpoint.
  - `f3abe01`: CARTO's anonymous endpoint turned out to _also_ need a signup API key — it returns HTTP 200 with a real PNG even unauthenticated, but the PNG itself is watermarked "API KEY REQUIRED" across every tile (invisible from response headers alone, only caught via an actual screenshot). Switched to **OpenTopoMap** (no key, no signup, confirmed via a real decoded PNG fetch + open CORS). Also fixed a genuine duplicate-tile-request bug found in the process: `OfflineMaps.tsx`'s dark-mode effect swapped the whole tile layer and ran again on initial mount (every `useEffect` does, regardless of deps), firing a redundant second request for every tile already in flight. Both `OfflineMaps.tsx` and `TripMap.tsx` now use a CSS invert-filter for dark mode instead of a layer swap (OpenTopoMap has no separate dark style anyway), which removes that risk entirely. CSP (`img-src`/`connect-src`) updated to allow the new tile host.
- All: typecheck clean, build clean, 171/171 tests passing. Pushed to `origin/main` (latest: `f3abe01`).

## In progress

None currently open from this batch.

## Exact next command

Wait for Render to redeploy `f3abe01`, then hard-refresh `/app/maps` and `/app/trips/:id` (TripMap) and confirm real OpenTopoMap terrain tiles render (not blank, not a watermark, not an OSM 403 grid) in both light and dark mode.

## Blocked on / not yet live-verified

- Tile provider fix: code-complete, curl-verified against OpenTopoMap directly, but not yet confirmed live in the deployed app (Render deploy lag was the story for every one of the last three attempts — don't declare this done from code alone).
- Bug #2 (Day 1 travel time): prompt-only change — needs a real trip generation with a distant origin to confirm the model actually follows the new instruction.
- Bug #4 (desktop notifications): plugin compiles and the 1.0.2 signed release is published, but the actual permission-grant flow hasn't been click-tested on a real install yet — install the new `.exe`, open Settings, toggle push notifications, and confirm the OS prompt (not the old silent "denied") actually appears.
- Per standing rule (added 2026-09-20): every future upgrade/deploy should check desktop (.exe) and mobile (.apk) parity and re-check for UI regressions, not just the web app — see memory `deploy-checklist-cross-platform`.
- Local dev environment note: this machine's `node_modules` was found out of sync with `package-lock.json` (mongoose entry resolution broke `npm run build` locally, unrelated to any deploy) — fixed with a clean `npm ci`. If a local build ever fails with "Failed to resolve entry for package X" again, try that first before assuming a code regression.
