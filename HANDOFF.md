# Handoff

## Done and verified

- Pushed to main and LIVE-VERIFIED on production 2026-10-15 (`ed3a615`, plus `d0bd1c5` card-subtitle fix): Enter/click picks suggestions; Emergency lists real nearby hospitals/police/pharmacies.
  - `6cdad93` place-search dropdowns: Enter/arrows/Escape pick suggestions; click no longer loses to blur; Enter ignored while a newer search loads / during IME. Live-checked in browser (local vite, API forwarded to prod): "Hyder"+Enter → Hyderabad, click → Vijayawada.
  - `9d240e0` Emergency: Places-only results (Gemini path parsed to empty + cached), no empty caching (also in Atlas handler), coords-based rounded query, null coords instead of 0,0 (fixes "9009.7 km"), embassy filter, honest call toast on non-dialing devices, Atlas plural infoType fix.
  - Typecheck clean, build clean, 184/186 tests (2 known flakes: weather proxy timeout pre-existing; trips itinerary flake passes alone). Independent code-reviewer pass done, findings fixed.
  - Throwaway prod QA accounts used for repro were deleted (verified sign-in 401).

## In progress

- Persona swarm (`feat/persona-swarm`): Tasks 1-13 complete + reviewed. Task 14 (CLI/smoke/docs) checkpointed unreviewed at `69d1420`; SDD ledger at `.superpowers/sdd/2026-10-15-persona-swarm/progress.md`.

## Exact next command

User decisions: merge `feat/persona-swarm` → main; run `npx tsx scratchpad/cleanup-prod-swarm.mts` (dry run) then `--delete`; top up Gemini credits. Then a full `npm run swarm`.

## Blocked on / decisions

- Trip map "Charleston" bug: unreproduced; need user's device (web vs desktop) and hard-refresh result.
- Local server/swarm writes the PRODUCTION DB (`dbName: "tripmate"` hardcoded). Decide separate dev/test DB before any further swarm run. Leftover swarm data in prod unverified (prod DB reads blocked by permission).
- Desktop/APK parity check per deploy checklist still applies to the push above.
