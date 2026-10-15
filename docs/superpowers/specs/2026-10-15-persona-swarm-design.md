# Persona Swarm — Design Spec

Date: 2026-10-15
Status: Approved in conversation, pending written-spec review

## 1. Purpose

A MiroFish-inspired swarm of AI traveler personas that use the real TripMate
app in a browser, cover every page and feature, and actively hunt for the
places where the app fails. It exists because typecheck/build/unit tests have
repeatedly passed while real user flows were broken (see CLAUDE.md rule 6).

**Success:** a run finds real bugs and friction that static checks miss, each
with reproduction steps and evidence, and proves which parts of the app were
checked (no silent gaps).

### Decisions made with the user

| Decision            | Choice                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| What the swarm does | Personas drive the live app (not a market-reaction simulation)                                                                                    |
| Driving LLM         | Gemini (`gemini-3.6-flash`), existing `GEMINI_API_KEY`, via the `openai` SDK on Gemini's OpenAI-compatible endpoint (same transport the app uses) |
| Target              | Local dev only                                                                                                                                    |
| Output              | HTML report per run (+ `findings.json`)                                                                                                           |
| Coverage            | Every page and feature must be checked; personas must look for failures specifically                                                              |
| Specialists         | Two extra inspectors: Layout (every layout fits exactly) and Platform & Resilience (web + Android: notifications, loading states, API errors)     |
| Android             | Emulated Android Chrome in Playwright against local dev (no SDK/emulator; real-APK testing out of scope)                                          |

### Borrowed from MiroFish / dropped

- **Kept:** persona generation from a seed (here: the coverage map + persona
  definitions), parallel simulation, a report stage that synthesizes results.
- **Dropped:** Zep memory graph, OASIS social-network simulation, Python stack.
  None of them serve QA, and they add cost and dependencies.

## 2. Location and stack

`tools/swarm/` in the TripMate repo. TypeScript run with `tsx`. Uses
dependencies already installed: `@playwright/test` (Chromium), `openai`,
`vitest`. No new dependencies. Entry:
`npm run swarm -- [--personas ids] [--items glob] [--max-steps N] [--only travelers|layout|resilience]`.

Reports are written to `swarm-reports/<ISO-timestamp>/` (gitignored).

## 3. Coverage map (`tools/swarm/coverage.ts`)

The checklist that makes "check everything" enforceable. A typed TS array (no
YAML parser is installed, and types catch typos in playbook names). Each item,
shown here as YAML for readability:

```yaml
- id: planner.generate
  route: /app/planner
  requiresAuth: true
  checks:
    - Generating a trip shows an itinerary with the requested number of days
    - The trip persists after reload
    - The trip appears in /app/trips
  playbooks: [input, state, environment, ai, consistency]
```

### Items (minimum set; one or more items per entry)

**Public:** `/` landing (incl. hero destination search), `/signin`, `/signup`,
`/forgot-password`, `/reset-password`, `/help`, `/privacy`, `/terms`,
`/contact`, `/trips/:id` public share page, 404 page.

**App:** `/app/home`, `/app/features`, `/app/tools`, `/app/planner`,
`/app/trips`, `/app/trips/:id` (itinerary add/edit/delete/reorder, trim on
duration change, expenses/budget, packing, collaborators, voting, share,
map), `/app/journal`, `/app/journal/:id`, `/app/maps` (search, style toggle,
offline download, save-to-device, turn-by-turn navigation), `/app/packing`,
`/app/currency`, `/app/weather`, `/app/translate`, `/app/emergency` (live
location, embassy search, SOS numbers), `/app/feedback`, `/app/profile`,
`/app/profile/crop`, `/app/sessions`.

**Cross-cutting:** Atlas assistant, notification bell (read/unread/delete/
clear-all), real-time collaboration (Socket.io), share links, push
notification subscription UI, PWA/offline mode, light/dark theme, bottom nav
and drawers on mobile, sign-out and session expiry.

The coverage map is shared by all persona types: travelers mark functional
checks, the Layout Inspector marks a layout cell per item, the Resilience
Inspector marks a fault-injection cell per item. The report grid shows all
three dimensions.

## 4. Personas (`tools/swarm/personas.ts`)

Each persona: `id`, `name`, `goal`, `viewport`, `theme`, `behaviour` (prompt
text describing how they act), `playbooks` (categories they apply).

**Travelers (8):**

1. Budget backpacker — 375px phone, dark, impatient, cheap trips
2. Family of 4 planning a 10-day trip — tablet 768px, light, budget + packing heavy
3. Elderly first-time user — 430px phone, light, slow, misreads labels, uses Back often
4. Non-English speaker — desktop, uses translate and non-Latin input
5. Business traveler — desktop 1280px, rushes, double-clicks, multiple tabs
6. Group trip pair (A + B) — two browser contexts, collaboration and voting
7. Offline hiker — 375px phone, maps offline download then goes offline
8. Keyboard-only accessibility user — desktop, never uses the mouse

**Breakers (3):** pure adversarial testers, one each focused on
input/injection, state/concurrency, and authorization/data leaks.

**Specialist inspectors (2):** see sections 5 and 6. Unlike travelers, they
are systematic: the matrix of what they check is generated in code, so
nothing depends on the LLM choosing to look. Gemini is used for judgment
(visual review, "is this error message understandable") and for driving the
app into states the matrix needs (open a dialog, fill a form, reach a trip).

## 5. Layout Inspector

Goal: every page, at every layout, fits exactly — nothing overflows,
overlaps, clips, or becomes unusable.

### Matrix

- **Routes:** every coverage-map route (authenticated ones with a seeded
  swarm account and a seeded trip/journal entry so pages have real content).
- **Widths:** 320, 360, 375, 390, 412, 430 (phones); 639/640, 767/768,
  1023/1024, 1279/1280 (one pixel either side of each Tailwind default
  breakpoint — the repo defines no custom `screens`, so these are
  sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536); 1536, 1920, 2560.
- **Orientation:** portrait and landscape for phone and tablet sizes.
- **Theme:** light and dark.
- **States per route:** default; scrolled to bottom; every dialog, drawer,
  dropdown, popover and toast the page can open (opened by Gemini driving
  the page, then measured); empty state (new account) and long-content state
  (seeded trip with 20+ activities and long names); 200% browser zoom
  (reflow) at 1280.
- **Content stress:** a seeded trip with very long destination/activity
  names, emoji and RTL text, so text-fitting bugs actually surface.

### Deterministic geometry checks (run on every cell)

- Horizontal page scroll (`document.documentElement.scrollWidth > innerWidth`)
- Any visible element extending beyond the viewport's left/right edge
- Overlap: bounding boxes of visible interactive or text elements that
  intersect when neither is a descendant of the other and neither is an
  intentional overlay (dialogs/popovers are measured against the page
  beneath only for viewport fit)
- Clipped text: `scrollWidth > clientWidth` or `scrollHeight > clientHeight`
  with `overflow: hidden`, unless intentionally truncated with ellipsis
  _and_ the full text is available (title/aria-label/tooltip)
- Touch targets under 44×44px at phone/tablet widths
- Fixed/sticky elements (header, bottom nav, FAB) covering content: after
  scrolling to bottom, the last content element must be fully visible above
  the bottom nav
- Dialogs/drawers taller or wider than the viewport without internal scroll;
  close button reachable on screen
- Images distorted (rendered aspect ratio differs from natural by >5%
  without `object-fit`)
- Mobile text below 12px computed font size
- Overlong lines at wide screens (text blocks wider than ~90ch at 1920/2560)
- Elements that exist at width N−1 but vanish at N with no replacement
  (breakpoint-edge regressions), matched by accessible name

### Visual judgment

One Gemini vision call per route × width band (phone / tablet / desktop /
wide) × theme, on the screenshot of the default state, plus a call on every
cell where a geometry check fired. Gemini is asked for specific, located
defects (misalignment, inconsistent spacing, low contrast, content not
centered, awkward wrapping) and must cite a region; vague verdicts are
discarded.

Output per finding: route, width × height, orientation, theme, state, check
name, element (accessible name + bounding box), annotated screenshot with the
offending box outlined.

## 6. Platform & Resilience Inspector

Goal: on web and on Android, notifications work, every loading/processing
state is shown and ends, and every API failure is handled the way a real
user would need.

### Platforms

- **Web:** desktop Chromium at 1280.
- **Android (emulated):** Playwright device descriptors for a Pixel 7 and a
  Galaxy S-series phone (Android Chrome user agent, touch, device pixel ratio,
  mobile viewport), plus `isMobile: true`. Every check below runs on both
  platforms. Real APK/TWA shell testing is out of scope.

### A. Notifications

- **In-app bell:** trigger real notifications through swarm actions (persona
  A invites B to a trip, edits a shared trip, votes); verify B's bell updates
  live over Socket.io without reload, unread count is correct, All/Unread
  tabs stay in sync, expand-to-read, mark read, delete, select, clear-all, and
  the state survives reload.
- **Toasts:** every success/failure toast appears, is readable, doesn't cover
  the action that produced it on mobile, and dismisses.
- **Push permission flow:** permission `default` (prompt UI), `granted`
  (`context.grantPermissions(['notifications'])`) and `denied` — the app must
  explain and degrade gracefully in each.
- **Push subscription:** granted → a `PushSubscription` is created and saved
  server-side for the swarm user.
- **Push delivery and display:** a swarm action triggers a server push to the
  swarm user; delivery is attempted for real. Because headless Chromium push
  delivery is unreliable, the service worker's `push` handler is also
  exercised directly via the Chrome DevTools Protocol
  (`ServiceWorker.deliverPushMessage`), verifying a notification is shown
  with the right title/body and that clicking it opens the right page. The
  report states which path was verified.

### B. Loading and processing states

For every route and every action that calls the API, record the real API
calls (method + path) during a clean pass, then for each call, delay it 3s
and verify:

- a loading indicator (skeleton, spinner, `aria-busy`, disabled button with
  progress text) is visible within ~300ms
- no layout jump larger than a set threshold when content arrives
- the submit control is disabled during processing (no double-submit)
- long operations (trip generation, Atlas, offline download) show progress
  and remain cancellable/navigable
- the indicator always ends (no infinite spinner) — resolves to content or an
  error within the request's timeout

### C. API error handling (fault injection via `page.route`)

For each recorded API call, inject each fault in a fresh page:

| Fault                        | Expected behaviour                                                           |
| ---------------------------- | ---------------------------------------------------------------------------- |
| 500 / 502 / 503              | Human-readable error, retry available, rest of the page still works          |
| 404                          | "Not found" message, no crash                                                |
| 401 mid-session              | Redirect to sign-in (or re-auth prompt), no data loss, return path kept      |
| 403                          | Clear "no access" message, no private data rendered                          |
| 429                          | "Too many requests / try again" message, no retry storm                      |
| Network abort / offline      | Offline message, queued or retryable action, recovers when back online       |
| Timeout (request hangs)      | Indicator ends, timeout message, retry works                                 |
| Malformed JSON / wrong shape | No white screen, no raw JSON or stack trace shown                            |
| Empty list / empty object    | Proper empty state, not a blank area or `undefined`                          |
| Huge payload (500+ items)    | Page stays responsive, list renders (paginated or virtualized), layout holds |

On every fault, all automatic oracles also run, plus resilience-specific
ones: blank root/white screen, raw error text or stack trace visible, error
toast missing, request count explosion (>5 identical requests in 10s =
retry storm), a mutation sent twice after a failure (duplicate write), and
after removing the fault, a retry must succeed.

## 7. Failure-hunting playbooks (travelers and breakers)

The persona prompt includes the playbook categories assigned to the current
item. Each category is a concrete list of moves:

- **input** — empty, 5000-char strings, emoji, RTL text, `<script>alert(1)</script>`,
  negative/zero/huge numbers, past dates, end before start, 365-day trip,
  nonexistent destination, duplicate entries.
- **state** — reload mid-flow, Back/Forward, double-submit, rapid repeated
  clicks, same resource in two tabs, sign out then Back.
- **authz** — open another persona's `/app/trips/:id` and `/app/journal/:id`
  by URL; open share links signed out and confirm no private fields
  (expenses, notes, collaborator emails, `userVotes`) are visible.
- **environment** — viewport 375/430/768/1280, both themes, `setOffline`
  mid-action, slow-3G throttling, geolocation denied/granted/moving.
- **multiuser** — concurrent edits to the same trip, voting, live update
  delivery to the other context.
- **ai** — Atlas off-topic question (must decline gracefully), raw JSON must
  never be rendered, prompt-injection attempt, slow/timed-out generation
  must end in a usable state.
- **consistency** — after every create/update/delete: survives reload, and is
  reflected everywhere it should be (expense → budget totals, deleted trip →
  gone from history, renamed trip → new name in lists).

## 8. Architecture

| Unit                       | Responsibility                                                                                                                                                       | Depends on           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `launcher.ts`              | Start API (`SWARM_RUN=1`, SMTP_* blank) and frontend as separate background processes; poll health; refuse any non-localhost base URL                                | —                    |
| `seed.ts`                  | Create swarm accounts and seeded content (normal trip, long-content trip, journal entry, shared trip between A and B) through the real API                           | API                  |
| `coordinator.ts`           | Assign coverage items to personas; run ≤4 browser contexts concurrently; re-run rounds until every item is `pass`/`fail`/`blocked` (max 2 retries, then `blocked`)   | agent, inspectors    |
| `agent.ts`                 | One traveler/breaker working one coverage item (loop below)                                                                                                          | oracles, llm         |
| `inspectors/layout.ts`     | Generate the layout matrix, drive each cell into its state, run geometry checks, request visual judgment                                                             | geometry, llm, agent |
| `inspectors/geometry.ts`   | Pure in-page measurement functions for the layout checks                                                                                                             | Playwright           |
| `inspectors/resilience.ts` | Record API calls per route/action, then run notification, loading-state and fault-injection checks on web and emulated Android                                       | oracles, llm, agent  |
| `llm.ts`                   | Gemini text + vision calls, JSON parsing/validation (Zod), retry with backoff, token/step accounting                                                                 | openai SDK           |
| `oracles.ts`               | Automatic failure detectors attached to every page                                                                                                                   | Playwright           |
| `verify.ts`                | Replay each finding's recorded actions in a fresh context → `confirmed`/`flaky`; dedupe by (route, check, normalized message, layout cell)                           | Playwright           |
| `report.ts`                | Render `index.html` + `findings.json`                                                                                                                                | —                    |
| `cleanup.ts`               | Delete all `swarm-<runId>-*@example.com` accounts and cascaded data (incl. push subscriptions, feedback, notifications) by exact ID; runs in `finally` and on SIGINT | API / DB             |

### Agent loop (one persona, one coverage item)

1. Capture Playwright's ARIA snapshot of the page (elements with refs).
2. Send Gemini: persona, coverage item + checks, applicable playbooks, the
   last ~8 actions and results, and any oracle hits since the last step.
3. Gemini returns exactly one JSON object:
   - `{ "action": "click"|"fill"|"select"|"press"|"navigate"|"back"|"reload"|"setOffline"|"setViewport"|"newTab", "ref"?, "value"?, "why" }`
   - `{ "verdict": "pass"|"fail", "check", "evidence" }`
   - `{ "finding": { "title", "severity", "expected", "actual" } }`
4. Execute; record action, URL, oracle hits; screenshot on any finding.
5. Stop when every check has a verdict or the item hits its step cap (~40).

The inspectors reuse this loop only to reach a state ("open the add-expense
dialog"); their checks then run deterministically.

Element targeting uses ARIA refs from the snapshot, not CSS or text
selectors, consistent with the repo's "no text/CSS selectors" rule (the
swarm discovers elements; it doesn't hard-code them).

Collaboration items run as one coordinator task controlling two contexts
(A and B) so each can verify the other's changes.

### Automatic oracles (independent of LLM judgment)

- `console.error` and `pageerror` events
- Network responses ≥400 (excluding expected 401/403 on deliberate authz
  probes and injected faults) and responses slower than 5s
- Visible text containing `undefined`, `NaN`, `[object Object]`, or a
  JSON-looking blob (`{"` … `"}`)
- Horizontal overflow (`scrollWidth > clientWidth`) at phone widths
- Elements whose text overflows their box
- Broken images (`naturalWidth === 0` after load)
- Buttons/links with no accessible name

Plus: one end-of-persona visual review where Gemini inspects the persona's
screenshots for layout breakage.

### Limits and error handling

- Global step budget per run (default 1500 for travelers/breakers; the
  inspectors' matrices are bounded by their definitions) and per-item cap (40).
- Layout matrix size is roughly routes × 17 widths × orientations × 2 themes
  × states; geometry checks are cheap, so they run on every cell. Gemini
  vision calls are bounded as described in section 5. The run prints the
  planned cell and call counts before starting.
- Gemini errors: 3 retries with exponential backoff; 3 consecutive invalid
  JSON responses → item `blocked` with reason recorded.
- A crashed browser context marks its item `blocked` and the coordinator
  continues.
- Cleanup always runs.

## 9. Side-effect safety

- **Localhost only:** launcher aborts if the base URL host isn't
  `localhost`/`127.0.0.1`.
- **Email:** local API started with SMTP_* blank → no emails sent
  (forgot-password, welcome, triage).
- **Push:** VAPID keys stay set so push can be tested. This is safe because
  the notification scheduler does not run in local dev
  (`server/index.ts` starts it only when `NODE_ENV=production` or
  `ENABLE_SCHEDULER=1`; the launcher never sets the latter), and
  `server/push.ts` sends only to the subscriptions of the user an event
  targets — swarm actions only target swarm users.
- **Feedback triage routine:** reads the shared `Feedback` collection. One
  server change: when `SWARM_RUN=1`, feedback is created with
  `agentReviewed: true`, so the hourly routine never picks it up. Cleanup
  also deletes it.
- **Accounts:** emails `swarm-<runId>-<persona>@example.com`; deleted with
  all cascaded data at the end of the run (shared DB with production).

## 10. Report (`swarm-reports/<ts>/index.html`)

Uses the TripMate "Night Atlas" palette, readable at 390px width.

1. **Verdict:** confirmed findings by severity, coverage % (functional,
   layout, resilience separately), mean persona "would keep using" score
   (1–10).
2. **Coverage grid:** items × checks, green/red/grey; each cell expands to
   the actions taken.
3. **Layout grid:** routes × widths (per theme/orientation toggle), each cell
   green/red with the annotated screenshot on click.
4. **Resilience grid:** routes/actions × faults × platform (web / Android),
   plus the notifications checklist per platform.
5. **Findings** worst-first: severity (blocker/major/minor/polish), route,
   persona or inspector, platform/layout cell, reproduction steps,
   screenshot, console/network evidence, confirmed/flaky.
6. **Persona summaries:** each traveler's first-person debrief + score.
7. `findings.json` alongside.

## 11. Testing the swarm

- Unit tests (vitest): each oracle and each geometry check against fixture
  pages; coordinator re-queues uncovered items and caps retries; LLM response
  validation; fault-injection expectations.
- Planted-bug fixture pages: static pages with known bugs (console error,
  horizontal overflow, overlapping buttons, clipped text, tiny tap target,
  content hidden behind a fixed bottom bar, `NaN` text, broken image,
  unlabeled button, infinite spinner, raw JSON error, white screen on 500)
  that the oracles and inspectors must all catch, and a clean page that must
  produce zero findings.
- Smoke run: 1 traveler + layout inspector on 2 routes + resilience inspector
  on 1 route, against local dev, before any full run.

## 12. Out of scope

Production target, real Android APK/TWA testing (Android is emulated),
desktop Tauri app, scheduled/unattended runs, GitHub issue filing, social
discussion simulation, auto-fixing findings. Each can be added later.
