# Handoff

## Done and verified

- Packing-list review screen: removed backwards strikethrough on unselected items (`0dc2953`).
- Day 1 itinerary now told to account for arrival travel time from origin + kept lighter (`1e53dd4`). Prompt-only change, not yet live-generation-tested.
- Offline Maps: re-enabled MapTiler (`USE_MAPTILER = true` in `client/src/lib/offlineTiles.ts`) since OSM was 403-blocking tiles in production and user confirmed `VITE_MAPTILER_KEY` is set in Render (`5fdbf45`).
- Desktop app: added `tauri-plugin-notification` so the app can register for real OS notification permission (WebView2 had no native registration before, independent of Chrome's own site permission) (`693dad4`).
- Desktop app: fixed the fully-dead `/download` Windows installer link (file didn't exist), built and published a real signed 1.0.2 release (`TripMate-Setup.exe`, `TripMate_1.0.2_x64-setup.exe`, updated `latest.json` with signature) so existing installs auto-update too (`693dad4`).
- All: typecheck clean, build clean, 171/171 tests passing (web side). Pushed to `origin/main`.

## In progress

None currently open from this batch.

## Exact next command

Live-verify the two items below once deploys land; nothing else queued.

## Blocked on / not yet live-verified

- Bug #3 (MapTiler): code-complete but not live-verified — needs a real check on the deployed Render app that tiles load MapTiler-style, not OSM, not an "Invalid key" placeholder, after the next deploy finishes.
- Bug #2 (Day 1 travel time): prompt-only change — needs a real trip generation with a distant origin to confirm the model actually follows the new instruction.
- Bug #4 (desktop notifications): plugin compiles and the 1.0.2 signed release is published, but the actual permission-grant flow hasn't been click-tested on a real install yet — install the new `.exe`, open Settings, toggle push notifications, and confirm the OS prompt (not the old silent "denied") actually appears.
- Per new standing rule (added 2026-09-20): every future upgrade/deploy should check desktop (.exe) and mobile (.apk) parity and re-check for UI regressions, not just the web app — see memory `deploy-checklist-cross-platform`.
