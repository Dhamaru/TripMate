# TripMate — Standing Instructions

These override default behavior. Follow exactly.

## 1. Mobile + tablet layout — check automatically, every UI change

Any change touching a page, component, or shared style must be checked at mobile and tablet breakpoints automatically, without being asked. Don't wait for the user to say "check mobile." Use the project's actual breakpoints (see `tailwind.config`/`index.css`), not arbitrary widths. At minimum: a small phone width (~375px), a large phone (~430px), and a tablet width (~768–1024px). Check both portrait orientations where relevant (e.g. drawers, modals, bottom nav).

## 2. Page checks must cover logical + technical + visual, and a real-user pass

When checking a specific page or feature (bug investigation, "is this working," pre-ship verification), don't stop at reading the code or a single layer:
- **Logical**: does the behavior make sense end-to-end (data flow, state, edge cases)?
- **Technical**: does it actually run — typecheck, build, no console/network errors?
- **Visual**: does it render correctly — no layout breaks, clipped text, wrong colors/spacing, broken responsive behavior?
- **Real-user pass**: separately, actually exercise the flow the way a real user would live — real signup/login, real clicks, real network calls against the running app (dev or production, matching context) — not just static code reading or a unit test. This is the standing rule already in place for "never declare fixed without live proof"; it applies to every page-specific check, not just bug fixes.

## 3. Run agents whenever generating a report

Any time a deliverable is a report (security audit, QA sweep, production-readiness audit, design audit, etc.), dispatch the appropriate specialized agent(s) to do the actual investigation/verification work feeding that report, rather than compiling it solely from a single pass of manual reading. Use parallel agents when the report has independent sections (e.g. multiple pages, multiple subsystems).

## 4. Daily cross-page check

Once a day, sweep all major pages/flows in the app for regressions or drift (not just the page currently being worked on). This is a lightweight pass — confirm each page still loads, renders correctly, and has no new console/network errors — not a full audit. Flag anything found; don't silently fix without surfacing it first unless it's trivially safe.

---

## Existing standing rules (carried over from session memory, restated here for durability)

- **Never declare something fixed without live proof.** Verify every fix via real signup/real API calls against the running app (production when the fix is production-scoped), not just unit tests or static code reading.
- **QA/test account hygiene.** Any throwaway QA/test account created for verification (e.g. `@example.com` pattern) must be deleted, with all cascaded data, once verification is done. Never count test/QA/guest accounts in real-user stats.
