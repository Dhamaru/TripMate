# Persona Swarm â€” Design Spec

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

### Borrowed from MiroFish / dropped

- **Kept:** persona generation from a seed (here: the coverage map + persona
  definitions), parallel simulation, a report stage that synthesizes results.
- **Dropped:** Zep memory graph, OASIS social-network simulation, Python stack.
  None of them serve QA, and they add cost and dependencies.

## 2. Location and stack

`tools/swarm/` in the TripMate repo. TypeScript run with `tsx`. Uses
dependencies already installed: `@playwright/test` (Chromium), `openai`.
No new dependencies. Entry: `npm run swarm -- [--personas N] [--items glob] [--max-steps N]`.

Reports are written to `swarm-reports/<ISO-timestamp>/` (gitignored).

## 3. Coverage map (`tools/swarm/coverage.ts`)

The checklist that makes "check everything" enforceable. A typed TS array (no YAML parser is installed, and types catch typos in playbook names). Each item, shown here as YAML for readability:

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

## 4. Personas (`tools/swarm/personas.ts`)

Each persona: `id`, `name`, `goal`, `viewport`, `theme`, `behaviour` (prompt
text describing how they act), `playbooks` (categories they apply).

**Travelers (8):**

1. Budget backpacker â€” 375px phone, dark, impatient, cheap trips
2. Family of 4 planning a 10-day trip â€” tablet 768px, light, budget + packing heavy
3. Elderly first-time user â€” 430px phone, light, slow, misreads labels, uses Back often
4. Non-English speaker â€” desktop, uses translate and non-Latin input
5. Business traveler â€” desktop 1280px, rushes, double-clicks, multiple tabs
6. Group trip pair (A + B) â€” two browser contexts, collaboration and voting
7. Offline hiker â€” 375px phone, maps offline download then goes offline
8. Keyboard-only accessibility user â€” desktop, never uses the mouse

**Breakers (3):** pure adversarial testers, one each focused on
input/injection, state/concurrency, and authorization/data leaks.

## 5. Failure-hunting playbooks

The persona prompt includes the playbook categories assigned to the current
item. Each category is a concrete list of moves:

- **input** â€” empty, 5000-char strings, emoji, RTL text, `<script>alert(1)</script>`,
  negative/zero/huge numbers, past dates, end before start, 365-day trip,
  nonexistent destination, duplicate entries.
- **state** â€” reload mid-flow, Back/Forward, double-submit, rapid repeated
  clicks, same resource in two tabs, sign out then Back.
- **authz** â€” open another persona's `/app/trips/:id` and `/app/journal/:id`
  by URL; open share links signed out and confirm no private fields
  (expenses, notes, collaborator emails, `userVotes`) are visible.
- **environment** â€” viewport 375/430/768/1280, both themes, `setOffline`
  mid-action, slow-3G throttling, geolocation denied/granted/moving.
- **multiuser** â€” concurrent edits to the same trip, voting, live update
  delivery to the other context.
- **ai** â€” Atlas off-topic question (must decline gracefully), raw JSON must
  never be rendered, prompt-injection attempt, slow/timed-out generation
  must end in a usable state.
- **consistency** â€” after every create/update/delete: survives reload, and is
  reflected everywhere it should be (expense â†’ budget totals, deleted trip â†’
  gone from history, renamed trip â†’ new name in lists).

## 6. Architecture

| Unit             | Responsibility                                                                                                                                                                | Depends on                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `launcher.ts`    | Start API (`SWARM_RUN=1`, SMTP_* and VAPID_* blank) and frontend as separate background processes; poll health; refuse any non-localhost base URL                             | â€”                       |
| `coordinator.ts` | Assign coverage items to personas; run â‰¤4 browser contexts concurrently; re-run rounds until every item is `pass`/`fail`/`blocked` (max 2 retries per item, then `blocked`) | agent, personas, coverage |
| `agent.ts`       | One persona working one coverage item (loop below)                                                                                                                            | oracles, llm              |
| `llm.ts`         | Gemini call, JSON parsing/validation (Zod), retry with backoff, token/step accounting                                                                                         | openai SDK                |
| `oracles.ts`     | Automatic failure detectors attached to every page                                                                                                                            | Playwright                |
| `verify.ts`      | Replay each finding's recorded actions in a fresh context â†’ `confirmed`/`flaky`; dedupe by (route, oracle type, normalized message)                                         | Playwright                |
| `report.ts`      | Render `index.html` + `findings.json`                                                                                                                                         | â€”                       |
| `cleanup.ts`     | Delete all `swarm-<runId>-*@example.com` accounts and cascaded data by exact ID; runs in `finally` and on SIGINT                                                              | API / DB                  |

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

Element targeting uses ARIA refs from the snapshot, not CSS or text
selectors, consistent with the repo's "no text/CSS selectors" rule (the
swarm discovers elements; it doesn't hard-code them).

Collaboration items run as one coordinator task controlling two contexts
(A and B) so each can verify the other's changes.

### Automatic oracles (independent of LLM judgment)

- `console.error` and `pageerror` events
- Network responses â‰¥400 (excluding expected 401 on deliberate authz probes)
  and responses slower than 5s
- Visible text containing `undefined`, `NaN`, `[object Object]`, or a
  JSON-looking blob (`{"` â€¦ `"}`)
- Horizontal overflow (`scrollWidth > clientWidth`) at phone widths
- Elements whose text overflows their box
- Broken images (`naturalWidth === 0` after load)
- Buttons/links with no accessible name

Plus: one end-of-persona visual review where Gemini inspects the persona's
screenshots for layout breakage.

### Limits and error handling

- Global step budget per run (default 1500) and per-item cap (40).
- Gemini errors: 3 retries with exponential backoff; 3 consecutive invalid
  JSON responses â†’ item `blocked` with reason recorded.
- A crashed browser context marks its item `blocked` and the coordinator
  continues.
- Cleanup always runs.

## 7. Side-effect safety

- **Localhost only:** launcher aborts if the base URL host isn't
  `localhost`/`127.0.0.1`.
- **Email:** local API started with SMTP_* blank â†’ no emails sent
  (forgot-password, welcome, triage).
- **Push:** VAPID_* blank â†’ push no-ops.
- **Feedback triage routine:** reads the shared `Feedback` collection. One
  server change: when `SWARM_RUN=1`, feedback is created with
  `agentReviewed: true`, so the hourly routine never picks it up. Cleanup
  also deletes it.
- **Accounts:** emails `swarm-<runId>-<persona>@example.com`; deleted with
  all cascaded data at the end of the run (shared DB with production).

## 8. Report (`swarm-reports/<ts>/index.html`)

Uses the TripMate "Night Atlas" palette, readable at 390px width.

1. **Verdict:** confirmed findings by severity, coverage %, mean persona
   "would keep using" score (1â€“10).
2. **Coverage grid:** items Ã— checks, green/red/grey; each cell expands to
   the actions taken.
3. **Findings** worst-first: severity (blocker/major/minor/polish), route,
   persona, reproduction steps, screenshot, console/network evidence,
   confirmed/flaky.
4. **Persona summaries:** each persona's first-person debrief + score.
5. `findings.json` alongside.

## 9. Testing the swarm

- Unit tests (vitest): each oracle against fixture pages; coordinator
  re-queues uncovered items and caps retries; LLM response validation.
- Planted-bug fixture page: a static page with known bugs (console error,
  overflow, `NaN` text, broken image, unlabeled button) that the oracles
  must all catch.
- Smoke run: 1 persona, 3 coverage items, against local dev, before any
  full run.

## 10. Out of scope

Production target, scheduled/unattended runs, GitHub issue filing, social
discussion simulation, auto-fixing findings. Each can be added later.
