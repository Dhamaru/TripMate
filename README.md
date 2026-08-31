# TripMate — AI Travel Planner

> **Agentic AI travel planning powered by Atlas, a multi-provider travel intelligence agent (OpenRouter → Groq → NVIDIA NIM fallback chain, with Gemini used separately for utility calls), with real-time collaboration via Socket.io.**

## Prerequisites

- Node.js 20+
- MongoDB (local) or MongoDB Atlas free tier
- At least one LLM provider key: OpenRouter, Groq, and/or NVIDIA NIM (Atlas falls back across whichever are configured)
- Gemini API key — an **AI-Studio-issued key** (format `AQ.xxx`), not a plain Cloud-Console key; only AI-Studio keys actually work against the Gemini Developer API
- Google API key (Places, Maps, Cloud Translation)

## Setup

```bash
# 1. Clone
git clone <repo> && cd tripmate

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and fill in your API keys

# 4. Seed database with test data
npm run db:seed

# 5. Start development servers
npm run dev
# Frontend: http://localhost:3000
# Backend:  http://localhost:5000
```

## Environment Variables

| Variable                                | Required       | Description                                                                                                                                          |
| --------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`                           | ✅             | MongoDB connection string (not `DATABASE_URL`)                                                                                                       |
| `SESSION_SECRET`                        | ✅             | Random string for session signing                                                                                                                    |
| `JWT_SECRET`                            | ✅             | Random string for JWT signing                                                                                                                        |
| `OPENROUTER_API_KEY`                    | Atlas provider | First in the fallback chain                                                                                                                          |
| `GROQ_API_KEY`                          | Atlas provider | Second in the fallback chain (12k TPM free-tier ceiling)                                                                                             |
| `NVIDIA_API_KEY_1` / `NVIDIA_API_KEY_2` | Atlas provider | Third/fourth fallback                                                                                                                                |
| `GEMINI_API_KEY`                        | Recommended    | AI-Studio-issued key — used by AiUtilitiesService (weather/travel-hacks/journal AI, translation fallback), independent of Atlas's own fallback chain |
| `GOOGLE_API_KEY`                        | Recommended    | Places search, Maps, Cloud Translation — a plain Cloud Console key works for this (unlike `GEMINI_API_KEY`)                                          |
| `OPENAI_API_KEY`                        | Optional       | Wired as a fallback in a few places but not required — the app runs fully on the above without it                                                    |
| `NODE_ENV`                              | ✅             | `development`, `production`, or `test`                                                                                                               |
| `VITE_API_URL`                          | Dev only       | Frontend API base: `http://localhost:5000`                                                                                                           |

See `server/config.ts` for the complete, authoritative list (SMTP, admin/feedback-routine secrets, rate-limit tuning, etc.) — this table covers what you need for local dev, not every optional var.

## npm Scripts

| Script                      | Description                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`               | Start both frontend and backend (backend serves the built client; use `dev:standalone` for separate hot-reloading dev servers)            |
| `npm run dev:standalone`    | Frontend (port 3000) and backend (port 5000) as separate hot-reloading processes                                                          |
| `npm run build`             | Production build (Vite client + esbuild server bundle)                                                                                    |
| `npm run typecheck`         | TypeScript check, no emit                                                                                                                 |
| `npm run lint`              | ESLint check                                                                                                                              |
| `npm test`                  | Run the full Vitest suite                                                                                                                 |
| `npm run test:unit`         | Backend/frontend/agent/SSE unit tests only                                                                                                |
| `npm run test:integration`  | Integration tests only                                                                                                                    |
| `npm run test:coverage`     | Tests with coverage report                                                                                                                |
| `npm run db:seed`           | Seed database with test data                                                                                                              |
| `npm run db:clear`          | **Destructive** — wipes the entire database. Never run against a shared/production `MONGODB_URI`.                                         |
| `npm run atlas:golden-eval` | Runs real end-to-end checks against Atlas against a live `BASE_URL` (defaults to localhost) — hits real LLM/network providers, not mocked |

## Architecture

```
Browser (React + Vite :3000)
        │
        │ HTTP / SSE / Socket.io
        ▼
Express API (Node.js :5000)
        │── requireAuth (JWT, cookie-based, revocable via Session model)
        │── Validate Middleware (Zod)
        │── Rate Limit Middleware (per-route: auth/AI/generation/places-photo limiters)
        │── Helmet, CSRF, mongo-sanitize, hpp
        │
        │── Agent Router ──────► Atlas Agent Loop
        │                              │── Provider fallback: OpenRouter → Groq → NVIDIA×2
        │                              │   (circuit breaker + per-provider token-budget admission)
        │                              │── Tool Executor (~19 tools, CONFIRM_REQUIRED gate on
        │                              │   destructive ones — manage_expense removal, manage_collaborator)
        │                                    │── weatherHandler, currencyHandler, translateHandler
        │                                    │── placesHandler, emergencyHandler
        │                                    │── packingHandler, budgetHandler, journalToolHandler
        │                                    │── modifyItineraryHandler, expenseToolHandler
        │                                    └── collaboratorToolHandler, tripPlannerHandler
        │
        │── MasterOrchestrator (server/agent/multiAgent/) — separate pipeline from Atlas chat,
        │       runs SuggestionAgent/HeroImageAgent/ItineraryAgent/BudgetAgent/MapAgent/
        │       PackingAgent/JournalAgent, tracked via AgentJob records
        │
        │── Trip / Itinerary / Expense / Packing / Journal / Collaborator Routers
        │── Socket.io (SocketService) — trip rooms (auth-checked on join), presence, live mutations
        │
        ▼
MongoDB (Mongoose) — shared/schema.ts is the single source of truth for models
```

## Features

- **Atlas Agent** — persistent chat, streamed responses, tool-use across weather/currency/translation/places/emergency/budget/packing/journal, real-time itinerary and expense edits with a confirm-step on destructive actions
- **Trip Planner** — AI-generated multi-day itineraries, or parse a pasted free-text schedule into one
- **Real-time collaboration** — invite collaborators, live itinerary/expense/journal updates over Socket.io, presence bubbles, in-app + toast notifications with per-type mute preferences
- **Sessions & account** — real per-device session tracking (list/revoke from Profile), full data export, member-since, cascading account deletion
- **Offline maps** — download a region for offline navigation, custom pins, live navigation with OSM tiles (no external map API key required for tiles)
- **Smart Packing List** — AI-generated, weather-aware, save-on-click (no autosave)
- **Journal AI** — entry contextualization, prose enhancement, trip recap generation
- **Translator, currency converter, weather, emergency services** — each with a real-data fallback chain, not just an LLM guess
- **Public landing page** — dark-by-default (Night Atlas / Passport design system), live real-usage stats, real-destination showcase

## Documentation

- [`docs/API.md`](docs/API.md) — Full REST API reference
- [`docs/AGENT_PROMPTS.md`](docs/AGENT_PROMPTS.md) — Atlas prompt system reference
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Full system architecture
- [`DESIGN.md`](DESIGN.md) — Design system (Night Atlas / Passport & Visa Stamp)
