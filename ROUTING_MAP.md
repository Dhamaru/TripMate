# ROUTING_MAP.md — routes.ts Split Strategy

> Generated: 2026-03-04
> Status: DECISION DOCUMENT — DO NOT SPLIT YET (Phase 2 action)

This document categorizes every endpoint in `routes.ts` (4240 lines) into 8 target route files.
Ralph will use this map to execute the actual file split in Phase 2.

---

## Categorization Table

### 1. `auth.routes.ts` — Authentication & User Management (18 endpoints)

| Method | Path | Line | Handler Summary | Notes |
|--------|------|------|----------------|-------|
| GET | `/api/v1/auth/providers` | 466 | Return enabled OAuth providers | |
| GET | `/api/v1/auth/google` | 473 | Initiate Google OAuth | |
| GET | `/api/v1/auth/google/callback` | 475 | Google OAuth callback → JWT | |
| GET | `/api/v1/auth/apple` | 519 | Initiate Apple OAuth | |
| POST | `/api/auth/apple/callback` | 520 | Apple OAuth callback → JWT | ⚠️ Missing `/v1/` prefix |
| POST | `/api/v1/auth/signin` | 555 | Email/password sign-in | |
| POST | `/api/v1/auth/guest` | 631 | Create guest user + access token | |
| POST | `/api/v1/auth/user/avatar` | 689 | Upload avatar (Base64) | |
| PUT | `/api/v1/auth/user` | 713 | Update profile (firstName, etc.) | DUPLICATE — also at line 1029 |
| GET | `/api/v1/auth/user` | 733 | Get current user | DUPLICATE — also at line 1002 |
| POST | `/api/v1/auth/signup` | 744 | Register new user / link password | |
| POST | `/api/v1/auth/signout` | 865 | Revoke refresh token + clear cookie | |
| POST | `/api/v1/auth/refresh` | 888 | Rotate refresh token | |
| POST | `/api/v1/auth/logout-all` | 949 | Revoke all sessions | |
| GET | `/api/v1/auth/sessions` | 967 | List active sessions | |
| POST | `/api/v1/auth/sessions/:id/revoke` | 983 | Revoke specific session | |
| GET | `/api/v1/auth/user` | 1002 | Get current user (DUPLICATE of line 733) | ⚠️ REMOVE |
| PUT | `/api/v1/auth/user` | 1029 | Update user (DUPLICATE of line 713) | ⚠️ REMOVE |
| POST | `/api/v1/auth/forgot-password` | 138 | Send password reset email | |
| POST | `/api/v1/auth/reset-password` | 186 | Reset password via token | |

### 2. `trips.routes.ts` — Trip CRUD & Sync (10 endpoints)

| Method | Path | Line | Handler Summary | Notes |
|--------|------|------|----------------|-------|
| DELETE | `/api/v1/trips` | 1059 | Delete all user trips | |
| GET | `/api/v1/trips` | 1070 | List user trips | |
| POST | `/api/v1/trips` | 1082 | Create trip + auto-fetch image | |
| GET | `/api/v1/trips/:id` | 1202 | Get single trip | |
| PUT | `/api/v1/trips/:id` | 1217 | Update trip (with itinerary regen) | TANGLED — calls `ai.planTrip()` |
| DELETE | `/api/v1/trips/:id` | 1692 | Delete single trip (unsafe) | ⚠️ No auth middleware |
| POST | `/api/v1/trips/sync` | 3018 | Bulk create/update/delete | |
| POST | `/api/v1/trips/:id/image` | 3155 | Auto-fetch trip image | |
| POST | `/api/v1/trips/suggest` | 3439 | AI trip suggestions (mock) | |

### 3. `itinerary.routes.ts` — Itinerary & Activity CRUD (8 endpoints)

| Method | Path | Line | Handler Summary | Notes |
|--------|------|------|----------------|-------|
| PUT | `/api/v1/trips/:id/itinerary` | 3197 | Update full itinerary (reorder) | |
| PATCH | `/api/v1/trips/:id/itinerary` | 3232 | Differential sync (JSON Patch) | |
| POST | `/api/v1/trips/:id/itinerary/activities` | 3270 | Add activity to day | |
| PUT | `/api/v1/trips/:id/itinerary/activities/:activityId` | 3322 | Update activity | |
| DELETE | `/api/v1/trips/:id/itinerary/activities/:activityId` | 3359 | Delete activity | |
| POST | `/api/v1/trips/:id/add-to-itinerary` | 1616 | Add discovered place to itinerary | |
| POST | `/api/v1/trips/:id/expenses` | 3393 | Add expense | |
| DELETE | `/api/v1/trips/:id/expenses/:expenseId` | 3419 | Delete expense | |

### 4. `packing.routes.ts` — Packing Lists & Templates (9 endpoints)

| Method | Path | Line | Handler Summary | Notes |
|--------|------|------|----------------|-------|
| GET | `/api/v1/packing-lists` | 1856 | List packing lists | DUPLICATE at line 2750 |
| POST | `/api/v1/packing-lists` | 1867 | Create packing list | DUPLICATE at line 2761 |
| PUT | `/api/v1/packing-lists/:id` | 1879 | Update packing list | DUPLICATE at line 2773 |
| DELETE | `/api/v1/packing-lists/:id` | 1895 | Delete packing list | DUPLICATE at line 2785 |
| POST | `/api/v1/packing-lists/:id/duplicate` | 1932 | Duplicate packing list | |
| POST | `/api/v1/packing-lists/templates` | 1945 | Create template | |
| GET | `/api/v1/packing-lists/templates` | 1956 | List templates | |
| DELETE | `/api/v1/packing-lists/templates/:id` | 1967 | Delete template | |

> ⚠️ **DUPLICATES**: Packing list CRUD is defined TWICE (lines 1856-1908 and 2750-2795). The second set must be DELETED during the split.

### 5. `journal.routes.ts` — Journal Entries & Augmentation (6 endpoints)

| Method | Path | Line | Handler Summary | Notes |
|--------|------|------|----------------|-------|
| GET | `/api/v1/journal` | 1709 | List journal entries (with light mode) | |
| GET | `/api/v1/journal/:id` | 1751 | Get single entry | |
| POST | `/api/v1/journal` | 1768 | Create entry (with photo upload) | |
| PUT | `/api/v1/journal/:id` | 1788 | Update entry (with photo merge) | ⚠️ Writes to `server_debug.log` |
| DELETE | `/api/v1/journal/:id` | 1840 | Delete entry | |
| POST | `/api/v1/journal/augment` | 1476 | AI augment journal text | |

### 6. `agent.routes.ts` — AI Planning & Orchestration (5 endpoints)

| Method | Path | Line | Handler Summary | Notes |
|--------|------|------|----------------|-------|
| POST | `/api/tools/planTrip` | 3065 | Core trip planning via AI | ⚠️ Missing `/v1/` prefix |
| POST | `/api/v1/trips/generate-itinerary` | 3107 | Compatibility route for planTrip | |
| POST | `/api/v1/trips/:id/ai-recommendations` | 1494 | AI-ranked place recommendations | TANGLED — uses Google Places + AI |
| GET | `/api/v1/trips/:id/proactive-insights` | 3051 | AI proactive insights | |
| POST | `/api/v1/trips/:id/discover` | 1319 | Discover places near destination | |

### 7. `tools.routes.ts` — Weather, Currency, Translate, Emergency, Maps (20 endpoints)

| Method | Path | Line | Handler Summary | Notes |
|--------|------|------|----------------|-------|
| GET | `/api/v1/weather/random-cities` | 247 | Random city weather cards | |
| GET | `/api/v1/weather/tiles/:layer/:z/:x/:y` | 372 | Weather tile proxy | |
| GET | `/api/v1/weather/:location` | 2031 | Legacy weather (by location name) | |
| GET | `/api/v1/weather` | 2457 | New weather (lat/lon or city) | |
| GET | `/api/v1/currency/convert/:from/:to/:amount` | 2197 | Legacy currency (mock rates) | |
| GET | `/api/v1/currency` | 2735 | AI-powered currency conversion | |
| GET | `/api/v1/translate/:from/:to/:text` | 2226 | Legacy translate | |
| POST | `/api/v1/translate` | 2346 | New translate (Google API + AI) | |
| GET | `/api/v1/emergency/:location` | 2281 | Legacy emergency (by location name) | |
| GET | `/api/v1/emergency` | 2797 | New emergency (lat/lon + geocoding) | |
| GET | `/api/v1/trips/:id/hacks` | 1446 | AI travel hacks | |
| GET | `/api/v1/trips/:id/quiet-places` | 1460 | AI quiet alternatives | |
| GET | `/api/v1/geocode` | 3494 | Forward geocoding proxy | |
| GET | `/api/v1/places/search` | 3645 | Places text search | |
| GET | `/api/v1/reverse-geocode` | 3813 | Reverse geocoding proxy | |
| GET | `/api/v1/places/tourist-attractions` | 3903 | Tourist attractions (Overpass) | |
| GET | `/api/v1/config` | 1487 | Serve public API keys | |
| GET | `/api/v1/proxy-image` | 443 | Image CORS proxy | |
| GET | `/api/v1/health` | 3150 | Health check | |
| GET | `/api/v1/version` | 3459 | Version info | |
| GET | `/api/v1/liveness` | 3469 | Liveness probe | |
| GET | `/api/v1/readiness` | 3472 | Readiness probe | |
| GET | `/api/v1/tools/status` | 3478 | Tools status | |
| POST | `/api/v1/logs/info` | 2430 | Client log ingestion (info) | |
| POST | `/api/v1/logs/error` | 2444 | Client log ingestion (error) | |

### 8. `debug.routes.ts` — Debug-Only Endpoints (4 endpoints, DELETE IN PRODUCTION)

| Method | Path | Line | Handler Summary | Notes |
|--------|------|------|----------------|-------|
| POST | `/api/v1/debug/seed-crowd` | 59 | Seed crowd density data | ⚠️ No auth |
| GET | `/api/v1/debug/seed-chennai` | 1403 | Seed Chennai crowd data | ⚠️ No auth |
| GET | `/api/v1/debug/ai-test` | 1434 | Test AI service | ⚠️ No auth |
| GET/POST | `/api/v1/crowd/density` | 104/115 | In-memory crowd reports | Lines 104-135 are debug (in-memory `app.locals`) |

---

## Deferred Endpoints — Needs Manual Review

| Method | Path | Line | Reason |
|--------|------|------|--------|
| PUT | `/api/v1/trips/:id` | 1217 | TANGLED — calls `ai.planTrip()` on critical field changes. Spans trips + agent domains. Move to `trips.routes.ts` but import `ai` service. |
| POST | `/api/v1/trips/:id/ai-recommendations` | 1494 | TANGLED — calls Google Places API + Gemini/OpenAI. Move to `agent.routes.ts` but needs Google Places key logic. |
| GET/POST | `/api/v1/crowd/density` | 1369/1391 | DUPLICATE — There's ALSO a memory-based version at lines 104-135. The DB version (1369/1391) should be kept; the memory version (104-135) should be deleted. |
| PUT | `/api/v1/journal/:id` | 1788 | DEBUG CONTAMINATION — writes to `server_debug.log` (line 1803, 1827). Remove `fs.appendFileSync` calls before splitting. |

---

## Summary

| Target File | Endpoint Count | Lines Coverage |
|---|---|---|
| `auth.routes.ts` | 18 (16 unique, 2 duplicates to remove) | ~900 lines |
| `trips.routes.ts` | 9 | ~450 lines |
| `itinerary.routes.ts` | 8 | ~350 lines |
| `packing.routes.ts` | 9 (4 duplicates to remove) | ~250 lines |
| `journal.routes.ts` | 6 | ~250 lines |
| `agent.routes.ts` | 5 | ~400 lines |
| `tools.routes.ts` | 25 | ~1400 lines |
| `debug.routes.ts` (DELETE) | 4 | ~150 lines |
| **Total** | **~74** | **~4240 lines** |

### Critical Pre-Split Actions
1. DELETE duplicate `GET/PUT /api/v1/auth/user` at lines 1002-1056
2. DELETE duplicate packing list CRUD at lines 2750-2795
3. DELETE debug `server_debug.log` writes at lines 1803, 1827
4. DELETE in-memory crowd density routes at lines 104-135
5. Fix `/api/auth/apple/callback` → `/api/v1/auth/apple/callback`
6. Fix `/api/tools/planTrip` → `/api/v1/tools/planTrip`
