# TripMate — System Architecture

> **Stack**: React 18 · Express 4 · MongoDB · Socket.io · OpenRouter → Groq → NVIDIA NIM×2 fallback chain (Atlas) + Gemini (utility calls, OpenAI wired but unfunded) · PWA

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
│  Passport JWT · Zod validation · Winston logging        │
│  Helmet · Rate limiting · CSRF · Mongo sanitize         │
└────┬──────────────┬──────────────┬───────────────────────┘
     │              │              │
┌────▼────┐  ┌──────▼──────┐  ┌───▼─────────────────────┐
│ MongoDB │  │  Socket.io  │  │   AI Providers           │
│Mongoose │  │  (Presence/ │  │ OpenRouter→Groq→NVIDIA×2 │
│  ODM    │  │  collab)    │  │ (Atlas) + Gemini (utils) │
└─────────┘  └─────────────┘  └─────────────────────────┘
```

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
│   │   ├── agentLoop.ts         # Atlas: OpenRouter→Groq→NVIDIA×2 fallback chain
│   │   ├── tools/handlers/      # weatherHandler, currencyHandler, placesHandler,
│   │   │                        # journalToolHandler, modifyItineraryHandler,
│   │   │                        # expenseToolHandler, collaboratorToolHandler, etc.
│   │   └── multiAgent/
│   │       ├── MasterOrchestrator.ts
│   │       └── agents/          # SuggestionAgent, HeroImageAgent, ItineraryAgent,
│   │                             # BudgetAgent, MapAgent, PackingAgent, JournalAgent
│   ├── services/                # Business logic (SocketService, etc.)
│   ├── auth.ts                  # Passport (Google OAuth only) + JWT setup
│   ├── db.ts                    # Mongoose connection
│   ├── index.ts                 # Express app + all routes
│   ├── storage.ts               # IStorage → DatabaseStorage
│   ├── email.ts                 # Nodemailer
│   └── AiUtilitiesService.ts    # Gemini-backed weather/travel-hacks/journal AI,
│                                 # currency, translate, geocode
├── shared/
│   └── schema.ts               # Zod schemas + Mongoose models (single source of truth)
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
/app/*                  Protected (requires JWT)
  /home                 Dashboard — trip cards, quick stats
  /planner              PlannerWizard — step-by-step trip creation
  /trips                TripsHistory — all trips list
  /trips/:id            TripDetail — itinerary, expenses, collab, Atlas
  /journal              Journal list
  /journal/:id          Journal entry detail + AI recap
  /packing              SmartPackingList
  /maps                 TripMap (Leaflet)
  /tools                Tools hub
  /currency             CurrencyConverter
  /weather              WeatherWidget
  /translate            LanguageTranslator
  /emergency            EmergencyServices
  /profile              Profile + active sessions
  /crop-image           Image crop utility
  /feedback             Feedback form
```

Route guards: `ProtectedRoute` (checks JWT), `PublicRoute` (redirects authenticated users away from auth pages).

### 3.2 State Management

| Store          | Responsibility                       |
| -------------- | ------------------------------------ |
| `authStore`    | User identity, token, loading state  |
| `agentStore`   | Atlas chat messages, streaming state |
| `tripStore`    | Active trip, itinerary mutations     |
| `packingStore` | Packing list items, templates        |
| `uiStore`      | Sidebar, modals, theme               |

Server state lives in **TanStack Query** — trips, journal, collaborators, expenses all fetched & cached via query keys.

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

Atlas connects via `POST /api/v1/agent/chat` (streaming SSE). Messages persist to `AtlasConversation` collection, scoped per trip + user.

---

## 4. Backend Architecture

### 4.1 Middleware Stack (ordered)

```
corsMiddleware
helmetMiddleware          → HTTP security headers
mongoSanitizeMiddleware   → NoSQL injection prevention
hppMiddleware             → HTTP parameter pollution
requestIdMiddleware       → UUID per request
requestLoggerMiddleware   → Winston structured logs
csrfMiddleware            → CSRF token validation
generalLimiter            → Rate limiting (per IP)
requireAuth               → JWT verification (protected routes)
validate(schema)          → Zod request validation
cacheMiddleware           → Response caching (TTL-based)
errorHandler              → Global async error handler
```

### 4.2 API Surface (`/api/v1`)

**Auth**

| Method      | Path                        | Description                              |
| ----------- | --------------------------- | ---------------------------------------- |
| POST        | `/auth/signup`              | Register                                 |
| POST        | `/auth/signin`              | Login → JWT                              |
| POST        | `/auth/logout`              | Revoke session                           |
| POST        | `/auth/forgot-password`     | Email reset link                         |
| POST        | `/auth/reset-password`      | Consume token                            |
| GET         | `/auth/google/callback`     | OAuth callback                           |
| GET         | `/auth/me`                  | Current user                             |
| GET         | `/auth/sessions`            | List active sessions (per-device)        |
| POST        | `/auth/sessions/:id/revoke` | Revoke a session                         |
| GET         | `/auth/user/export`         | Full data export (GDPR)                  |
| POST/DELETE | `/auth/delete-account`      | Delete account (cascades all owned data) |

**Trips**

| Method | Path                         | Description                 |
| ------ | ---------------------------- | --------------------------- |
| GET    | `/trips`                     | User's trips (incl. collab) |
| POST   | `/trips`                     | Create trip                 |
| GET    | `/trips/:id`                 | Trip detail                 |
| PUT    | `/trips/:id`                 | Update trip                 |
| DELETE | `/trips/:id`                 | Delete trip                 |
| POST   | `/trips/:id/share`           | Toggle public share         |
| GET    | `/trips/public/:shareId`     | Public view                 |
| POST   | `/trips/generate-itinerary`  | **AI pipeline**             |
| POST   | `/trips/parse-schedule`      | Parse raw schedule text     |
| GET    | `/trips/:id/hacks`           | Travel hacks                |
| GET    | `/trips/:id/budget-forecast` | AI budget prediction        |

**Itinerary**

| Method | Path                             | Description     |
| ------ | -------------------------------- | --------------- |
| POST   | `/itinerary/:id/activity`        | Add activity    |
| PUT    | `/itinerary/:id/activity/:actId` | Edit activity   |
| DELETE | `/itinerary/:id/activity/:actId` | Remove activity |
| PUT    | `/itinerary/:id/reorder`         | Drag-reorder    |
| POST   | `/itinerary/:id/vote`            | Vibe vote       |

**Atlas Agent**

| Method | Path                     | Description          |
| ------ | ------------------------ | -------------------- |
| POST   | `/agent/chat`            | Send message         |
| GET    | `/agent/chat/stream`     | SSE response stream  |
| GET    | `/agent/history/:tripId` | Conversation history |
| DELETE | `/agent/history/:tripId` | Clear history        |

**Orchestrator**

| Method | Path                        | Description          |
| ------ | --------------------------- | -------------------- |
| POST   | `/orchestrator/run`         | Sync multi-agent run |
| POST   | `/orchestrator/stream`      | Streaming run        |
| GET    | `/orchestrator/jobs`        | Job history          |
| GET    | `/orchestrator/jobs/:jobId` | Job status           |

**Other**

- `/journal` — CRUD + `/journal/:id/ai-enhance`
- `/packing` — CRUD + duplicate + templates
- `/expenses` — CRUD on trip
- `/collaborators` — CRUD on trip
- `/places` — search, autocomplete, nearby, `/places/photo` (server-side Google Photos proxy — key never reaches client)
- `/map-pins` — CRUD custom map pins
- `/suggestions` — AI-generated trip suggestions (via MasterOrchestrator/SuggestionAgent)
- `/weather`, `/currency-convert`, `/translate`, `/emergency-contacts`
- `/crowd` — report + heatmap
- `/feedback`
- `/tools/public/stats`, `/tools/public/top-destinations` — landing page live stats (excludes QA/guest accounts)
- `/notifications` — list, mark-read, mute preferences

---

## 5. Multi-Agent AI Pipeline

Two separate systems, both under `server/agent/`:

1. **Atlas chat** (`agentLoop.ts`) — conversational tool-using agent behind `/api/v1/agent/chat`. Provider fallback chain: OpenRouter → Groq → NVIDIA NIM×2, with a circuit breaker (`providerHealth.ts`) and per-provider token-budget admission control. Executes tools via `Tool Executor` (~19 tools), gating destructive ones (expense removal, collaborator changes) behind a `CONFIRM_REQUIRED` step.
2. **MasterOrchestrator** (`server/agent/multiAgent/MasterOrchestrator.ts`) — a separate, non-chat pipeline that dispatches to specialized domain agents and tracks each run as an `AgentJob` record:

```
Client request (e.g. generate itinerary, suggest activities)
     │
     ▼
MasterOrchestrator.run()
     │  creates AgentJob (status: pending → running)
     ▼
Dispatches to one of:
  SuggestionAgent | HeroImageAgent | ItineraryAgent |
  BudgetAgent | MapAgent | PackingAgent | JournalAgent
     │
     ▼
AgentJob (status: completed|failed, result stored)  →  DB + Client
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

| Tool                     | Function                      |
| ------------------------ | ----------------------------- |
| `get_weather`            | Forecast for destination      |
| `convert_currency`       | Exchange rates                |
| `translate_text`         | Real-time translation         |
| `search_places`          | POI search via geocoding      |
| `get_emergency_contacts` | Emergency services by country |
| `get_trip`               | Load trip context             |
| `update_itinerary`       | Write activity changes        |
| `get_budget`             | Fetch expense data            |
| `get_packing_list`       | Fetch/update packing items    |
| `get_user_preferences`   | Memory + travel style         |

### 5.3 AiUtilitiesService

Centralizes non-Atlas AI/data calls:

- **Provider fan-out**: OpenAI (if funded) → Gemini fallback (`generateWithGemini`, `gemini-3.5-flash-lite`) for weather AI-estimates, travel hacks, journal enhancement, quiet-place suggestions, schedule parsing. Currency and emergency-contact lookups deliberately stay non-AI (Frankfurter API, Google Places) rather than falling back to an LLM guess.
- **Deduplication**: Inflight request map prevents duplicate API calls
- **Geocoding**: Place resolution + Haversine distance calculations
- **Utilities**: Weather parsing, transit constraint enforcement, emergency lookup

---

## 6. Database Schema

All models defined in `shared/schema.ts` (Zod + Mongoose).

### User

```
_id           String (email-based for JWT users)
email         String (unique, indexed)
password      String (bcrypt hashed)
firstName     String
lastName      String
profileImageUrl  String
phoneNumber   String
googleId      String
googleConnected  Boolean
isGuest       Boolean
homeCity      String
travelStyle   String
dietaryPreferences  String[]
interests     String[]
preferredTransport  String
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
transportMode String
isInternational  Boolean
status        planning|active|completed
startDate     Date
endDate       Date
itinerary[]   { dayIndex, day, date, activities[], reasoning, confidenceScore }
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
status        pending|running|completed|failed
result        Mixed
metadata      Mixed
```

### TripSuggestion

```
userId        String (nanoid, matches User._id — NOT ObjectId)
tripId        String
type          String
data          Mixed
```

### MapPin

```
userId        ref:User
tripId        ref:Trip
latitude      Number
longitude     Number
label         String
category      String
```

### Notification

```
userId        ref:User
type          String
title         String
body          String
read          Boolean
tripId        ref:Trip (optional)
```

### Feedback

```
userId        ref:User
message       String
category      String
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

---

## 7. Real-Time Collaboration

**Socket.io** via `SocketService`:

```
Client joins trip room   →  socket.join(`trip:${tripId}`)
Collaborator adds activity →  server broadcasts mutation event
Presence update          →  presence bubbles update for all viewers
User leaves              →  socket.leave + presence cleanup
```

Events:

- `trip:join` / `trip:leave`
- `itinerary:update` / `activity:add` / `activity:remove`
- `presence:update`
- `expense:update`

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
5. POST /auth/logout  →  revoke Session record (jwt.verify, not decode — a forged
                          token cannot be used to revoke an arbitrary session)
```

Google OAuth: Passport `google-oauth20` strategy → upsert User → same JWT flow.

### Security Layers

| Layer               | Implementation                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Password            | bcrypt (12 rounds)                                                                                                           |
| Auth token          | JWT (HS256, 7d)                                                                                                              |
| Rate limiting       | `express-rate-limit` per IP                                                                                                  |
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
npm run dev    →  concurrently: vite dev server + tsx server/index.ts
npm run build  →  vite build (client) + esbuild (server → dist/index.js)
npm start      →  node dist/index.js
npm test       →  vitest
```

### Vite Config Highlights

- PWA via `vite-plugin-pwa` + Workbox
- Runtime caching: Weather (CacheFirst), Trips (NetworkFirst)
- Proxy `/api` → `http://127.0.0.1:5000`
- Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`

### Environment Variables

```
MONGODB_URI          MongoDB connection string
JWT_SECRET           JWT signing key
SESSION_SECRET       Session signing key
OPENROUTER_API_KEY   Atlas provider (1st in fallback chain)
GROQ_API_KEY         Atlas provider (2nd in fallback chain)
NVIDIA_API_KEY_1/2   Atlas provider (3rd/4th in fallback chain)
GEMINI_API_KEY       Gemini — must be an AI-Studio-issued key, not a plain
                      Cloud Console key
GOOGLE_API_KEY       Places / Maps / Cloud Translation
OPENAI_API_KEY       Optional; wired but not required (unfunded by default)
OPENWEATHER_API_KEY  Weather API
GOOGLE_CLIENT_ID     OAuth
GOOGLE_CLIENT_SECRET OAuth
EMAIL_HOST/USER/PASS Nodemailer
PORT                 Express port (default 5000)
```

See `server/config.ts` for the complete, authoritative list.

---

## 10. Key Data Flows

### Trip Creation + AI Itinerary

```
PlannerWizard (client)
  → POST /api/v1/trips/generate-itinerary
  → MasterOrchestrator.run() → ItineraryAgent (+ BudgetAgent, HeroImageAgent, etc.)
  → Trip saved to MongoDB
  → Response: full itinerary with confidenceScores
  → TripDetail page renders itinerary
```

### Journal AI Enhancement

```
JournalEntry edit page
  → POST /api/v1/journal/:id/ai-enhance
  → JournalAgent.enhance(content)
  → Returns: enhanced prose + recapMeta
  → RecapCard rendered with highlights, awards, travelTip
```

### Real-Time Collab

```
User A adds activity (PUT /api/v1/itinerary/:id/activity)
  → DB updated
  → SocketService broadcasts itinerary:update to trip room
  → User B's client receives event
  → TanStack Query invalidates trip query
  → UI re-renders with new activity
```

---

## 11. Scalability Considerations

| Concern         | Current Solution                                               |
| --------------- | -------------------------------------------------------------- |
| AI latency      | Streaming SSE responses + fallback providers                   |
| DB load         | MongoDB indexes on userId, tripId, shareId                     |
| API rate limits | Per-IP rate limiting + AI request deduplication                |
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
