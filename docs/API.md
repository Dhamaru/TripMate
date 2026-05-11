# TripMate API Documentation

## Base URL
`http://localhost:5000/api/v1`

## Authentication
JWT token required. Pass as:
- **Cookie**: `token` (set automatically on login)
- **Header**: `Authorization: Bearer <token>`

## Response Format
**Success:**
```json
{ "success": true, "data": { ... } }
```
**Error:**
```json
{ "success": false, "error": "Human readable message", "code": "ERROR_CODE", "requestId": "uuid" }
```

## Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Token valid but access denied |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Chronological conflict in itinerary |
| `RATE_LIMITED` | 429 | Too many requests |
| `AI_SERVICE_ERROR` | 503 | Groq API unavailable |

---

## Auth Endpoints

### POST /auth/signup
**Auth**: None  
**Body**: `{ "email": "string", "password": "string", "firstName": "string", "lastName": "string" }`  
**Response**: `{ "success": true, "data": { "id", "email", "firstName", "lastName" } }`

### POST /auth/signin
**Auth**: None  
**Body**: `{ "email": "string", "password": "string" }`  
**Response**: `{ "success": true, "data": { "id", "email", "firstName", "lastName" } }`  
**curl**:
```bash
curl -X POST http://localhost:5000/api/v1/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@tripmate.dev","password":"TestPass123!"}'
```

### POST /auth/signout
**Auth**: None  
**Response**: `{ "success": true }`

### GET /auth/me
**Auth**: Required  
**Response**: `{ "success": true, "data": { "id", "email", "firstName", "lastName" } }`

### PUT /auth/profile
**Auth**: Required  
**Body**: `{ "firstName"?: "string", "lastName"?: "string", "preferences"?: {} }`  
**Response**: `{ "success": true, "data": { user } }`

### POST /auth/google
**Auth**: None — OAuth flow

### GET /auth/google/callback
**Auth**: None — OAuth redirect

### POST /auth/forgot-password
**Auth**: None  
**Body**: `{ "email": "string" }`

---

## Trip Endpoints

### GET /trips
**Auth**: Required  
**Response**: `{ "success": true, "data": Trip[] }`

### GET /trips/:id
**Auth**: Required  
**Response**: `{ "success": true, "data": Trip }`

### POST /trips
**Auth**: Required  
**Body**: `{ "destination", "startDate", "endDate", "totalBudget", "travelStyle", "travelMedium", "companions" }`  
**Response**: `{ "success": true, "data": Trip }`

### DELETE /trips/:id
**Auth**: Required  
**Response**: `{ "success": true }`

### POST /trips/generate
**Auth**: Required  
**Body**: `{ "destination", "startDate", "endDate", "totalBudget", "travelStyle", "travelMedium", "companions", "interests"? }`  
**Response**: `{ "success": true, "data": { "jobId": "string" } }`

### GET /trips/generate/status/:jobId
**Auth**: Required  
**Response**: `{ "success": true, "data": { "status": "pending|processing|done|error", "steps": string[], "tripId"?: string } }`

---

## Itinerary Endpoints

### GET /trips/:id/itinerary
**Auth**: Required  
**Response**: `{ "success": true, "data": IItineraryDay[] }`

### PUT /trips/:id/itinerary
**Auth**: Required  
**Body**: `{ "itinerary": IItineraryDay[] }`  
**Response**: `{ "success": true, "data": IItineraryDay[] }`

### POST /trips/:id/itinerary/activities
**Auth**: Required  
**Body**: `{ "dayIndex": number, "activity": IItineraryActivity }`  
**Response**: `{ "success": true, "data": { "itinerary": IItineraryDay[] } }`

### PUT /trips/:id/itinerary/activities/:activityId
**Auth**: Required  
**Body**: `{ "dayIndex": number, "data": Partial<IItineraryActivity> }`  
**Response**: `{ "success": true, "data": { "itinerary": IItineraryDay[] } }`

### DELETE /trips/:id/itinerary/activities/:activityId
**Auth**: Required  
**Query**: `?dayIndex=number`  
**Response**: `{ "success": true, "data": { "itinerary": IItineraryDay[] } }`

---

## Packing Endpoints

### GET /packing
**Auth**: Required  
**Query**: `?tripId=string`  
**Response**: `{ "success": true, "data": PackingList }`

### POST /packing
**Auth**: Required  
**Body**: `{ "tripId": "string", "categories": PackingCategory[] }`  
**Response**: `{ "success": true, "data": PackingList }`

### POST /packing/generate/:id
**Auth**: Required  
**Params**: `id` = tripId  
**Response**: `{ "success": true, "data": PackingList }` (AI-generated)

### PUT /packing/:id/item/:itemId
**Auth**: Required  
**Body**: `{ "packed": boolean }`  
**Response**: `{ "success": true, "data": PackingList }`

### DELETE /packing/:id
**Auth**: Required  
**Response**: `{ "success": true }`

---

## Journal Endpoints

### GET /journal
**Auth**: Required  
**Query**: `?tripId=string`  
**Response**: `{ "success": true, "data": JournalEntry[] }`

### POST /journal
**Auth**: Required  
**Body**: `{ "tripId", "content", "entryDate", "images"? }`  
**Response**: `{ "success": true, "data": JournalEntry }`

### PUT /journal/:id
**Auth**: Required  
**Body**: `Partial<JournalEntry>`  
**Response**: `{ "success": true, "data": JournalEntry }`

### DELETE /journal/:id
**Auth**: Required  
**Response**: `{ "success": true }`

### POST /journal/:id/contextualize
**Auth**: Required  
**Response**: `{ "success": true, "data": JournalEntry }` (with assignedDayIndex, contextConfidence)

### POST /journal/:id/enhance
**Auth**: Required  
**Response**: `{ "success": true, "data": { "original": string, "enhanced": string, "changesSummary": string } }`

### POST /journal/:id/enhance/confirm
**Auth**: Required  
**Body**: `{ "text": "string" }`  
**Response**: `{ "success": true, "data": JournalEntry }`

### POST /journal/recap/:tripId
**Auth**: Required  
**Response**: `{ "success": true, "data": { "recap": JournalEntry } }` (requires ≥3 entries)

---

## Agent Endpoints

### POST /agent/chat
**Auth**: Required  
**Body**: `{ "message": "string", "conversationId"?: "string", "context"?: { "currentTripId"?, "currentPage"? } }`  
**Response**: `{ "success": true, "data": { "response", "conversationId", "toolsUsed": string[], "suggestedActions"? } }`

### POST /agent/chat/stream
**Auth**: Required  
**Body**: same as /agent/chat  
**Response**: SSE stream — `data: {"type":"token"/"tool"/"done"/"error","content":...}`

### DELETE /agent/conversation/:id
**Auth**: Required  
**Response**: `{ "success": true }`

### GET /agent/suggestions
**Auth**: Required  
**Response**: `{ "success": true, "data": SuggestedAction[] }`

---

## Health / Tools Endpoints

### GET /health
**Auth**: None  
**Response**: `{ "status": "ok", "services": { "database": "connected" } }`

### GET /liveness
**Auth**: None  
**Response**: `{ "status": "alive" }`

### GET /readiness
**Auth**: None  
**Response**: `{ "ready": true }`

### GET /version
**Auth**: None  
**Response**: `{ "version": "1.0.0" }`

### GET /tools/weather/tiles/:layer/:z/:x/:y
**Auth**: Required  
**Response**: Weather tile proxy (PNG)

### GET /tools/proactive-insights
**Auth**: Required  
**Response**: `{ "success": true, "data": insight[] }`
