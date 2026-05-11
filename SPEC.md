# SPEC.md — Phase 0: Full Codebase Audit & Cleanup Plan

**Status: FINALIZED**
**Date: 2026-03-04**
**Scope: TripMate full-stack codebase audit prior to agentic AI upgrade**

---

## 1. DIRECTORY STRUCTURE

```
TripMate/
├── client/src/                  # React + TypeScript frontend (121+ files)
│   ├── components/              # UI components
│   │   ├── ui/                  # Radix-based shadcn/ui primitives (~50 files)
│   │   ├── layout/              # AuthLayout.tsx, Layout.tsx
│   │   ├── budget/              # BudgetTracker.tsx
│   │   ├── itinerary/           # ItineraryManager.tsx, ActivityFormDialog.tsx
│   │   ├── agent/               # (empty — to be built in Phase 3)
│   │   ├── AuthModal.tsx, AuthProvider.tsx, ProtectedRoute.tsx, PublicRoute.tsx
│   │   ├── CurrencyConverter.tsx, EmergencyServices.tsx, LanguageTranslator.tsx
│   │   ├── LocationDiscovery.tsx, OfflineMaps.tsx, PackingList.tsx
│   │   ├── TripMap.tsx, TripMateLogo.tsx, WeatherCard.tsx, WeatherWidget.tsx
│   │   ├── VirtualPreview.tsx, SortablePackingItem.tsx, QuantityControl.tsx
│   │   └── ErrorBoundary.tsx
│   ├── pages/                   # Route-level pages
│   │   ├── Landing.tsx, Home.tsx, TripPlanner.tsx, TripDetail.tsx
│   │   ├── Journal.tsx, CropImage.tsx, NotFound.tsx
│   │   └── auth pages (SignIn, SignUp, ForgotPassword, ResetPassword)
│   ├── hooks/                   # Custom hooks (use-toast, use-mobile, etc.)
│   ├── lib/                     # Utilities, queryClient, protected-fetch
│   │   ├── GraceAuthService.ts  # Offline auth grace period
│   │   └── SyncEngine.ts        # Differential sync engine
│   ├── App.tsx, main.tsx
│   └── index.css
├── server/                      # Express + TypeScript backend (19 files)
│   ├── index.ts                 # Entry point (108 lines)
│   ├── routes.ts                # ALL routes in single file (4240 lines) ⚠️
│   ├── AiUtilitiesService.ts    # AI orchestration (1626 lines)
│   ├── storage.ts               # IStorage interface + DatabaseStorage (318 lines)
│   ├── auth.ts                  # Passport.js setup (163 lines)
│   ├── db.ts                    # MongoDB connection (18 lines)
│   ├── email.ts                 # Nodemailer SMTP (184 lines)
│   ├── vite.ts                  # Vite dev/static serving
│   ├── debug_journal.ts         # Debug utility
│   └── services/                # Multi-agent orchestration layer
│       ├── MultiAgentOrchestrator.ts
│       ├── FeasibilityModeler.ts
│       ├── PlanValidator.ts
│       ├── ReasoningEngine.ts
│       ├── UserMemoryService.ts
│       └── agents/ (CriticAgent, DraftingAgent, FormattingAgent, ResearchAgent, utils)
├── shared/
│   └── schema.ts                # Mongoose models + Zod schemas (461 lines)
├── uploads/                     # User-uploaded files
├── tests/                       # Test directory (exists but sparse)
├── scripts/                     # install.ps1, install.sh, reset_users.ts
├── docs/                        # USER-GUIDE.md
└── Config files: tsconfig.json, vite.config.ts, vitest.config.ts,
    tailwind.config.ts, postcss.config.js, package.json
```

---

## 2. DEAD CODE / UNUSED FILES

| File | Issue |
|---|---|
| `debug_dump.json` (268KB) | Debug artifact, should not be in repo |
| `debug_gemini.ts` | One-off debug script |
| `debug_geocode.js` | One-off JS debug script (not TS) |
| `server/debug_journal.ts` | Debug utility for journal |
| `check_env.ts` | One-off env checker |
| `test-multi-agent-loop.ts` | Orphaned test script |
| `tsc_errors.txt` / `tsc_errors_final.txt` | Build log artifacts |
| `build_error.log` | Build log artifact |
| `server_debug.log` (13.8MB!) | Massive debug log in repo root |
| `client/src/components/VirtualPreview.tsx` | Untracked, may be unused |
| `client/src/lib/GraceAuthService.ts` | Untracked, offline auth — verify usage |
| `client/src/lib/SyncEngine.ts` | Untracked, diff sync — verify usage |

---

## 3. `any` TYPE USAGE (17 files affected)

Every server file uses `: any` extensively:

| File | Severity |
|---|---|
| `routes.ts` | CRITICAL — `req: any, res: any` in optionalAuth, generateAccessToken, keyGenerator, setRefreshCookie; `plan: any` throughout |
| `AiUtilitiesService.ts` | HIGH — `plan: any` in enforceTransitConstraints, `CacheEntry<any>` |
| `storage.ts` | MEDIUM — `createPackingListTemplate(data: any): Promise<any>` |
| `auth.ts` | MEDIUM — `jwtPayload: any, done: any`, `user: any` in serialize/deserialize |
| `email.ts` | LOW — `(config as any).family`, `error: any` catch blocks |
| `index.ts` | LOW — `err: any`, `Record<string, any>` |
| All `services/agents/*.ts` | HIGH — pervasive `any` in agent layer |
| `services/*.ts` | HIGH — `any` in Orchestrator, Validator, FeasibilityModeler |

---

## 4. INCONSISTENT NAMING

| Issue | Location | Fix |
|---|---|---|
| `Google_Gemini_Key` (PascalCase) | `AiUtilitiesService.ts:27`, `routes.ts:1547` | Rename to `GEMINI_API_KEY` |
| Mixed env var names for same key | `GOOGLE_PLACES_API_KEY` vs `GOOGLE_API_KEY` everywhere | Standardize to one |
| `GOOGLE_MAPS_API_KEY` referenced | `routes.ts:1489` | Same key as Places? Clarify |
| `TRANSLATE_API_URL` / `TRANSLATE_API_KEY` | `routes.ts:2229-2230` | Not in .env — dead reference? |
| `en(s)`, `es(s)`, etc. | Inline language abbreviation functions in both `routes.ts` AND `AiUtilitiesService.ts` | Duplicate logic — extract |

---

## 5. ENVIRONMENT VARIABLES

### Discovered (17 distinct keys):
| Variable | Used In | In .env? |
|---|---|---|
| `MONGODB_URI` | `db.ts`, `routes.ts` | ✅ |
| `OPENAI_API_KEY` | `AiUtilitiesService.ts`, `routes.ts` | ✅ |
| `Google_Gemini_Key` / `GEMINI_API_KEY` | `AiUtilitiesService.ts`, `routes.ts` | ✅ (inconsistent name) |
| `GOOGLE_PLACES_API_KEY` / `GOOGLE_API_KEY` | `routes.ts`, `AiUtilitiesService.ts` | ✅ |
| `SESSION_SECRET` | `auth.ts` | ⚠️ Hardcoded fallback |
| `JWT_SECRET` | `auth.ts`, `routes.ts` | ⚠️ Hardcoded fallback |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `auth.ts`, `routes.ts` | ✅ |
| `APPLE_CLIENT_ID` | `routes.ts` | ❓ Unknown |
| `FRONTEND_URL` | `auth.ts`, `email.ts`, `routes.ts` | ⚠️ Hardcoded fallback |
| `OPENWEATHER_API_KEY` | `routes.ts` | ❓ Check |
| `WEATHER_API_KEY` | `AiUtilitiesService.ts` | ❓ Check |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_PORT` / `SMTP_FROM_EMAIL` | `email.ts` | ✅ |
| `TRANSLATE_API_URL` / `TRANSLATE_API_KEY` | `routes.ts` | ❌ Not in .env |
| `NODE_ENV` | `index.ts`, `email.ts`, `routes.ts` | Auto |
| `PORT` | `index.ts` | Default 5000 |
| `CLUSTER` / `CLUSTER_WORKERS` | `index.ts` | Optional |
| `GOOGLE_MAPS_API_KEY` | `routes.ts:1489` | ❓ Unclear if separate |
| `GOOGLE_TRANSLATE_API_KEY` | `routes.ts:2351` | ❓ Another variant |

**⚠️ CRITICAL**: `SESSION_SECRET` and `JWT_SECRET` have hardcoded fallbacks (`"your-session-secret-key"`, `"your-jwt-secret-key"`). These MUST crash on missing in production.

---

## 6. API ROUTES

All routes are registered inside the single `registerRoutes()` function in `routes.ts` (4240 lines). Route patterns found with `app.post/get/put/patch/delete`:

### Auth
- `POST /api/v1/auth/register` — Local signup
- `POST /api/v1/auth/login` — Local login
- `POST /api/v1/auth/logout` — Logout
- `GET /api/v1/auth/me` — Current user
- `POST /api/v1/auth/refresh` — Refresh JWT
- `GET /api/v1/auth/google` — Google OAuth initiate
- `GET /api/v1/auth/google/callback` — Google OAuth callback
- `GET /api/v1/auth/apple` — Apple OAuth initiate
- `POST /api/v1/auth/apple/callback` — Apple OAuth callback
- `GET /api/v1/auth/providers` — Available auth providers
- `POST /api/v1/auth/forgot-password` — Password reset request
- `POST /api/v1/auth/reset-password` — Password reset execute

### User
- `PUT /api/v1/user/profile` — Update profile
- `POST /api/v1/user/profile-image` — Upload profile image
- `DELETE /api/v1/user/profile-image` — Remove profile image

### Trips
- `GET /api/v1/trips` — List user trips
- `POST /api/v1/trips` — Create trip
- `GET /api/v1/trips/:id` — Get trip detail
- `PUT /api/v1/trips/:id` — Update trip
- `DELETE /api/v1/trips/:id` — Delete trip
- `PATCH /api/v1/trips/:id/sync` — Differential sync
- `DELETE /api/v1/trips` — Delete all trips
- `GET /api/v1/trips/:id/image` — Get trip image

### Itinerary
- `PUT /api/v1/trips/:id/itinerary` — Update itinerary
- `POST /api/v1/trips/:id/activities` — Add activity

### Journal
- `GET /api/v1/journal` — List journal entries
- `GET /api/v1/journal/trip/:tripId` — Trip journal entries
- `POST /api/v1/journal` — Create journal entry
- `PUT /api/v1/journal/:id` — Update journal entry
- `DELETE /api/v1/journal/:id` — Delete journal entry

### Packing
- `GET /api/v1/packing` — List packing lists
- `POST /api/v1/packing` — Create packing list
- `PUT /api/v1/packing/:id` — Update packing list
- `DELETE /api/v1/packing/:id` — Delete packing list
- `POST /api/v1/packing/:id/duplicate` — Duplicate packing list
- `POST /api/v1/packing/templates` — Create template
- `GET /api/v1/packing/templates` — List templates
- `DELETE /api/v1/packing/templates/:id` — Delete template

### AI / Tools
- `POST /api/v1/tools/planTrip` — AI trip planning (main)
- `POST /api/v1/tools/weather` — Weather lookup
- `POST /api/v1/tools/currency` — Currency conversion
- `POST /api/v1/tools/translate` — Translation
- `POST /api/v1/tools/emergency` — Emergency services lookup
- `POST /api/v1/tools/packing` — AI packing list generation
- `GET /api/v1/tools/travel-hacks` — Travel hacks
- `POST /api/v1/tools/trip-suggestions` — AI trip suggestions

### Places / Maps
- `GET /api/v1/places/search` — Google Places search
- `GET /api/v1/places/nearby` — Nearby places
- `GET /api/v1/places/details/:id` — Place details
- `GET /api/v1/maps/key` — Maps API key
- `GET /api/v1/places/discovery` — Location discovery
- `POST /api/v1/places/geocode` — Geocoding

### Debug
- `POST /api/v1/debug/seed-crowd` — Seed crowd density data

---

## 7. MONGOOSE MODELS (from `shared/schema.ts`)

| Model | Key Fields | Indexes |
|---|---|---|
| **UserModel** (`IUser`) | `_id (string)`, email, password, firstName, lastName, profileImageUrl, phoneNumber, resetPasswordToken, resetPasswordExpires, isGuest | `_id` |
| **SessionModel** (`ISession`) | userId, sessionId, tokenHash, device, ip, userAgent, expiresAt, revoked | `userId+sessionId` (unique), `userId`, `sessionId` |
| **TripModel** (`ITrip`) | userId, destination, imageUrl, currency, budget, days, groupSize, travelStyle, transportMode, isInternational, status, startDate, endDate, itinerary[], expenses[], notes, aiPlanMarkdown, isDraft, syncStatus, costBreakdown | `userId` |
| **JournalEntryModel** (`IJournalEntry`) | userId, tripId, title, content, photos[], location, latitude, longitude, dayIndex | `userId`, `tripId` |
| **PackingListModel** (`IPackingList`) | userId, tripId, name, season, items[], isTemplate | `userId` |
| **PackingListTemplateModel** (`IPackingListTemplate`) | userId, name, category, items[] | `userId` |

All schemas use `timestamps: true` and `baseToJSON` transform (removes `__v`, renames `_id` → `id`). ✅

---

## 8. AI CALLS (OpenAI + Gemini)

### OpenAI (gpt-4o-mini via `AiUtilitiesService`)
| Method | Purpose | Model |
|---|---|---|
| `planTrip()` | Generate full itinerary JSON | gpt-4o-mini |
| `translate()` | Language translation | gpt-4o-mini |
| `weather()` (fallback) | Weather when API fails | gpt-4o-mini |
| `currency()` (fallback) | Currency when API fails | gpt-4o-mini |
| `emergency()` | Emergency services lookup | gpt-4o-mini |
| `getProactiveInsights()` | Weather→packing cross-ref | gpt-4o-mini |
| `weatherTool()` | Structured weather data | gpt-4o-mini |
| `getTravelHacks()` | Travel hacks for destination | gpt-4o-mini |
| `getSmartPacking()` | Context-aware packing items | gpt-4o-mini |

### Gemini (via `generateWithGemini()`)
| Location | Purpose |
|---|---|
| `AiUtilitiesService.generateWithGemini()` | Fallback generation |
| `routes.ts generateMarkdownGemini()` | Emergency info markdown |
| `routes.ts` translate endpoint | Translation fallback |
| `routes.ts` places/discovery | AI-powered location descriptions |

### Multi-Agent Orchestrator (`services/`)
| Agent | Role |
|---|---|
| `ResearchAgent` | Gathers travel data |
| `DraftingAgent` | Drafts itinerary |
| `CriticAgent` | Reviews and critiques plans |
| `FormattingAgent` | Formats final output |
| `FeasibilityModeler` | Validates feasibility |
| `PlanValidator` | Validates plan structure |
| `ReasoningEngine` | CoT reasoning for decisions |
| `UserMemoryService` | User preference memory |

---

## 9. BUDGET ENGINE LOGIC

Located in `AiUtilitiesService.planTrip()` — deterministic allocation:

- **10% safety buffer** deducted from total budget
- Remaining allocated by travel style percentages:
  - Budget: 25% accommodation, 30% food, 20% transport, 15% activities, 10% misc
  - Standard: 35% accommodation, 25% food, 15% transport, 15% activities, 10% misc
  - Luxury: 40% accommodation, 20% food, 10% transport, 20% activities, 10% misc
  - Adventure: 20% accommodation, 20% food, 25% transport, 25% activities, 10% misc
  - Cultural: 25% accommodation, 25% food, 15% transport, 25% activities, 10% misc
- Per-day budgets computed and passed to AI prompt as hard constraints
- `costBreakdown` object saved to Trip model

---

## 10. DnD CHRONOLOGICAL VALIDATION LOGIC

Located in `client/src/components/itinerary/ItineraryManager.tsx`:

- Uses `@dnd-kit/core` + `@dnd-kit/sortable`
- Activities can be dragged between days
- On drop: validates that the time ordering remains chronological within a day
- If a conflict is detected, activities are re-sorted by their `time` field
- Supports adding activities via `ActivityFormDialog.tsx` with location search (Google Places geocoding)

---

## 11. AUTH FLOW (Passport.js)

```
Signup → POST /api/v1/auth/register → bcrypt hash → upsertUser → JWT access + refresh tokens
Login  → POST /api/v1/auth/login → LocalStrategy → bcrypt compare → JWT tokens
Google → GET /api/v1/auth/google → GoogleStrategy → OAuth → upsertUser → JWT redirect
Apple  → GET /api/v1/auth/apple → AppleStrategy → OAuth → upsertUser → JWT redirect
Refresh → POST /api/v1/auth/refresh → Validate refresh cookie hash → New JWT
Logout → POST /api/v1/auth/logout → Revoke session in DB → Clear cookies
```

JWT tokens signed with `JWT_SECRET`, refresh tokens stored as hashed values in SessionModel.

---

## CLEANUP PLAN (Post-Audit Actions)

### Priority 1: Critical
- [ ] Harden env vars — crash on missing `SESSION_SECRET`, `JWT_SECRET` in production
- [ ] Standardize env var names (`Google_Gemini_Key` → `GEMINI_API_KEY`, consolidate `GOOGLE_*` keys)
- [ ] Create `/server/config/env.ts` with Zod validation
- [ ] Replace all `process.env` direct access with `config.X`

### Priority 2: High
- [ ] Enable `strict: true` in `tsconfig.json`
- [ ] Replace all `: any` with proper interfaces (17 files)
- [ ] Create `/src/types/` domain type files
- [ ] Split `routes.ts` (4240 lines) into domain route files
- [ ] Add ESLint + Prettier configs

### Priority 3: Medium
- [ ] Remove dead files (debug_*, build_error.log, server_debug.log, tsc_errors*)
- [ ] Extract duplicate language-abbreviation functions into shared utility
- [ ] Add indexes for `TripModel` fields used in queries
- [ ] Add `.lean()` to read-heavy Mongoose queries
- [ ] Add retry logic to MongoDB connection

### Priority 4: Low
- [ ] Create `.env.example` with all variables documented
- [ ] Add compression middleware
- [ ] Move `uploads/` to cloud storage
- [ ] Investigate `TRANSLATE_API_URL`/`TRANSLATE_API_KEY` (likely dead)

---

**This SPEC is FINALIZED. Ready for conversion to PRD.md tasks for Ralph execution.**
