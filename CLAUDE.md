# TripMate — Standing Instructions

These override default behavior. Follow exactly.

## 0. Read CONTEXT.md first, every task

Before grepping/exploring the codebase or reading multiple source files to
orient on a task, read `CONTEXT.md` at the repo root. It's a maintained
summary (stack, file map, non-obvious gotchas, known open issues, recent
work log) written specifically to save the token cost of re-discovering
things every session. Only fall back to scanning actual files/docs when
`CONTEXT.md` doesn't answer the question, or when verifying something it
claims (it can go stale).

At the end of any task that changes architecture, fixes a real bug, or
learns something non-obvious, update `CONTEXT.md` — edit the relevant
section in place, don't just append. Add one line to the work log, and
trim log entries older than ~4-6 weeks so the file stays cheap to read.

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

## 5. Think like the user first, the developer second

Before writing a fix, ask what a real traveler using this feature would actually want — not just what makes the code/prompt technically satisfy a rule. An instruction to "make X apply everywhere" or "add a rule so Y never happens" is not permission to apply it blindly wherever it technically fits — check whether the specific place you're about to apply it actually makes sense for the person on the other end.

Concrete case that prompted this rule: fixing an AI itinerary repeating the same landmark under reworded titles, the fix told the model to "branch out to nearby villages/day-trip spots within ~30km" when a small destination runs out of real attractions. That's backwards — a traveler who planned a 3-day trip to one place did not ask to be redirected to an unrelated town 30km away just so the itinerary looks varied; that adds real driving time, cost, and logistics they never approved. The user-first fix is to spend more time at fewer genuine spots (different real activities/experiences in the same area) or explicitly leave the day lighter, not to invent scope-creeping detours to hit a quota.

When a fix could go two ways — technically-correct-but-presumptuous, or genuinely-useful-to-the-person-using-it — take the second one, and say so.

## 6. Production/investor-grade bar — verification is not optional overhead

This app is meant to be shown to real users and investors, not just pass a green checkmark. A single session (2026-09-03) shipped ~13 real bugs that all lived through typecheck/build/vitest passing and an earlier "looks done" pass — the user had to personally exercise real flows repeatedly to surface them. That's the standard to stop repeating: **typecheck/build/unit-tests-green is table stakes, not evidence of correctness.** Before declaring any fix or feature done:

- **Multi-angle, not happy-path-once.** Check the exact reported scenario, the adjacent scenarios it implies (a coordinate-resolution fix implies checking title-normalization, empty-input, and the field-name variant too — not just the one call site that was reported), legacy/pre-existing data shapes (not just freshly-created test data), and concurrent/multi-user paths where relevant.
- **Dispatch agents for independent verification, not just for report-writing.** Rule 3 already requires agents for report deliverables — extend that instinct to any change with real surface area (touches a shared data shape, a widely-called handler, an endpoint many flows hit): a second, independent pass (code-reviewer and/or qa-investigator) catches what the implementer's own pass is structurally blind to, exactly as it did this session (the ad-hoc-marker leak and the coord-guard gap were both found by agent review after the implementer's own live pass called it done). Use the strongest available model for that verification pass, not a fast/cheap default — this is exactly the kind of judgment call worth paying for.
- **Test data that mirrors production, not just fresh happy-path fixtures.** This session's most severe bug (phantom itinerary days) only reproduced because a real, pre-existing trip's data shape (day-only, no dayIndex) differed from what a fresh test-created trip would have. When touching an existing data shape, test against a real existing record, not only a newly-created one.
- **Say what's still unverified, plainly.** If a fix is code-complete and unit-tested but hasn't had a live pass yet (rate limits, cost, time), say exactly that — don't let "typecheck/build/test clean" get reported in a way that reads as "verified live" when it isn't.

## 7. Session resumability — CONTEXT.md must always be pickup-ready

Token/session breaks will happen. The user should never have to re-explain state or re-catch a mistake because a fresh session lost the thread. Keep `CONTEXT.md`'s "Known open issues" section current as a live snapshot, not just a chronological log: anything code-complete-but-not-yet-live-verified, anything explicitly deferred, and the concrete next action, so a session with zero prior context can read it and continue correctly — not re-discover, not re-ask, not repeat work. Update it as state changes, not just at the end of a task.

---

## Existing standing rules (carried over from session memory, restated here for durability)

- **Never declare something fixed without live proof.** Verify every fix via real signup/real API calls against the running app (production when the fix is production-scoped), not just unit tests or static code reading.
- **QA/test account hygiene.** Any throwaway QA/test account created for verification (e.g. `@example.com` pattern) must be deleted, with all cascaded data, once verification is done. Never count test/QA/guest accounts in real-user stats.
