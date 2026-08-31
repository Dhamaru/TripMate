# TripMate — Session Context

Read this FIRST, before grepping/exploring the codebase for a new task. It's a
living summary — update it (don't append forever; edit stale lines in place)
at the end of any session that changes architecture, fixes a real bug, or
learns something non-obvious. Full docs (`docs/ARCHITECTURE.md`, `docs/API.md`,
`docs/AGENT_PROMPTS.md`, `README.md`) are the source of truth for anything not
covered here — only go read them if this file doesn't answer the question.

## Stack (one line)

React 18 + Express 4 + MongoDB/Mongoose + Socket.io. Atlas (chat agent) runs
OpenRouter → Groq → NVIDIA NIM×2 fallback chain; Gemini (`gemini-3.5-flash-lite`)
handles separate AI utility calls (weather/travel-hacks/journal); OpenAI wired
but unfunded. Deployed on Render: https://tripmate-ylt6.onrender.com

## Where things live

- `server/agent/agentLoop.ts` — Atlas chat loop + provider fallback
- `server/agent/tools/handlers/` — Atlas tool implementations (one per REST-equivalent action)
- `server/agent/multiAgent/MasterOrchestrator.ts` + `agents/` — separate non-chat pipeline (SuggestionAgent, ItineraryAgent, BudgetAgent, MapAgent, PackingAgent, JournalAgent, HeroImageAgent), tracked via `AgentJob`
- `server/controllers/` — REST handlers; most have an Atlas tool-handler twin doing the same mutation
- `shared/schema.ts` — single source of truth for Zod + Mongoose models
- `server/config.ts` — authoritative env var list

## Non-obvious facts that cost real debugging time to learn

- **ID types are inconsistent by design**: `User._id` and most models use nanoid **strings**. `Trip._id` is a real Mongo **ObjectId**. A model with `userId: Schema.Types.ObjectId` when the actual value is a nanoid string silently CastErrors on every query — killed two whole features (Suggestions, Job History) before it was caught.
- **Trip collaborative writes are atomic-op-based, not `.save()`** (fixed 2026-08-31/09-01, commit `9144e4b`) — `expense.controller.ts`, `itinerary.controller.ts`, and their Atlas tool-handler twins use `$push`/`$pull`/`$set` with `arrayFilters` to avoid whole-document read-modify-write races. `modifyItineraryHandler.ts` is the one exception (needs the full itinerary read for its feasibility check) — it uses optimistic concurrency (compare-and-swap on `updatedAt`) instead.
- **Google Places Photo URLs must never embed `GOOGLE_API_KEY` client-side** — always go through `/api/v1/places/photo?ref=<photo_reference>` (server-side proxy, `redirect: "follow"` since Google 302s). This leaked 4 separate times across the session in different call sites before all were found — grep for `maps.googleapis.com/maps/api/place/photo` before shipping anything that touches Places.
- **Auth is cookie-primary**, not Bearer-primary — the SPA never sends an `Authorization` header; it's accepted as a fallback only. CSRF middleware skips the check when there's no auth cookie or when a Bearer header is present.
- **Avatars are base64-in-Mongo**, not disk-uploaded — Render's disk is ephemeral.
- **Maps use OpenStreetMap tiles**, not CartoDB (CartoDB now requires a paid key). Dark mode is a CSS filter on the Leaflet tile pane, not a second tileset — don't add one, it doubles OSM request volume.
- **QA/test accounts**: pattern is `@example.com` or `@tripmate.dev`, but real confirmed accounts also exist at other domains — always check with the user before bulk-deleting. `claude.code@tripmate.dev` is a persistent, intentional exception (not junk). Broad regex-scoped bulk deletes against prod trigger the safety classifier; itemized/exact-ID deletes don't.
- **Design system** is "Night Atlas / Passport & Visa Stamp" — dark-by-default via `:root` tokens in `client/src/index.css` (light is the `.light` override, not the reverse).

## Known open issues (not yet fixed, don't re-discover from scratch)

- None currently tracked as open. (Update this section as new ones surface; remove entries once fixed and delete instead of leaving a stale "fixed" note — git history has the record.)

## Recent work log (most recent first — trim entries older than ~4-6 weeks)

- **2026-09-01**: Fixed collaborative-edit race condition on Trip itinerary/expenses (see "Non-obvious facts" above). Live-verified against dev MongoDB: 10 concurrent writes, no lost updates, no duplicate day entries. Commit `9144e4b`.
- **2026-08-31**: Brought README/ARCHITECTURE/AGENT_PROMPTS/API/PROJECT_RULES docs up to date with real system (was describing a fictional 4-stage agent pipeline, Groq-only LLM claim, `DATABASE_URL` instead of `MONGODB_URI`, disk-based uploads). Commit `f33adc2`.
- **2026-08-31**: Found and fixed a live `GOOGLE_API_KEY` leak in `trips.controller.ts` (`fetchImageForTrip`, `mapGooglePlace`) during production verification — 2 more instances of a pattern already fixed once elsewhere. Migrated 3 already-affected production trips. Commit `48dd1e3`.
- **2026-08-31**: Fixed hero search bar text truncation on narrow phones (icon-only "Plan Trip" button below `sm:`). Commit `afdafca`.
- **Earlier same session**: 3-round security/correctness audit (15 findings: userId type mismatches, 4x API key leak pattern, CSRF gaps, plaintext token storage, incomplete account-deletion cascade, forged-token session revocation, cross-tenant journal-tool gap, billing-abuse rate-limit gap). Landing.tsx full dark redesign + scroll/click motion pass. Gemini model-deprecation fix (`gemini-2.0-flash-lite` → `gemini-3.5-flash-lite`). CartoDB → OpenStreetMap maps migration.
