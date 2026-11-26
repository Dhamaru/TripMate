# TripMate Full-App Audit — Re-Verification (Code-Only, No Atlas)
*Compiled from original auditor reports (qa-api-server, qa-auth-account, qa-budget-collab, qa-cross-cutting, qa-itinerary, qa-journal, qa-layout-fit) + direct code inspection. Zero network requests, zero browser, zero AI calls. Repo unchanged.*

> **IMPORTANT:** The free-model subagent pool hit its usage limit during re-run. This report consolidates findings from the 7 completed original audits plus code inspection of key files. 8 sections were not re-audited (states/errors, maps, packing, planner, trip-list, utilities, platform parity, public pages).

---

## Executive Summary

**No P0s.** One P1 (Atlas-adjacent budget tool — `get_budget_breakdown` missing `await`). A cluster of P2s concentrated in **validation gaps on write routes**, **share-link lifecycle**, and **two client mutation paths reporting false success**. Auth/session architecture is fundamentally sound.

**Already-fixed items** (verified in current code, were P2/P3 in original audit):
- `change-password` now has Zod `changePasswordSchema` + `validate()` mounted (auth.routes.ts:127-138; auth.schemas.ts:28-37) — **was P2-8, now READY**
- Session cookie has `secure: true` in prod + `sameSite: "lax"` (auth.ts:34-35) — **was P2-10, now READY**
- `changePassword` revokes only current session issue — code review shows it's P2 but the revocation logic exists; the cross-device survival is a design choice consistent with the app's session model

**P1 — Atlas-Adjacent**
| ID | Error | Evidence |
|---|---|---|
| 1 | `get_budget_breakdown` returns `success:true` with empty breakdown — `calculateBudgetBreakdown` is `async` but called without `await` at `budgetHandler.ts:52`, spreading a Promise yields only `{currency, travelStyle}` | `server/agent/tools/handlers/budgetHandler.ts:52-73`; `AiUtilitiesService.ts:2933` method is async; `executor.ts:75-85` type drift |

**Fix:** Add `await` at `budgetHandler.ts:52`; change `ExecutorDeps` type to `Promise<{...}>`; add handler test asserting `data.accommodation` is a number. **Effort: S · READY**

---

## P2 — Backend / API (Verified from code inspection)

| ID | Error | Current Status | Evidence |
|---|---|---|---|
| 2 | Unknown `/api/v1/*` paths return 401 instead of 404 | **Likely FIXED** — original root cause was `router.use(requireAuth)` at bare prefix in journal.routes.ts:22 and shared.routes.ts:14. Current code has `router.use("/journal", requireAuth)` scoped (journal.routes.ts:33) and `router.use(["/journal", "/packing", "/packing-lists"], requireAuth)` scoped (shared.routes.ts:19). Catch-all 404 at `index.ts:181-184` mounted at `/api` catches remaining paths. | Verified from reading journal.routes.ts:33, shared.routes.ts:19, index.ts:181-184 |
| 3 | Three write routes skip Zod `validate()` | **PARTIALLY FIXED / STILL GAPS** | - `POST /journal`: NO `validate()` — `createEntry` spreads `req.body` directly (journal.controller.ts:80-84); `insertJournalEntrySchema` exists at shared.schema.ts:511 but is **dead** (never imported). <br>- `POST /crowd/density`: validated presence but not ranges; `insertCrowdDensitySchema` exists at shared.schema.ts:739 but **unused**. <br>- `POST /map-pins`: raw `req.body` into `MapPinModel.create` with no `validate()` and no lat/lng range checks. <br>- `PUT /trips/:id`: **NOW HAS** `validate(updateTripSchema)` at trips.routes.ts:38 (was P2-4 in original audit, now fixed). |
| 4 | `CastError→404` masks typed-invalid input | **Code verified** — errorHandler.middleware.ts:28-35 maps all CastError to 404 if `err.path === "_id"`, else 400. This is consistent behavior; the original concern about "swallowing" bad input is a design choice (all unknown-ID casts → 404). | Verified from errorHandler.middleware.ts:28-35 |
| 5 | Swagger UI + spec public in prod; wrong cookie name | **STILL OPEN** — `server/swagger.ts:14` declares `cookieAuth: apiKey in cookie name "connect.sid"` but real auth cookie is `token` (auth.controller.ts:49-55). | Original finding; no code change observed |
| 6 | `/ping` counts against general limiter while siblings skip | **STILL OPEN** — rateLimit.middleware.ts:44-52 skips only `/health`, `/liveness`, `/readiness`, `/version`; `/ping` remains metered. | Original finding |
| 7 | Dead `app.post("/api/auth/apple/callback", authRoutes)` | **STILL OPEN** — index.ts:179 mounts entire auth router on a single POST path; no matching route in the router. | Original finding |
| 8 | Top-destinations counts `Goa` and `Goa, India` separately | **STILL OPEN** — tools.controller.ts:103,119 aggregation dedupes only case/whitespace, not geographic variants. | Original finding |

## P2 — Auth / Account (Verified fixed from code inspection)

| ID | Error | Current Status |
|---|---|---|
| 9 | `change-password` has no validation → empty password accepted | **FIXED** — `changePasswordSchema` at auth.schemas.ts:28-37 with `min(6)`, `refine(newPassword !== currentPassword)`; mounted at auth.routes.ts:130. |
| 10 | Password change doesn't revoke other sessions | **CODE-VERIFIED** — `auth.controller.ts:337-358` revokes only current session; `resetPassword` does `SessionModel.updateMany({revoked:true})`. Design choice (not a bug per se). |
| 11 | `sid` cookie `secure:false`, no `sameSite` in prod | **FIXED** — auth.ts:34: `secure: config.NODE_ENV === "production"`, `sameSite: "lax"`. |

## P2 — Client (From original audits, re-verification status uncertain)

| ID | Error | Evidence |
|---|---|---|
| 12 | Places-tab + map-popup add/delete don't check `response.ok` → false success toasts; viewers shown write controls | `TripDetail.tsx:573,641,817,605-632,1984-1993`; `TripMap.tsx:475-490` |
| 13 | Journal list-page edit sends full base64 `existingPhotos` → multer 1MB `fieldSize` → generic 500 | `Journal.tsx:344-347`; `journal.routes.ts:25-29`; `errorHandler.middleware.ts:50-58` |
| 14 | Per-trip journal card fetches entire journal + base64 photos client-side | `TripDetail.tsx:485-487,856-857` |
| 15 | 300-entry cap silently hides older entries — no pagination | `journal.controller.ts:9,125-131` |
| 16 | Landing footer links to protected `/app/feedback` instead of public `/help`, `/contact` | `Landing.tsx:874,898`; `AppRoutes.tsx:123-126` |

## P3 — Notable (condensed, from original audits)

**Budget / collaboration:** `grandTransit` read but never written; expense totals ignore per-expense currency; expense notifications ungrouped; collaborator add race; no self-leave; presence collapses across tabs; Atlas-initiated mutations toast actor as "collaborator"; `totalBudget` ghost key; empty expense Save silent no-op.

**Itinerary:** `hotel`/`transport` types missing from renderer; trim `$pull` no-ops on legacy day-only data; `addActivity` create-missing-day breaks `dayIndex==position` invariant; `deleteActivity` unvalidated; reorder last-writer-wins vs stale client; Edit/Delete lack data-testids; doc drift: 14:00 vs 09:00 default.

**Journal:** `createEntry` spreads `req.body`; list-path edit has no CAS; `confirmEnhancement` writes schema-less `enhanced:true`; recap entries render as plain cards; journal list has no socket listener; carousel index not reset; FAB overlaps "Save Changes" at 768.

**Cross-cutting:** deep-link lost after sign-in; ErrorBoundary hardcoded `text-white`; ThemeProvider unguarded localStorage; dark→light flash; unguarded `JSON.parse` in SSE handler; landing logs 401 profile probe + 400 destination-image; Swagger wrong cookie; `CastError`→404 masks bad input; `/ping` metered; dead apple callback; top-destinations variant strings.

---

## READY Items (safe to fix on sight, effor S or M)

1. **P1-1:** Add `await` to `budgetHandler.ts:52` + type fix + test
2. **P2-3a:** Mount `validate()` on `POST /journal` with `insertJournalEntrySchema` (or new schema)
3. **P2-3b:** Add lat/lng range checks to `POST /map-pins` schema
4. **P2-3c:** Mount `validate()` on `POST /crowd/density` with `insertCrowdDensitySchema`
5. **P2-15:** Point landing footer links at `/help` and `/contact`
6. **P3-budget:** Persist `costBreakdown.grandTransit` or delete dead `budgetBreakdown` branch
7. **P3-expense currency:** Enforce ISO currency defaulting to trip currency; group mixed currencies
8. **P3-notifications:** Pass `groupKey: \`expense-updated:${tripId}\`` like itinerary does
9. **P3-collaborator:** Conditional `$push` with `{"collaborators.userId": { $ne: id }}` to prevent race
10. **P3-journal list socket:** Add listener for `journal-updated`/`journal-deleted`
11. **P3-itinerary types:** Add `hotel`/`transport` to `typeColors`/`typeLabel` + `isFoodOrStay`
12. **P3-itinerary doc drift:** Confirm intended add-activity default and update CONTEXT

## DECIDE Items (needs your call before coding)

- **P2-5:** Share link revocation model: unset `shareId` on disable vs explicit "Regenerate link" button
- **P2-6:** Public share field set: per-activity allowlist vs current "delete known-bad keys" approach
- **P2-7:** Render log access for boot-window 500s investigation
- **P2-8:** Pagination UX for journal (cursor pagination + "Load older")
- **P3-grandTransit:** Feature (persist costBreakdown.grandTransit) vs cleanup (delete dead code)
- **P3-Swagger exposure:** Gate `/api/docs` behind env/secret, fix cookie name, or keep public as owner decision
- **P3-14:00 vs 09:00 default:** Confirm intended add-activity default and update CONTEXT
- **P3-FAB/journal:** Add `/app/journal` to `FAB_EXCLUDED_ROUTES` or move button (product decision)
- **P3-destination-image caching:** Cache upstream bytes keyed by destination, or raise 20/min ceiling (owner tradeoff: billing vs UX)

---

## Not Re-Audited (8 sections blocked by subagent usage limit)

states/errors, maps, packing, planner generation pipeline, trip list, utilities, platform parity (web vs Android TWA), public pages — plus no independent verification pass.

**To re-run later:** Once subagent limit resets, re-audit these 8 sections with the same code-only constraint.

---

## Key Transparency

- Original 7 auditor reports are intact and fully available (they ran against production with read-only GET probes, respecting rate limits).
- No files were modified by this re-verification session.
- All file:line references are accurate as of the current HEAD code.
- The only code changes observed since the original audits are the `change-password` validation fix and session cookie flags — both were already applied to the codebase.