# TripMate API Reference

Endpoint map, checked against `server/routes/*.routes.ts` on 2026-11-01. The route files are the source of truth for validation and limits. `server/swagger.ts` holds the OpenAPI setup.

## Base URLs

- Local: `http://localhost:5000/api/v1`
- Production: `https://tripmate-ylt6.onrender.com/api/v1`

Paths below are relative to `/api/v1`. Two back-compat aliases also exist: `/api/auth/*` and `/api/tools/*`.

## Authentication

- **Cookie (primary):** `token`, an httpOnly JWT with 7-day expiry, set on sign-in. The SPA uses only this.
- **Header (fallback):** `Authorization: Bearer <token>`.
- **CSRF:** get a token from `GET /auth/csrf`. The check is skipped when the request has no auth cookie, or when it carries a Bearer header.

Every token is tied to a revocable `Session` record, so a valid JWT stops working once its session is revoked.

## Responses

Response bodies are not uniform. Many handlers return the resource directly (for example, `GET /trips` returns a plain array), so check the controller before assuming a wrapper.

Errors use this shape:

```json
{ "success": false, "error": "Human readable message", "code": "ERROR_CODE", "requestId": "uuid" }
```

Common codes are `VALIDATION_ERROR` (400), `NOT_FOUND` (404) and `RATE_LIMITED` (429, which also includes `retryAfter` in seconds).

## Rate limits

| Limiter              | Default         | Applies to                                                                                                             |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `generalLimiter`     | 1000 per 15 min | All of `/api`, except health, liveness, readiness and version. Override with `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` |
| `authLimiter`        | 5 per 15 min    | Sign-up, sign-in, guest sign-in                                                                                        |
| `aiLimiter`          | 20 per min      | AI utility routes and Atlas. Override with `AI_RATE_LIMIT_*`                                                           |
| `generationLimiter`  | 5 per hour      | Itinerary, packing and recap generation, plus orchestrator runs. Override with `GENERATION_RATE_LIMIT_*`               |
| `importPlanLimiter`  | 3 per min       | `POST /trips/parse-schedule`                                                                                           |
| `apiProxyLimiter`    | 60 per min      | Places, weather, geocoding                                                                                             |
| `placesPhotoLimiter` | 20 per min      | Place and destination photos                                                                                           |
| `feedbackLimiter`    | 5 per hour      | `POST /feedback`                                                                                                       |
| `logsLimiter`        | 10 per min      | Client log endpoints                                                                                                   |

## Auth: `/auth`

| Method       | Path                          | Auth     | Description                                                                                                         |
| ------------ | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| GET          | `/csrf`                       | None     | Get a CSRF token                                                                                                    |
| POST         | `/signup`                     | None     | Register                                                                                                            |
| POST         | `/signin`                     | None     | Sign in and set the cookie                                                                                          |
| POST         | `/guest`                      | None     | Guest sign-in                                                                                                       |
| POST         | `/signout`                    | None     | Revoke the session and clear the cookie                                                                             |
| POST         | `/forgot-password`            | None     | Email a reset link                                                                                                  |
| POST         | `/reset-password`             | None     | Use a reset token                                                                                                   |
| GET          | `/providers`                  | None     | List enabled sign-in providers                                                                                      |
| GET          | `/google`, `/google/callback` | None     | Google OAuth flow                                                                                                   |
| POST         | `/google/disconnect`          | Required | Unlink Google                                                                                                       |
| GET, PUT     | `/user` (alias `/profile`)    | Required | Read or update the profile, including `mutedNotificationTypes`                                                      |
| POST         | `/user/avatar`                | Required | Upload an avatar (stored as base64 in Mongo)                                                                        |
| POST, PUT    | `/change-password`            | Required | Change password                                                                                                     |
| GET          | `/user/export`                | Required | Download all account data as JSON                                                                                   |
| POST, DELETE | `/delete-account`             | Required | Delete the account and all owned data. Body: `{ "password" }`, or `{ "confirm": "DELETE" }` for OAuth-only accounts |
| GET          | `/sessions`                   | Required | List active sessions                                                                                                |
| POST         | `/sessions/:id/revoke`        | Required | Revoke a session                                                                                                    |

## Trips: `/trips`

All routes require auth except `/public/:shareId`.

| Method           | Path                                  | Description                                                      |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------- |
| GET              | `/public/:shareId`                    | Public view of a shared trip                                     |
| GET, POST        | `/`                                   | List trips (owned and collaborating), or create one              |
| GET, PUT, DELETE | `/:id`                                | Read, update or delete a trip                                    |
| POST             | `/:id/share`                          | Toggle public sharing                                            |
| POST             | `/:id/image`                          | Refresh the cover image                                          |
| POST             | `/generate-itinerary`                 | **AI:** generate a plan. Returns the plan directly, not a job ID |
| POST             | `/parse-schedule`                     | **AI:** parse a pasted schedule into a plan                      |
| POST             | `/:id/expenses`                       | Add an expense                                                   |
| PUT, DELETE      | `/:id/expenses/:expenseId`            | Update or delete an expense                                      |
| POST             | `/:id/itinerary/activity`             | Add an activity                                                  |
| PUT, DELETE      | `/:id/itinerary/activity/:activityId` | Update or delete an activity                                     |
| PUT              | `/:id/itinerary/reorder`              | Reorder activities                                               |
| PUT              | `/:id/itinerary/trim`                 | Delete days after the trip is shortened                          |
| POST             | `/:id/itinerary/vote`                 | Toggle a vote on an activity                                     |
| GET, POST        | `/:id/collaborators`                  | List or add collaborators                                        |
| DELETE           | `/:id/collaborators/:collaboratorId`  | Remove a collaborator                                            |
| GET              | `/:id/hacks`                          | **AI:** travel hacks                                             |
| GET              | `/:id/quiet-places`                   | **AI:** quiet spots                                              |
| GET              | `/:id/budget-forecast`                | **AI:** budget forecast                                          |
| POST             | `/:id/discover`                       | **AI:** discover places                                          |
| POST             | `/:id/ai-recommendations`             | **AI:** recommendations                                          |

## Packing

All routes require auth. Every `/packing` route below also exists under `/packing-lists`, except the item update, which differs as shown.

| Method      | Path                                | Description                            |
| ----------- | ----------------------------------- | -------------------------------------- |
| GET, POST   | `/packing`                          | List or create packing lists           |
| PUT, DELETE | `/packing/:id`                      | Update or delete a list                |
| POST        | `/packing/:id/duplicate`            | Duplicate a list                       |
| PATCH       | `/packing/:id/items/:itemId/toggle` | Toggle an item as packed               |
| PUT         | `/packing-lists/:id/item/:itemId`   | Update an item                         |
| POST        | `/packing/generate/:id`             | **AI:** generate a list for trip `:id` |
| GET, POST   | `/packing-lists/templates`          | List or create templates               |
| DELETE      | `/packing-lists/templates/:id`      | Delete a template                      |

## Journal

All routes require auth.

| Method           | Path                           | Description                                              |
| ---------------- | ------------------------------ | -------------------------------------------------------- |
| GET, POST        | `/journal`                     | List entries, or create one (multipart, up to 10 photos) |
| GET, PUT, DELETE | `/journal/:id`                 | Read, update or delete an entry                          |
| GET              | `/journal/photo/:filename`     | Get a photo                                              |
| POST             | `/journal/augment`             | **AI:** augment entry text                               |
| POST             | `/journal/:id/contextualize`   | **AI:** match an entry to a trip day                     |
| POST             | `/journal/:id/enhance`         | **AI:** propose improved text                            |
| POST             | `/journal/:id/enhance/confirm` | Save the improved text                                   |
| POST             | `/journal/recap/:tripId`       | **AI:** generate a trip recap                            |

## Atlas: `/agent`

All routes require auth.

| Method      | Path                  | Description                                    |
| ----------- | --------------------- | ---------------------------------------------- |
| POST        | `/chat`               | **AI:** send a message                         |
| GET         | `/chat/stream`        | **AI:** SSE response stream (same-origin only) |
| GET, DELETE | `/history/:tripId`    | Read or clear a conversation                   |
| POST        | `/confirm-action/:id` | Confirm a pending destructive action           |

## Orchestrator: `/orchestrator`

All routes require auth.

| Method | Path           | Description                                       |
| ------ | -------------- | ------------------------------------------------- |
| POST   | `/run`         | **AI:** run domain agents and wait for the result |
| POST   | `/stream`      | **AI:** run domain agents and stream results      |
| GET    | `/jobs`        | List jobs                                         |
| GET    | `/jobs/:jobId` | Get a job's status                                |

## Places, maps and crowd data

| Method    | Path                          | Auth     | Description                                                                                   |
| --------- | ----------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| GET       | `/places/search`              | Required | Google Places search. `?query=` or `?q=`, optional `lat`/`lon` to bias results to within 50km |
| GET       | `/places/location`            | Required | Resolve `?placeId=` to a location                                                             |
| GET       | `/places/nearby`              | Optional | Nearby places                                                                                 |
| GET       | `/places/tourist-attractions` | Required | Tourist attractions                                                                           |
| GET       | `/places/photo`               | Optional | Photo proxy, `?ref=<photo_reference>`. The API key never reaches the client                   |
| GET, POST | `/map-pins`                   | Required | List or create custom pins                                                                    |
| DELETE    | `/map-pins/:id`               | Required | Delete a pin                                                                                  |
| GET       | `/crowd/density`              | Optional | Read crowd data                                                                               |
| POST      | `/crowd/density`              | Required | Report crowd density                                                                          |

`POST /crowd/debug/seed` is only mounted outside production.

## Notifications and push

All routes require auth except `/push/vapid-public-key`.

| Method | Path                                   | Description                    |
| ------ | -------------------------------------- | ------------------------------ |
| GET    | `/notifications`                       | List notifications             |
| POST   | `/notifications/:id/read`              | Mark one as read               |
| POST   | `/notifications/read-all`              | Mark all as read               |
| DELETE | `/notifications/:id`                   | Delete one                     |
| POST   | `/notifications/delete`                | Delete several                 |
| GET    | `/push/vapid-public-key`               | Get the public VAPID key       |
| POST   | `/push/subscribe`, `/push/unsubscribe` | Manage a web-push subscription |

## Suggestions: `/suggestions`

All routes require auth.

| Method | Path                      | Description                     |
| ------ | ------------------------- | ------------------------------- |
| GET    | `/`                       | List suggestions                |
| POST   | `/:suggestionId/feedback` | Submit feedback on a suggestion |
| POST   | `/:suggestionId/dismiss`  | Dismiss a suggestion            |

## Tools

These are mounted directly on `/api/v1` and also on `/api/tools`, so it's `/api/v1/weather` or `/api/tools/weather`, never `/api/v1/tools/weather`.

| Method | Path                                                      | Auth     | Description                                         |
| ------ | --------------------------------------------------------- | -------- | --------------------------------------------------- |
| GET    | `/health`, `/ping`, `/liveness`, `/readiness`, `/version` | None     | Service health checks                               |
| GET    | `/atlas/health`                                           | None     | Atlas health                                        |
| GET    | `/public/stats`                                           | None     | Landing page stats, excluding QA and guest accounts |
| GET    | `/public/top-destinations`                                | None     | Landing page destinations                           |
| GET    | `/public/destination-image`                               | None     | Destination image                                   |
| GET    | `/currency`, `/currency/latest`, `/currency/history`      | None     | Exchange rates                                      |
| GET    | `/currency/convert`                                       | Required | Convert currency                                    |
| GET    | `/geocode`, `/reverse-geocode`                            | None     | Geocoding                                           |
| GET    | `/weather`                                                | Required | Weather                                             |
| GET    | `/weather/tiles/:layer/:z/:x/:y`                          | Required | Weather tile proxy                                  |
| GET    | `/proxy-image`                                            | Required | Image proxy                                         |
| POST   | `/translate`                                              | Required | **AI:** translate text                              |
| GET    | `/emergency`                                              | Required | Emergency services from Google Places               |
| POST   | `/planTrip`                                               | Required | **AI:** plan a trip                                 |
| GET    | `/proactive-insights`                                     | Required | **AI:** proactive insights                          |

The dedicated routers also expose `GET /weather/forecast` and `GET /emergency/:query?`.

## Feedback and logs

| Method | Path                             | Auth         | Description                           |
| ------ | -------------------------------- | ------------ | ------------------------------------- |
| POST   | `/feedback`                      | None         | Submit feedback (up to 3 attachments) |
| GET    | `/feedback`                      | Admin secret | List feedback                         |
| PATCH  | `/feedback/:id/review`           | Admin secret | Record a review                       |
| GET    | `/feedback/attachment/:filename` | Admin secret | Get an attachment                     |
| POST   | `/logs/info`, `/logs/error`      | None         | Client log ingestion                  |
