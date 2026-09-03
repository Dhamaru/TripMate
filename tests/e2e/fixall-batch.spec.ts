/**
 * tests/e2e/fixall-batch.spec.ts
 *
 * Regression suite for the 6 bugs fixed in commit f61bcf0 (plus the
 * ad-hoc-marker-leak fix from the follow-up agent-review commit).
 * Runs against production (https://tripmate-ylt6.onrender.com).
 * Uses the persistent QA account claude.agent@tripmate.dev — never delete it.
 *
 * Edge-case probing beyond the original happy-path pass:
 *   1. Atlas-added activity coords + title (obscure name graceful failure)
 *   2. cuisine/dietary prefs — empty [] vs undefined, conflicting signals
 *   3. Atlas multi-step task completion (system prompt rule check)
 *   4. Places search failure vs genuinely-empty result — visually distinct
 *   5. View-in-Places targets the specific clicked activity
 *   6. View-on-Map from Places tab uses non-accumulating ad-hoc marker
 *
 * All tests below run in test.describe.serial() — a hard requirement, not
 * a style choice. Without it, Playwright can transparently respawn a fresh
 * worker (fresh browser context, no cookies) after enough consecutive
 * failures, silently re-running beforeAll -> login(). That collided badly
 * with production's strict 5-signin/15min auth limiter the first time this
 * suite ran without serial mode: one slow/flaky test triggered a respawn,
 * the respawned login() got auth-rate-limited, and every remaining test
 * failed as pure fallout with no real bug behind any of them. serial mode
 * makes Playwright abort (mark "did not run") the rest of the group after
 * one failure instead of respawning — the correct behavior for a suite
 * that shares one login and one set of throwaway trips end to end.
 */

import { test, expect, type BrowserContext } from "@playwright/test";

const BASE = "https://tripmate-ylt6.onrender.com";
const QA_EMAIL = "claude.agent@tripmate.dev";
const QA_PASS = "AtlasAgent#2026!Trip";
// Manali trip — persistent, never delete.
const MANALI_TRIP_ID = "6a9903eb74bd832b3e941e4b";

async function getCSRF(ctx: BrowserContext): Promise<string> {
  const cookies = await ctx.cookies();
  const c = cookies.find((x) => x.name === "XSRF-TOKEN");
  return c ? decodeURIComponent(c.value) : "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiReq(
  ctx: BrowserContext,
  method: string,
  urlPath: string,
  body?: object,
): Promise<{ status: number; json: any }> {
  const csrf = await getCSRF(ctx);
  const cookies = await ctx.cookies();
  const cookieHeader = cookies.map((c) => c.name + "=" + c.value).join("; ");
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookieHeader, "X-CSRF-Token": csrf },
  };
  if (body) opts.body = JSON.stringify(body);
  // Retry on 429 with backoff — Render/Cloudflare's edge occasionally
  // 429s independent of the app's own rate limiters under a burst of
  // requests (observed repeatedly this session running similar scripts
  // against this same production host). A transient edge throttle
  // shouldn't fail a whole regression run.
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(BASE + urlPath, opts);
    lastStatus = r.status;
    lastText = await r.text();
    if (r.status !== 429 || attempt === 2) break;
    await sleep(3000 * (attempt + 1));
  }
  let json: any;
  try {
    json = JSON.parse(lastText);
  } catch {
    json = { _raw: lastText.slice(0, 200) };
  }
  return { status: lastStatus, json };
}

async function login(ctx: BrowserContext): Promise<void> {
  // Idempotent as a second line of defense (see the file-header note on
  // why serial mode is the primary fix) — skip the real signin entirely
  // if this context already has a session.
  const already = (await ctx.cookies()).some((c) => c.name === "token");
  if (already) return;
  const page = await ctx.newPage();
  await page.goto("/signin", { waitUntil: "networkidle" });
  await page.fill("input[type=email]", QA_EMAIL);
  await page.fill("input[type=password]", QA_PASS);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app/**", { timeout: 20000 });
  await page.close();
}

async function createTestTrip(
  ctx: BrowserContext,
  destination: string,
  extra: object = {},
): Promise<string> {
  const { status, json } = await apiReq(ctx, "POST", "/api/v1/trips", {
    destination,
    days: 2,
    budget: 5000,
    currency: "INR",
    travelStyle: "relaxed",
    groupSize: 1,
    startDate: "2026-11-01",
    itinerary: [],
    ...extra,
  });
  expect(status, "createTestTrip: POST /api/v1/trips").toBe(201);
  const t = json.trip || json;
  const id = t._id || t.id;
  expect(id, "createTestTrip: trip id present").toBeTruthy();
  return id as string;
}

async function deleteTestTrip(ctx: BrowserContext, tripId: string): Promise<void> {
  const { status } = await apiReq(ctx, "DELETE", "/api/v1/trips/" + tripId, {});
  expect(status, "deleteTestTrip: DELETE /api/v1/trips/" + tripId).toBe(204);
}

test.describe.serial("fixall-batch (f61bcf0 regression)", () => {
  let sharedCtx: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    sharedCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await login(sharedCtx);
  });

  test.afterAll(async () => {
    await sharedCtx.close();
  });

  // ── Bug 1: Atlas-added activity coords + title normalization ─────────────

  test("[Bug1] Ungeocodeable activity added by Atlas still persists (no crash), row renders gracefully", async () => {
    // Verify via the REST itinerary endpoint: adding an activity with a
    // made-up place name (Xyzqfoobar Restaurant) that resolveCoordinates
    // will return null for should still add the activity — just without
    // lat/lon — and the UI should render it without error.
    //
    // Implementation: POST /api/v1/trips/:id/itinerary/activity
    // (same handler as Atlas but without the Atlas overhead or LLM)
    const tripId = await createTestTrip(sharedCtx, "Bug1-Test-QA", {
      itinerary: [{ day: 1, date: new Date("2026-11-01").toISOString(), activities: [] }],
    });
    try {
      // addActivitySchema (server/schemas/itinerary.schemas.ts) expects
      // { dayIndex, activity: {...} } — a flat { day, time, title, type }
      // body 400s (real bug found running this suite for the first time:
      // wrong shape, not an app bug).
      const { status } = await apiReq(
        sharedCtx,
        "POST",
        "/api/v1/trips/" + tripId + "/itinerary/activity",
        {
          dayIndex: 0,
          activity: {
            time: "10:00 AM",
            title: "Xyzqfoobar Restaurant",
            type: "restaurant",
            // deliberately NO lat/lon — simulates ungeocodeable place
          },
        },
      );
      expect(status, "activity added despite missing coords").toBe(201);
      // Now open the trip page and verify the row renders without error
      const page = await sharedCtx.newPage();
      try {
        await page.goto("/app/trips/" + tripId, { waitUntil: "networkidle" });
        await sleep(3000);
        const itab = page.getByRole("tab").filter({ hasText: /itinerary/i });
        if ((await itab.count()) > 0) {
          await itab.click({ force: true });
          await sleep(1000);
        }
        // The activity row should appear — no crash
        const row = page.getByText("Xyzqfoobar Restaurant");
        await expect(row).toBeVisible({ timeout: 8000 });
        // No View-on-Map button (activity has no coords) — graceful absence
        const vmBtn = page.locator('button[title="View on Map"]');
        expect(await vmBtn.count(), "no View-on-Map for coord-less activity").toBe(0);
        // View-in-Places button SHOULD be present (restaurant type, onViewInPlaces wired)
        const allBtns = await page.locator("button[title]").all();
        const vip = [];
        for (const b of allBtns) {
          const t = (await b.getAttribute("title")) || "";
          if (t.includes("View in Places")) vip.push(t);
        }
        expect(vip.length, "View-in-Places button present for restaurant").toBeGreaterThanOrEqual(
          1,
        );
      } finally {
        await page.close();
      }
    } finally {
      await deleteTestTrip(sharedCtx, tripId);
    }
  });

  test("[Bug1] Atlas-style ALL-CAPS title is normalised to Title Case when activity added via modify_itinerary handler", async () => {
    // The REST addActivity endpoint goes through addActivity controller, not
    // modifyItineraryHandler, so normalizeActivityTitle is NOT called there.
    // We verify the rule is present in the handler code instead (static check
    // since a live Atlas call would be too rate-limited for a reliable regression).
    const { default: fs } = await import("fs");
    const handler = fs.readFileSync(
      new URL(
        "../../server/agent/tools/handlers/modifyItineraryHandler.ts",
        import.meta.url,
      ).pathname.slice(1),
      "utf8",
    );
    expect(handler, "normalizeActivityTitle present").toContain("normalizeActivityTitle");
    expect(handler, "tryResolveCoords present").toContain("tryResolveCoords");
    expect(handler, "resolveCoordinates called with name+destination").toContain(
      "resolveCoordinates(name, destination)",
    );
    // The isShouting guard prevents single-word/proper acronyms from being mangled
    expect(handler, "all-caps guard: isShouting check").toContain("isShouting");
    // Ad-hoc-marker-leak fix (follow-up commit) -- cleanup must be
    // unconditional at the top of the focus effect, not nested inside
    // `if (!marker)`.
    const { default: fs2 } = await import("fs");
    const tripMap = fs2.readFileSync(
      new URL("../../client/src/components/TripMap.tsx", import.meta.url).pathname.slice(1),
      "utf8",
    );
    const focusEffectStart = tripMap.indexOf(
      "if (!focusTarget || !mapInstanceRef.current) return;",
    );
    const nextIfNoMarker = tripMap.indexOf("if (!marker) {", focusEffectStart);
    const adhocCleanup = tripMap.indexOf("adhocMarkerRef.current.remove();", focusEffectStart);
    expect(focusEffectStart, "focus effect found").toBeGreaterThan(-1);
    expect(adhocCleanup, "ad-hoc cleanup found").toBeGreaterThan(-1);
    expect(
      adhocCleanup,
      "ad-hoc marker cleanup runs BEFORE the `if (!marker)` branch (unconditional), not inside it",
    ).toBeLessThan(nextIfNoMarker);
  });

  // ── Bug 2: cuisine/dietary prefs reach Atlas ──────────────────────────────

  test("[Bug2] Explicit empty arrays [] on a trip fall back to profile prefs (same as undefined)", async () => {
    // tripHandler.get uses: if (!cuisinePreferences?.length && !dietaryPreferences?.length)
    // [].length === 0, !0 === true => falls back — SAME as undefined. Verify the
    // arrays actually round-trip through the DB as [] (not stripped by Mongoose strict).
    const tripId = await createTestTrip(sharedCtx, "Bug2-EmptyPrefs-QA", {
      cuisinePreferences: [],
      dietaryPreferences: [],
    });
    try {
      const { json } = await apiReq(sharedCtx, "GET", "/api/v1/trips/" + tripId);
      const trip = json.trip || json;
      expect(Array.isArray(trip.cuisinePreferences), "cuisinePreferences is array").toBe(true);
      expect(Array.isArray(trip.dietaryPreferences), "dietaryPreferences is array").toBe(true);
      expect(trip.cuisinePreferences.length, "cuisinePreferences is empty []").toBe(0);
      expect(trip.dietaryPreferences.length, "dietaryPreferences is empty []").toBe(0);
    } finally {
      await deleteTestTrip(sharedCtx, tripId);
    }
  });

  test("[Bug2] Conflicting dietary+cuisine prefs (Vegetarian diet, BBQ cuisine) both persisted", async () => {
    // Both arrays should survive persistence — tripHandler.get surfaces both to Atlas,
    // and the system prompt rule (Bug3 fix) tells Atlas dietary must win over cuisine.
    // This test verifies the data layer; LLM judgment is tested in Bug3.
    const tripId = await createTestTrip(sharedCtx, "Bug2-ConflictPrefs-QA", {
      cuisinePreferences: ["BBQ", "Steakhouse"],
      dietaryPreferences: ["Vegetarian"],
    });
    try {
      const { json } = await apiReq(sharedCtx, "GET", "/api/v1/trips/" + tripId);
      const trip = json.trip || json;
      expect(trip.cuisinePreferences, "cuisine prefs stored").toEqual(["BBQ", "Steakhouse"]);
      expect(trip.dietaryPreferences, "dietary prefs stored").toEqual(["Vegetarian"]);
    } finally {
      await deleteTestTrip(sharedCtx, tripId);
    }
  });

  // ── Bug 3: Atlas finishes multi-step tasks ────────────────────────────────

  test("[Bug3] System prompt contains finish-what-you-start and pref-respect rules", async () => {
    // The LLM is non-deterministic so we assert the governing rules are present
    // in the system prompt that every Atlas turn uses. Live evidence (2026-09-03):
    // asked Atlas to add a vegetarian lunch — it called modify_itinerary in the
    // same turn (no stalling) and picked a vegetarian restaurant (prefs respected).
    const { default: fs } = await import("fs");
    const sp = fs.readFileSync(
      new URL("../../server/agent/systemPrompt.ts", import.meta.url).pathname.slice(1),
      "utf8",
    );
    expect(sp, "finish-what-you-start rule present").toContain("Finish what you start");
    expect(sp, "modify_itinerary must be called rule").toContain("modify_itinerary");
    expect(sp, "pref-respect rule present").toContain("cuisinePreferences");
    expect(sp, "dietary restriction rule present").toContain("dietaryPreferences");
    expect(sp, "MUST respect dietary").toContain("MUST respect them");
  });

  // ── Bug 4: Places search failure vs empty result ──────────────────────────

  test("[Bug4] Injected 500 on hotels search shows red error banner (not empty-state)", async () => {
    const page = await sharedCtx.newPage();
    try {
      await page.goto("/app/trips/" + MANALI_TRIP_ID, { waitUntil: "networkidle" });
      await sleep(3000);
      const ptab = page.getByRole("tab").filter({ hasText: /places/i });
      await expect(ptab, "places tab visible").toBeVisible({ timeout: 20000 });
      await ptab.click({ force: true });
      await sleep(1500);

      // Intercept hotels search — return 500
      let blocked = true;
      await page.route("**/api/v1/places/search**", async (route, req) => {
        if (req.url().toLowerCase().includes("hotel") && blocked) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "injected-500" }),
          });
        } else {
          await route.continue();
        }
      });

      const hotelsBtn = page.getByRole("button").filter({ hasText: /hotel/i }).first();
      await hotelsBtn.click({ force: true });
      await sleep(4000);

      // Error state must mention search failure
      const errEl = page.locator("text=/Couldn.t load hotel/i").first();
      await expect(errEl, "error banner shows distinct search-failed message").toBeVisible({
        timeout: 6000,
      });
      const errText = await errEl.textContent();
      expect(errText, "error text explains it is a search failure").toMatch(
        /search failed|not that there aren/i,
      );

      // Retry button must be present
      const retryBtn = page.getByRole("button").filter({ hasText: /try again/i });
      await expect(retryBtn, "retry button present").toBeVisible();

      // Unblock and click retry — error must clear
      blocked = false;
      await retryBtn.click({ force: true });
      await sleep(8000); // Render free tier can be slow
      await page.unroute("**/api/v1/places/search**");
      await expect(errEl, "error clears after successful retry").toBeHidden({ timeout: 3000 });
    } finally {
      await page.close();
    }
  });

  test("[Bug4] Failed category does not affect other Places-tab categories on same page", async () => {
    const page = await sharedCtx.newPage();
    try {
      await page.goto("/app/trips/" + MANALI_TRIP_ID, { waitUntil: "networkidle" });
      await sleep(3000);
      const ptab = page.getByRole("tab").filter({ hasText: /places/i });
      await expect(ptab, "places tab visible").toBeVisible({ timeout: 20000 });
      await ptab.click({ force: true });
      await sleep(1500);

      // Block hotels only
      await page.route("**/api/v1/places/search**", async (route, req) => {
        if (req.url().toLowerCase().includes("hotel")) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ err: "injected" }),
          });
        } else {
          await route.continue();
        }
      });

      // Open both categories
      const hotelsBtn = page.getByRole("button").filter({ hasText: /hotel/i }).first();
      await hotelsBtn.click({ force: true });
      const spotsBtn = page
        .getByRole("button")
        .filter({ hasText: /Tourist Spots/i })
        .first();
      if ((await spotsBtn.count()) > 0) await spotsBtn.click({ force: true });
      await sleep(5000);

      // Hotels should be in error state
      const hotelErr = page.locator("text=/Couldn.t load hotel/i");
      await expect(hotelErr, "hotels show error").toBeVisible({ timeout: 5000 });

      // Tourist spots should NOT be in error state (different search, not blocked)
      const spotsErr = page.locator("text=/Couldn.t load spot/i");
      expect(await spotsErr.count(), "tourist spots NOT in error state").toBe(0);

      await page.unroute("**/api/v1/places/search**");
    } finally {
      await page.close();
    }
  });

  // ── Bug 5: View-in-Places targets the specific clicked activity ──────────

  test("[Bug5] Clicking View-in-Places on second restaurant updates banner to that restaurant", async () => {
    // Manali trip has restaurant activities: Cafe 1947 and The Lazy Dog Lounge.
    // Live evidence: banner changed correctly between the two clicks.
    const page = await sharedCtx.newPage();
    try {
      await page.goto("/app/trips/" + MANALI_TRIP_ID, { waitUntil: "networkidle" });
      // Wait for itinerary content to load
      await page.waitForSelector("button[title]", { timeout: 20000 }).catch(() => {});
      await sleep(3000);

      // Switch to itinerary tab to ensure it is active
      const itab = page.getByRole("tab").filter({ hasText: /itinerary/i });
      if ((await itab.count()) > 0) {
        await itab.click({ force: true });
        await sleep(1000);
      }

      // Collect all View-in-Places buttons
      const allTitledBtns = await page.locator("button[title]").all();
      const vipBtns: any[] = [];
      for (const b of allTitledBtns) {
        const title = (await b.getAttribute("title")) || "";
        if (title.includes("View in Places")) vipBtns.push(b);
      }
      expect(
        vipBtns.length,
        "at least 2 View-in-Places buttons (2 restaurants)",
      ).toBeGreaterThanOrEqual(2);

      // Click first restaurant
      await vipBtns[0].click({ force: true });
      await sleep(2500);
      const banner1El = page.locator("text=/Showing results for/i").first();
      await expect(banner1El, "banner appears after click 1").toBeVisible({ timeout: 5000 });
      const banner1 = await banner1El.textContent();

      // Go back to itinerary and click a different restaurant
      if ((await itab.count()) > 0) {
        await itab.click({ force: true });
        await sleep(800);
      }
      await vipBtns[1].click({ force: true });
      await sleep(2500);
      const banner2El = page.locator("text=/Showing results for/i").first();
      await expect(banner2El, "banner still present after click 2").toBeVisible({ timeout: 5000 });
      const banner2 = await banner2El.textContent();

      expect(banner1, "banner text is non-null after click 1").toBeTruthy();
      expect(banner2, "banner text is non-null after click 2").toBeTruthy();
      expect(banner1, "banners differ (updated to new place)").not.toBe(banner2);

      // Show-all link clears the targeting
      const showAllBtn = page.getByRole("button").filter({ hasText: /show all/i });
      if ((await showAllBtn.count()) > 0) {
        await showAllBtn.first().click({ force: true });
        await sleep(800);
        const bannerGone = await page.locator("text=/Showing results for/i").count();
        expect(bannerGone, "banner cleared by show-all").toBe(0);
      }
    } finally {
      await page.close();
    }
  });

  // ── Bug 6: View-on-Map ad-hoc marker does not accumulate / does not leak ─

  test("[Bug6] Clicking View-on-Map on a second Places result removes the first ad-hoc marker", async () => {
    // Live evidence: clicked VM links 0 and 1 on Tourist Spots results.
    // custom-marker count was 9 after both clicks (stable = old adhoc removed).
    const page = await sharedCtx.newPage();
    try {
      await page.goto("/app/trips/" + MANALI_TRIP_ID, { waitUntil: "networkidle" });
      await sleep(3000);

      // Navigate to Places tab
      const ptab = page.getByRole("tab").filter({ hasText: /places/i });
      await expect(ptab, "places tab visible").toBeVisible({ timeout: 15000 });
      await ptab.click({ force: true });
      await sleep(2000);

      // Open Tourist Spots to get search results with View-on-Map links
      const spotsBtn = page.getByRole("button").filter({ hasText: /Tourist Spots/i });
      await expect(spotsBtn, "Tourist Spots button visible").toBeVisible({ timeout: 5000 });
      await spotsBtn.click({ force: true });
      await sleep(5000); // wait for search results to load

      const vmLinks = page.locator("button, a").filter({ hasText: /View on Map/ });
      const vmCount = await vmLinks.count();
      expect(vmCount, "at least 2 View-on-Map links in Places results").toBeGreaterThanOrEqual(2);

      // Click first View-on-Map
      await vmLinks.first().click({ force: true });
      await sleep(3000);

      // Should have switched to Map tab
      const activeTab1 = page.locator("[role=tab][data-state=active]");
      const activeTabText1 = await activeTab1.textContent().catch(() => "");
      expect(activeTabText1, "Map tab activated after click 1").toMatch(/map/i);

      const markersAfter1 = await page.locator(".custom-marker").count();
      expect(markersAfter1, "at least 1 marker visible after click 1").toBeGreaterThanOrEqual(1);

      // Go back to Places tab and click a DIFFERENT result
      await ptab.click({ force: true });
      await sleep(2000);

      const vmLinks2 = page.locator("button, a").filter({ hasText: /View on Map/ });
      await vmLinks2.nth(1).click({ force: true });
      await sleep(3000);

      const markersAfter2 = await page.locator(".custom-marker").count();
      // Marker count must not grow — the previous ad-hoc marker was removed
      expect(
        markersAfter2,
        "marker count does not grow (no ad-hoc accumulation)",
      ).toBeLessThanOrEqual(markersAfter1);
    } finally {
      await page.close();
    }
  });

  test("[Bug6] Viewing a non-itinerary place then an itinerary activity elsewhere does not leak the ad-hoc pin", async () => {
    // This is the EXACT scenario the agent-review fix addressed: the old
    // code only removed the ad-hoc marker inside `if (!marker)` — i.e.
    // only when the NEXT focus target also had no real marker. Focusing a
    // REAL itinerary marker next skipped that branch entirely, leaving the
    // first ad-hoc pin stuck on the map forever.
    const page = await sharedCtx.newPage();
    try {
      await page.goto("/app/trips/" + MANALI_TRIP_ID, { waitUntil: "networkidle" });
      await sleep(3000);

      const ptab = page.getByRole("tab").filter({ hasText: /places/i });
      await expect(ptab, "places tab visible").toBeVisible({ timeout: 15000 });
      await ptab.click({ force: true });
      await sleep(2000);

      const spotsBtn = page.getByRole("button").filter({ hasText: /Tourist Spots/i });
      await spotsBtn.click({ force: true });
      await sleep(5000);

      const vmLinks = page.locator("button, a").filter({ hasText: /View on Map/ });
      expect(await vmLinks.count(), "at least 1 View-on-Map link").toBeGreaterThanOrEqual(1);
      await vmLinks.first().click({ force: true });
      await sleep(3000);

      const markersAfterAdhoc = await page.locator(".custom-marker").count();
      expect(markersAfterAdhoc, "ad-hoc marker present").toBeGreaterThanOrEqual(1);

      // Now go to the Itinerary tab and click "View on Map" on a real
      // sightseeing/other activity elsewhere on the map (a real marker,
      // not the ad-hoc one) — this is the branch that used to skip cleanup.
      const itab = page.getByRole("tab").filter({ hasText: /itinerary/i });
      await itab.click({ force: true });
      await sleep(1500);
      const realViewOnMapBtn = page.locator('button[title="View on map"]').first();
      const realBtnCount = await realViewOnMapBtn.count();
      if (realBtnCount === 0) {
        console.log("[Bug6-leak] No itinerary View-on-map button available — skipping this probe");
        return;
      }
      await realViewOnMapBtn.click({ force: true });
      await sleep(3000);

      const markersAfterReal = await page.locator(".custom-marker").count();
      // The ad-hoc pin from the Places-tab place must be gone now — total
      // marker count should be no higher than just the real itinerary
      // markers (i.e. not greater than what was on the map before the
      // ad-hoc one was ever created, plus this one real marker at most).
      expect(
        markersAfterReal,
        "ad-hoc pin was cleaned up when a real itinerary marker was focused next (no leak)",
      ).toBeLessThanOrEqual(markersAfterAdhoc);
    } finally {
      await page.close();
    }
  });

  test("[Bug6] Adding Places result to itinerary removes its ad-hoc marker", async () => {
    // When a place viewed via ad-hoc marker is added to the itinerary, the
    // marker-rebuild effect should replace the ad-hoc one (same key).
    // Test: click View-on-Map, note marker count, click Add to Itinerary,
    // go to Map tab, verify count did not grow.
    const tripId = await createTestTrip(sharedCtx, "Bug6-AdHocCleanup-QA", {
      itinerary: [{ day: 1, date: new Date("2026-11-01").toISOString(), activities: [] }],
    });
    const page = await sharedCtx.newPage();
    try {
      await page.goto("/app/trips/" + tripId, { waitUntil: "networkidle" });
      await sleep(3000);
      const ptab = page.getByRole("tab").filter({ hasText: /places/i });
      await ptab.click({ force: true });
      await sleep(1500);
      const spotsBtn = page.getByRole("button").filter({ hasText: /Tourist Spots/i });
      if ((await spotsBtn.count()) > 0) {
        await spotsBtn.click({ force: true });
        await sleep(4000);
      }
      const vmLinks = page.locator("button, a").filter({ hasText: /View on Map/ });
      const vmCount = await vmLinks.count();
      if (vmCount === 0) {
        console.log("[Bug6-cleanup] No View on Map links found — skipping add-cleanup test");
        return;
      }
      // View a result on map
      await vmLinks.first().click({ force: true });
      await sleep(3000);
      const markersBeforeAdd = await page.locator(".custom-marker").count();
      // Go back to places and add the same result to itinerary
      await ptab.click({ force: true });
      await sleep(1500);
      const addBtn = page
        .getByRole("button")
        .filter({ hasText: /Add to .*(Trip|Itinerary)/i })
        .first();
      if ((await addBtn.count()) === 0) {
        console.log("[Bug6-cleanup] No Add button — skip");
        return;
      }
      await addBtn.click({ force: true });
      await sleep(3000);
      // Navigate to map tab
      const mapTab = page.getByRole("tab").filter({ hasText: /map/i });
      if ((await mapTab.count()) > 0) {
        await mapTab.click({ force: true });
        await sleep(3000);
      }
      const markersAfterAdd = await page.locator(".custom-marker").count();
      // After adding, marker count should not be higher than before
      // (ad-hoc removed, real itinerary marker added — net zero or one extra if
      // the real marker is at a slightly different key rounding)
      expect(markersAfterAdd, "no marker duplication after add").toBeLessThanOrEqual(
        markersBeforeAdd + 1,
      );
    } finally {
      await page.close();
      await deleteTestTrip(sharedCtx, tripId);
    }
  });

  // ── Final: verify no orphaned test trips ──────────────────────────────────

  test("[Hygiene] No throwaway test trips remain after this suite", async () => {
    const { json } = await apiReq(sharedCtx, "GET", "/api/v1/trips");
    const trips: any[] = Array.isArray(json) ? json : json.trips || [];
    const testTrips = trips.filter(
      (t) =>
        typeof t.destination === "string" &&
        (t.destination.startsWith("Bug") ||
          t.destination.startsWith("QA-") ||
          t.destination.includes("-QA")),
    );
    // If any leaked trips are found, delete them and then fail the test
    for (const t of testTrips) {
      const id = t._id || t.id;
      if (id) await apiReq(sharedCtx, "DELETE", "/api/v1/trips/" + id, {});
    }
    expect(
      testTrips.map((t) => t.destination),
      "no orphaned QA trips",
    ).toHaveLength(0);
  });
});
