# TripMate — AI Travel Planner

> **Agentic AI travel planning powered by Groq (llama-3.3-70b-versatile) and Atlas, your personal travel intelligence agent.**

## Prerequisites
- Node.js 20+
- MongoDB (local) or MongoDB Atlas free tier
- Groq API key (free at [console.groq.com](https://console.groq.com))
- Google Places API key
- Gemini API key (for emergency info)

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
| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ | Groq API key from console.groq.com |
| `GEMINI_API_KEY` | ✅ | Google AI Studio key (emergency info) |
| `GOOGLE_PLACES_API_KEY` | ✅ | Google Cloud Places API key |
| `DATABASE_URL` | ✅ | MongoDB connection string |
| `SESSION_SECRET` | ✅ | Random string for session signing |
| `JWT_SECRET` | ✅ | Random string for JWT signing |
| `NODE_ENV` | ✅ | `development` or `production` |
| `VITE_API_URL` | ✅ | Frontend API base: `http://localhost:5000` |

## npm Scripts
| Script | Description |
|--------|-------------|
| `npm run dev` | Start both frontend and backend |
| `npm run dev:server` | Backend only (port 5000) |
| `npm run dev:client` | Frontend only (port 3000) |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check (0 errors) |
| `npm run lint` | ESLint check |
| `npm test` | Run all tests |
| `npm run test:coverage` | Tests with coverage report |
| `npm run test:server` | Server tests only |
| `npm run test:client` | Client tests only |
| `npm run db:seed` | Seed database with test data |

## Architecture

```
Browser (React + Vite :3000)
        │
        │ HTTP / SSE
        ▼
Express API (Node.js :5000)
        │── Auth Middleware (Passport.js + JWT)
        │── Validate Middleware (Zod)
        │── Rate Limit Middleware
        │── Cache Middleware (node-cache)
        │── Compression Middleware (gzip)
        │
        │── Agent Router ──────► Atlas Agent Loop (Groq/llama-3.3-70b)
        │                              │── Tool Executor
        │                                    │── weatherHandler   (Open-Meteo, free)
        │                                    │── currencyHandler  (Frankfurter, free)
        │                                    │── emergencyHandler (Gemini API)
        │                                    │── placesHandler    (Google Places)
        │                                    │── packingHandler   (Groq sub-call)
        │                                    │── translateHandler (MyMemory, free)
        │                                    │── budgetHandler    (Budget Engine)
        │                                    └── tripPlannerHandler
        │
        │── Trip / Itinerary / Packing / Journal Routers
        │
        ▼
MongoDB (Mongoose)
        │── User, Trip, PackingList, JournalEntry, Conversation
```

## Features
- **Atlas Agent** — agentic conversational AI with tool-use (weather, currency, places, emergency info, budget breakdown, packing lists)
- **Trip Planner Wizard** — AI-generated multi-day itineraries with confidence scores and reasoning
- **Itinerary Manager** — Drag-and-drop activities with chronological validation and Atlas day optimization
- **Smart Packing List** — AI-generated context-aware packing with weather integration
- **Journal AI** — Entry contextualization, prose enhancement, and trip recap generation
- **SSE Streaming** — Real-time Atlas responses with token streaming
- **Caching** — In-memory cache for weather (1h), currency (30m), places (24h), and emergency info (24h)

## Test Credentials (after `db:seed`)
```
Email:    test@tripmate.dev
Password: TestPass123!
```

## Documentation
- [`docs/API.md`](docs/API.md) — Full REST API reference
- [`docs/AGENT_PROMPTS.md`](docs/AGENT_PROMPTS.md) — Atlas prompt system reference
