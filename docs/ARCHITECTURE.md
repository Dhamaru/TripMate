# TripMate — System Architecture

> **Stack**: React 18 · Express 4 · MongoDB · Socket.io · Google Gemini (every AI call — Atlas chat, multi-agent trip planning, utility calls) · PWA

---

## 1. System Overview

TripMate is a full-stack AI-driven travel planning platform. Users create trips, generate AI itineraries through a multi-agent orchestration pipeline, track budgets, write journals, and collaborate in real-time. An AI agent named **Atlas** acts as the conversational travel intelligence layer.

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (React 18)                   │
│  Wouter · TanStack Query · Zustand · Radix UI · Leaflet │
└───────────────────────┬─────────────────────────────────┘
                        │  REST /api/v1  +  Socket.io
┌───────────────────────▼─────────────────────────────────┐
│                  SERVER (Express 4)                     │
│  Cookie JWT + Session · Zod validation · Winston logging │
│  Helmet · Rate limiting · CSRF · Mongo sanitize         │
└────┬──────────────┬──────────────┬───────────────────────┘
     │              │              │
┌────▼────┐  ┌──────▼──────┐  ┌───▼─────────────────────┐
│ MongoDB │  │  Socket.io  │  │   AI Provider            │
│Mongoose │  │  (Presence/ │  │ Google Gemini            │
│  ODM    │  │  collab)    │  │ (Atlas + all utilities)  │
└─────────┘  └─────────────┘  └─────────────────────────┘
```

**Deployment:** one Node process on Render serves both the built client and the API. The Windows app (Tauri v2) and Android app (TWA) load the same hosted site.

**Single-instance by design:** Socket.io has no shared adapter, the cache is in-process `node-cache`, and the daily notification job is in-process `node-cron`. Running a second instance would split socket rooms and duplicate notifications.

**Database selection:** `MONGODB_DB_NAME` defaults to `tripmate`, the production database. Local servers must set it to something else.

---

## 2. Directory Structure

```
TripMate/
├── client/                     # React SPA
│   └── src/
│       ├── components/         # UI components (feature-grouped)
│       │   ├── agent/          # Atlas chat UI
│       │   ├── budget/         # Budget tracker
│       │   ├── collaboration/  # Presence, collaborator mgmt
│       │   ├── dashboard/      # Trip cards, filters
│       │   ├── itinerary/      # Day editor, voting, AI panels
│       │   ├── journal/        # Entry cards, AI enhance
│       │   ├── layout/         # Layout, AuthLayout, Header
│       │   └── packing/        # Smart packing list
│       ├── hooks/              # useAuth, useSocket, usePresence
│       ├── pages/              # Route-level page components
│       │   └── auth/           # SignIn, SignUp, ForgotPassword, Reset
│       ├── store/              # Zustand stores
│       └── main.tsx            # App entry
├── server/
│   ├── agent/
│   │   ├── agentLoop.ts         # Atlas: two Gemini model slots
│   │   ├── tools/handlers/      # weatherHandler, currencyHandler, placesHandler,
│   │   │                        # journalToolHandler, modifyItineraryHandler,
│   │   │                        # expenseToolHandler, collaboratorToolHandler, etc.
│   │   └── multiAgent/
│   │       ├── MasterOrchestrator.ts
│   │       └── agents/          # SuggestionAgent, HeroImageAgent, ItineraryAgent,
│   │                             # BudgetAgent, MapAgent, PackingAgent, JournalAgent
│   ├── services/                # SocketService, MultiAgentOrchestrator (itinerary generation)
│   │   └── agents/              # ResearchAgent, DraftingAgent, CriticAgent, FormattingAgent
│   ├── routes/ controllers/     # REST API
│   ├── models/                  # AgentJob, TripSuggestion (Trip.ts and User.ts have no importers;
│   │                            # the live models are in shared/schema.ts)
│   ├── scheduler.ts             # Daily notification sweep (node-cron)
│   ├── notifications.ts push.ts # In-app and web-push delivery
│   ├── auth.ts                  # Passport (Google OAuth in use), plus unused session/JWT strategies
│   ├── db.ts                    # Mongoose connection
│   ├── index.ts                 # Express app + all routes
│   ├── storage.ts               # IStorage → DatabaseStorage
│   ├── email.ts                 # Nodemailer
│   └── AiUtilitiesService.ts    # Gemini-backed weather/travel-hacks/journal AI,
│                                 # currency, translate, geocode
├── shared/
│   └── schema.ts               # Zod schemas + Mongoose models (single source of truth)
├── desktop/                    # Tauri v2 Windows wrapper
├── android/                    # Android TWA wrapper
├── tests/                      # Vitest and Playwright suites
├── .agents/
│   └── rules/                  # Always-on agent identity rules
├── .claude/
│   └── agents/                 # Claude Code sub-agent definitions
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 3. Frontend Architecture

### 3.1 Routing

```
/                       Landing (public)
/signin  /signup        Auth pages (public)
/forgot-password
/reset-password
/share/:shareId         Public shared trip
/help /privacy /terms /contact   Support pages (public)
/trips/:id              Alias for the protected trip page
/app/*                  Protected (requires auth)
  /home                 Dashboard — trip cards, quick stats
  /features             Feature overview
  /planner              TripPlanner — step-by-step trip creation
  /trips                TripsHistory — all trips list
  /trips/:id            TripDetail — itinerary, expenses, collab, Atlas
  /journal              Journal list
  /journal/:id          Journal entry detail + AI recap
  /packing              SmartPackingList
  /maps                 Maps — trip maps, offline regions, turn-by-turn navigation
  /tools                Tools hub
  /currency             CurrencyConverter
  /weather              WeatherWidget
  /translate            LanguageTranslator
  /emergency            EmergencyServices
  /profile              Profile
  /profile/crop         Image crop utility
  /sessions             Active sessions
  /feedback             Feedback form
```

Route guards: `ProtectedRoute` (checks JWT), `PublicRoute` (redirects authenticated users away from auth pages).

### 3.2 State Management

| Store        | Responsibility                       |
| ------------ | ------------------------------------ |
| `authStore`  | User identity, loading state         |
| `agentStore` | Atlas chat messages, streaming state |
| `tripStore`  | Active trip, itinerary mutations     |
| `uiStore`    | Sidebar, modals, theme               |

Server state lives in **TanStack Query** — trips, journal, collaborators, expenses all fetched & cached via query keys. `client/src/lib/queryClient.ts` is the only HTTP client.

### 3.3 AI Chat Panel (Atlas)

```
AtlasTriggerButton
  → AgentOverlayPanel
      ├── ChatHeader
      ├── ChatMessageList
      │     └── ToolCallBadge (shows tool invocations live)
      ├── TypingIndicator
      ├── SuggestedActions
      └── ChatInput
```

Atlas connects via `POST /api/v1/agent/chat` and the SSE stream `GET /api/v1/agent/chat/stream`. Messages persist to `AtlasConversation` collection, scoped per trip + user.

---

## 4. Backend Architecture

### 4.1 Middleware Stack (ordered)

```
clientIpMiddleware        → Resolves the real client IP behind the proxy
corsMiddleware
helmetMiddleware          → HTTP security headers
compression               → Gzip (outside development)
express.json / urlencoded → Body parsing
mongoSanitizeMiddleware   → NoSQL injection prevention
hppMiddleware             → HTTP parameter pollution
cookieParser
requestIdMiddleware       → UUID per request
requestLoggerMiddleware   → Winston structured logs
csrfMiddleware            → CSRF token validation
generalLimiter            → 1000 requests per 15 min per visitor
  per route: requireAuth / optionalAuth, validate(schema), specific limiters
errorHandler              → Global error handler
```

### 4.2 API Surface (`/api/v1`)

See [`API.md`](API.md) for the endpoint reference, grouped by router.

---

## 5. AI Systems

Three separate systems:

1. **Atlas chat** (`server/agent/agentLoop.ts`) — conversational tool-using agent behind `/api/v1/agent/chat`. Runs on two Gemini model slots, with a circuit breaker (`providerHealth.ts`) and per-slot token-budget admission control. Executes tools via `tools/executor.ts` (20 tools), gating destructive ones (expense removal, collaborator changes) behind a `CONFIRM_REQUIRED` step, confirmed through `POST /agent/confirm-action/:id`.
2. **MultiAgentOrchestrator** (`server/services/MultiAgentOrchestrator.ts`) — the itinerary generation pipeline. Called by `AiUtilitiesService.planTrip`, which serves `POST /trips/generate-itinerary` and `POST /planTrip`. It does not create `AgentJob` records.
3. **MasterOrchestrator** (`server/agent/multiAgent/MasterOrchestrator.ts`) — dispatches domain agents by trigger and tracks each run as an `AgentJob`. Called by `/orchestrator/*`, packing generation (`packing.controller.ts`) and Atlas's `collaborate_with_agents` tool.

**Itinerary generation (MultiAgentOrchestrator):**

```
POST /trips/generate-itinerary → AiUtilitiesService.planTrip (90s timeout)
     │
     ▼
ResearchAgent gathers context
     │
     ▼
DraftingAgent ⇄ CriticAgent, up to 3 loops
     │  the final loop loosens budget by 50% and sets the pace to Relaxed
     ▼
FormattingAgent builds and validates the plan → returned to the client

Timeout or failure → generateFallbackTrip (schema-validation fallbacks are
recorded in AiFallbackEvent)
```

**Domain agents (MasterOrchestrator):**

```
Trigger                                  Agents
dashboard_load, preferences_change   →   SuggestionAgent + HeroImageAgent
trip_create                          →   ItineraryAgent, then Budget + Packing + Map
trip_view                            →   MapAgent
journal_entry                        →   JournalAgent
packing_request                      →   PackingAgent
expense_audit                        →   BudgetAgent
chat_message                         →   Agents chosen by intent classification
```

### 5.1 Specialized Domain Agents (server/agent/multiAgent/agents/)

| Agent             | Responsibility                         |
| ----------------- | -------------------------------------- |
| `ItineraryAgent`  | Day-by-day activity generation         |
| `BudgetAgent`     | Cost breakdown, forecast               |
| `PackingAgent`    | Context-aware item generation          |
| `SuggestionAgent` | Alternative place/activity suggestions |
| `JournalAgent`    | Prose enhancement + recap generation   |
| `HeroImageAgent`  | Cover image selection                  |
| `MapAgent`        | Route + POI layer generation           |

### 5.2 Atlas Tool Ecosystem

Atlas has access to these tools at runtime:

| Area          | Tools                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| Trips         | `list_trips`, `get_trip_details`, `modify_itinerary`, `finalize_trip_plan`                 |
| Money         | `get_budget_breakdown`, `manage_expense`, `convert_currency`                               |
| Packing       | `generate_packing_list`, `manage_packing_list`                                             |
| Journal       | `create_journal_entry`, `augment_journal`                                                  |
| Collaboration | `manage_collaborator`, `collaborate_with_agents`                                           |
| Travel info   | `get_weather`, `search_places`, `get_travel_hacks`, `get_emergency_info`, `translate_text` |
| Preferences   | `get_user_preferences`, `update_user_preferences`                                          |

Definitions are in `server/agent/tools/definitions.ts`.

### 5.3 AiUtilitiesService

Centralizes non-Atlas AI/data calls:

- **Gemini only**: every AI call runs on Gemini, some through its OpenAI-compatible endpoint with the `openai` SDK as transport. This covers weather estimates, travel hacks, journal enhancement, quiet-place suggestions and schedule parsing. Emergency lookups stay non-AI (Google Places), and currency falls back to the Frankfurter API rather than an LLM guess.
- **Deduplication**: Inflight request map prevents duplicate API calls
- **Geocoding**: Place resolution + Haversine distance calculations
- **Utilities**: Weather parsing, transit constraint enforcement, emergency lookup

---

## 6. Database Schema

All models defined in `shared/schema.ts` (Zod + Mongoose).

### User

```
_id           String (nanoid, not ObjectId)
email         String (unique, sparse)
password      String (bcrypt hashed)
firstName     String
lastName      String
profileImageUrl  String
phoneNumber   String
googleId      String
googleConnected  Boolean
isGuest       Boolean
homeCity      String
dietaryPreferences  String[]
cuisinePreferences  String[]
interests     String[]
preferredTransport  String
mutedNotificationTypes  String[]
failedLoginAttempts  Number
lockUntil     Date
resetPasswordToken   String
resetPasswordExpires Date
```

### Trip

```
userId        ref:User (indexed)
destination   String (required)
origin        String
imageUrl      String
currency      String (default: INR)
budget        Number
days          Number
groupSize     Number
travelStyle   budget|standard|luxury|adventure|relaxed|family|cultural|culinary
travelStyles  Same values, multiple allowed (travelStyles[0] is the primary)
transportMode String
isInternational  Boolean
cuisinePreferences, dietaryPreferences  String[]
status        planning|active|completed
startDate     Date
endDate       Date
remindersSent String[] (milestones already sent by the scheduler)
itinerary     Mixed: [{ dayIndex, day, date, activities[], reasoning, confidenceScore }]
              Legacy trips may have day but no dayIndex; getTrip repairs these
coordsBackfillAttempted, coordsBackfillActivityCount  Map coordinate backfill state
expenses[]    { id, amount, currency, category, description, date }
collaborators[]  { userId, role: editor|viewer, joinedAt }
notes         String
aiPlanMarkdown   String
costBreakdown    Mixed
shareId       String (unique, indexed)
isPublic      Boolean
isDraft       Boolean
syncStatus    String
```

### JournalEntry

```
userId        ref:User
tripId        ref:Trip
title         String
content       String
photos[]      String
location      String
latitude      Number
longitude     Number
dayIndex      Number
contextConfidence, contextReasoning  String
isRecap       Boolean
recapMeta     { title, highlights[], memorableMoment, travelTip, awards[], visualVibe }
```

### PackingList

```
userId        ref:User
tripId        ref:Trip (optional)
name          String
season        String
items[]       { name, quantity, packed, category, is_mandatory }
isTemplate    Boolean
```

### AtlasConversation

```
tripId        String (indexed)
userId        String (indexed)
messages[]    { role, content, tool_calls, tool_call_id, name, timestamp }
metadata      { totalToolCalls, toolsUsed[], lastConfidence }
```

### Session

```
userId        ref:User
sessionId     String
tokenHash     String
device        String
ip            String
userAgent     String
expiresAt     Date
revoked       Boolean
```

### AgentJob

```
jobId         String (unique)
userId        String   (nanoid, matches User._id — NOT ObjectId)
tripId        String
trigger       String
status        pending|running|completed|failed
results[]     { success, data, error, confidence, tokensUsed, durationMs, toolCallCount, ... }
totalTokensUsed, totalDurationMs  Number
```

### TripSuggestion

```
userId        String (nanoid, matches User._id — NOT ObjectId)
destination   String
country       String
tagline       String
highlights[], travelStyle[]  String
estimatedBudget  { min, max, currency }
bestTimeToVisit, heroImageUrl, aiReasoning  String
confidenceScore  Number
status        new|viewed|dismissed|converted
userFeedback  { score, comment }
```

### MapPin

```
userId        ref:User
lat           Number
lng           Number
name          String
note          String
color         String
```

### Notification

```
userId        String
type          String
title         String
message       String
link          String
tripId        String (optional)
actorName     String
groupKey      String (collapses repeated events)
count         Number
read          Boolean
readAt        Date
expiresAt     Date (TTL, auto-deleted)
```

Saving a notification also triggers web push through a hook registered by `server/push.ts`.

### Feedback

```
type, category, subject, description, email  String (required)
userId, tripId  String (optional)
status        String (default: open)
attachments   String[]
agentReviewed, agentReviewedAt, agentPlan  Automated triage result
```

### CrowdDensity

```
latitude      Number
longitude     Number
density       Number (1-10)
placeId       String
source        user-report|external-api
TTL           7 days (auto-delete)
```

### Other models

- **PushSubscription:** `userId`, `endpoint` (unique), `keys`. One row per browser or device.
- **PackingListTemplate:** saved packing templates.
- **ImportPlanCache, ImportPlanRequestLog:** cache and request log for plan imports.
- **Migration:** run-once startup tasks, keyed by `key`.
- **AiFallbackEvent:** `destination`, `reason`, `userId`, deleted automatically after 60 days. Report with `server/scripts/ai-fallback-rate.ts`.

---

## 7. Real-Time Collaboration

**Socket.io** via `SocketService`:

```
Client joins trip room   →  auth check, then socket.join(`trip:${tripId}`)
Collaborator adds activity →  server broadcasts trip-mutation
Presence update          →  presence bubbles update for all viewers
User leaves              →  socket.leave + presence cleanup
```

Events:

- Client to server: `join-trip`, `leave-trip`
- Trip room (`trip:<id>`): `presence-update`, `trip-mutation` (with a `type` such as `itinerary-updated`), `atlas-thinking`
- User room (`user:<id>`): `notification`, `notification-read`, `notification-deleted`

Collaborative writes use atomic `$push`/`$pull`/`$set` rather than `.save()`, so concurrent edits don't overwrite each other. `modifyItineraryHandler.ts` is the exception and uses compare-and-swap on `updatedAt`.

### Notifications

In-app notifications, web push (VAPID) and email (Resend, then SMTP) are delivered from `notifications.ts`, `push.ts` and `email.ts`. `scheduler.ts` runs once a day at 09:00 for pre-trip reminders, in-trip digests and post-trip prompts, using `trip.remindersSent` to avoid repeats.

---

## 8. Authentication & Security

### Auth Flow

```
1. POST /auth/signup  →  hash password (bcrypt 12) → create User + Session
2. POST /auth/signin  →  verify password → issue JWT (7d expiry) as an httpOnly
                          cookie (`token`) + Session record
3. Request           →  cookie sent automatically by the browser (primary path);
                          an `Authorization: Bearer <token>` header is also
                          accepted as a fallback, but the SPA itself never sends one
4. requireAuth       →  verify JWT → check Session not revoked/expired → attach req.user
5. POST /auth/signout →  revoke Session record (jwt.verify, not decode — a forged
                          token cannot be used to revoke an arbitrary session)
```

Google OAuth: Passport `google-oauth20` strategy → upsert User → same JWT flow. Route protection is always `requireAuth`/`optionalAuth`; the Passport local and JWT strategies and the `express-session` setup in `server/auth.ts` are still present, but no route guards use them.

### Security Layers

| Layer               | Implementation                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Password            | bcrypt (12 rounds)                                                                                                           |
| Auth token          | JWT (HS256, 7d)                                                                                                              |
| Rate limiting       | `express-rate-limit`, general plus per-route limiters (see `API.md`)                                                         |
| CSRF                | Token-based middleware                                                                                                       |
| SQL/NoSQL injection | `express-mongo-sanitize`                                                                                                     |
| HTTP headers        | `helmet`                                                                                                                     |
| Param pollution     | `hpp`                                                                                                                        |
| Session tracking    | `Session` model (per-device, revocable)                                                                                      |
| Login brute-force   | `failedLoginAttempts` + `lockUntil`                                                                                          |
| File uploads        | `multer` (memory storage) + 2MB limit, avatars stored base64-in-Mongo (Render's disk is ephemeral — no local `/uploads` dir) |

---

## 9. Build & Infrastructure

### Build Pipeline

```
npm run dev:server  →  API on port 5000
npm run dev:client  →  Vite on port 3000
npm run dev         →  both through concurrently (flaky in some environments; prefer the two above)
npm run build       →  vite build (client) + esbuild (server → dist/index.js)
npm start           →  node dist/index.js
npm test            →  vitest run
npm run test:e2e    →  playwright test
```

### Vite Config Highlights

- PWA via `vite-plugin-pwa` (`injectManifest`), with a custom service worker in `client/src/sw.ts`
- Runtime caching: Weather (CacheFirst), Trips (NetworkFirst), map tiles (CacheFirst)
- Proxy `/api` → `http://127.0.0.1:5000`
- Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`

### Environment Variables

```
MONGODB_URI          MongoDB connection string
MONGODB_DB_NAME      Database name; defaults to tripmate (production)
JWT_SECRET           JWT signing key
SESSION_SECRET       Session signing key
GEMINI_API_KEY       Powers every AI call in the app (Atlas, trip planning,
                      utilities) — must be an AI-Studio-issued key, not a
                      plain Cloud Console key
GOOGLE_API_KEY       Places / Maps / Cloud Translation
OPENWEATHER_API_KEY  Weather API
GOOGLE_CLIENT_ID     OAuth
GOOGLE_CLIENT_SECRET OAuth
RESEND_API_KEY       Email (tried first)
SMTP_HOST/PORT/USER/PASS/FROM_EMAIL  Email through Nodemailer
VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT Web push
ADMIN_SECRET         Admin-only feedback routes
RATE_LIMIT_*, AI_RATE_LIMIT_*, GENERATION_RATE_LIMIT_*  Rate-limit tuning
PORT                 Express port (default 5000)
```

See `server/config.ts` for the complete, authoritative list.

---

## 10. Key Data Flows

### Trip Creation + AI Itinerary

```
TripPlanner (client)
  → POST /api/v1/trips/generate-itinerary
  → AiUtilitiesService.planTrip → MultiAgentOrchestrator (see section 5)
  → Response: the generated plan, for the user to review
  → POST /api/v1/trips saves the trip
  → TripDetail page renders the itinerary
```

### Journal AI Enhancement

```
Journal entry
  → POST /api/v1/journal/:id/enhance
  → journal_ai.controller.ts (runJournalAgent)
  → Returns: proposed text
  → POST /api/v1/journal/:id/enhance/confirm saves it

Trip recap: POST /api/v1/journal/recap/:tripId
```

### Real-Time Collab

```
User A adds activity (POST /api/v1/trips/:id/itinerary/activity)
  → Atomic DB update
  → SocketService broadcasts trip-mutation to the trip room
  → User B's TripDetail page receives the event
  → UI updates with the new activity
```

---

## 11. Scalability Considerations

| Concern         | Current Solution                                               |
| --------------- | -------------------------------------------------------------- |
| AI latency      | Streaming SSE responses + two Gemini model slots               |
| DB load         | MongoDB indexes on userId, tripId, shareId                     |
| API rate limits | General and per-route limiters + AI request deduplication      |
| Cache           | In-process `node-cache` (lost on restart, not shared)          |
| Scheduled jobs  | In-process `node-cron` (single instance only)                  |
| Asset uploads   | Multer (memory) → base64-in-Mongo (Render's disk is ephemeral) |
| PWA offline     | Workbox service worker                                         |
| Real-time scale | Socket.io room-based (single instance)                         |

---

## 12. Agent Identity (`.agents/rules/`)

All AI responses in TripMate are governed by `prompt-constrains.md`:

- **Identity**: Atlas — cognitive travel intelligence, not a template engine
- **Mode**: Goal-driven, feasibility-driven, reasoning-driven
- **Output**: Structured data only (no freeform explanations to UI)
- **Capabilities**: Constraint inference, feasibility modeling, preference learning, self-correction
- **Cognitive model**: Trips as constrained optimization problems; cities as spatial-experiential graphs
