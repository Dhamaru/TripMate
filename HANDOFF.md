# Handoff

## Done and verified

- Packing-list review screen: removed backwards strikethrough on unselected items (`0dc2953`).
- Day 1 itinerary now told to account for arrival travel time from origin + kept lighter (`1e53dd4`). Prompt-only change, not yet live-generation-tested.
- Offline Maps: re-enabled MapTiler (`USE_MAPTILER = true` in `client/src/lib/offlineTiles.ts`) since OSM was 403-blocking tiles in production and user confirmed `VITE_MAPTILER_KEY` is set in Render (`5fdbf45`).
- All three: typecheck clean, build clean, 171/171 tests passing. Pushed to `origin/main`.

## In progress

- 4th bug just reported (not yet analyzed/fixed): push-notification toggle in Settings shows "Couldn't enable push — Notification permission was denied", even though the browser's site settings show Notifications: Allow. Hypothesis not yet confirmed against code — likely the app checks `Notification.permission` at a stale point (cached before the user changed the browser setting, or checked before the permission prompt actually resolved). Not investigated yet.

## Exact next command

Read the push-notification enable flow (grep for `Notification.permission` / `requestPermission` in the settings/push subscription code, likely near `push-notifications` per memory), reproduce, then follow the bug-list-triage protocol (hypothesis + effort estimate, wait for go-ahead) before fixing.

## Blocked on

- Bug #3 (MapTiler) fix is code-complete but **not live-verified**: needs a real check on the deployed Render app that tiles actually load MapTiler-style (not OSM, not an "Invalid key" placeholder) after the next deploy. If it shows "Invalid key", the Render-side `VITE_MAPTILER_KEY` value itself is still wrong and needs re-checking in Render's dashboard (outside my access).
- Bug #2 (Day 1 travel time) is a prompt-only change — needs a real trip generation with a distant origin to confirm the model actually follows the new instruction (LLM prompt compliance isn't guaranteed by a code review alone).
