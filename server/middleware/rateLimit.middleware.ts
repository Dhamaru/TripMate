import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { config } from "../config";

const rateLimitResponse = (retryAfter: number) => ({
  success: false,
  code: "RATE_LIMITED",
  error: "Too many requests",
  retryAfter,
});

// express-rate-limit's in-memory store is a per-process singleton, scoped
// to wherever the limiter object itself was created — but vitest runs many
// test files inside a shared worker process, and each file's `import {app}
// from '../../server/index'` resolves to the SAME cached module instance
// (Node dedupes imports by resolved path within one process). That means
// every limiter below was accumulating hits across the WHOLE test suite,
// not per file, and whichever request happened to land on the Nth hit of
// its window tripped a 429 — a different, seemingly-unrelated test failing
// almost at random depending on file/test execution order (confirmed live:
// the same "should delete a trip" request got a 429 with an empty body on
// a fresh CI run and on repeated local reruns, while the actual route
// logic was untouched and correct). Multiplying every ceiling way up in
// test env keeps the header/shape/wiring of each limiter genuinely
// exercised, without a large shared test suite ever realistically hitting
// the relaxed ceiling — matching the precedent authLimiter already set.
const testMultiplier = (max: number) => (config.NODE_ENV === "test" ? max * 100 : max);

export const generalLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000,
  max: testMultiplier(config.RATE_LIMIT_MAX ?? 100),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json(rateLimitResponse(15 * 60)),
  // This limiter is mounted as app.use("/api", generalLimiter)
  // (server/index.ts) — Express strips exactly the matched mount path
  // from req.path before calling any middleware mounted with a path,
  // plain function or Router alike (confirmed empirically, not assumed:
  // a request to /api/v1/health arrives here with req.path === "/v1/
  // health", not the full path and not further stripped to "/health").
  // So the health-check segment always has exactly one of these prefixes
  // still on it, depending on which mount (/api/v1 or the /api/tools
  // back-compat alias) a healthcheck route is reached through — strip
  // that one prefix before matching the bare segment.
  skip: (req) => {
    const path = (req.path ?? "").replace(/^\/(?:v1|tools)/, "");
    return (
      path.startsWith("/health") ||
      path.startsWith("/liveness") ||
      path.startsWith("/readiness") ||
      path.startsWith("/version")
    );
  },
});

// Proxy limiter for external API pass-through routes (weather, places)
export const apiProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: testMultiplier(60),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json(rateLimitResponse(60)),
});

// Strict limiter for auth endpoints — prevents brute-force and credential stuffing
// (test env gets a much higher ceiling so a single test file's sequential
// signup/signin calls don't trip the same brute-force guard real users hit —
// the header/shape behavior itself is still exercised, just not the low cap)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === "test" ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json(rateLimitResponse(15 * 60)),
});

export const aiLimiter = rateLimit({
  windowMs: config.AI_RATE_LIMIT_WINDOW_MS ?? 60 * 1000,
  max: testMultiplier(config.AI_RATE_LIMIT_MAX ?? 20),
  handler: (req, res) => res.status(429).json(rateLimitResponse(60)),
});

export const generationLimiter = rateLimit({
  windowMs: config.GENERATION_RATE_LIMIT_WINDOW_MS ?? 60 * 60 * 1000,
  max: testMultiplier(config.GENERATION_RATE_LIMIT_MAX ?? 5),
  handler: (req, res) => res.status(429).json(rateLimitResponse(60 * 60)),
});

// /places/photo makes one billed Google Places Photo call per request, on
// an unauthenticated route — sharing the 60/min apiProxyLimiter with plain
// search meant an attacker with N source IPs could rack up 60N billed
// upstream calls a minute against TripMate's Google billing account with no
// account required. Tighter, dedicated ceiling since this specific route is
// the actually-expensive one, not the search/text-only routes it shares a
// mount with.
export const placesPhotoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: testMultiplier(20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json(rateLimitResponse(60)),
});

// "Import My Plan" (parse-schedule) — express-rate-limit's default
// keyGenerator is per-IP, which every other limiter in this file also
// uses; fine for anonymous/proxy-abuse protection, but this route sits
// behind requireAuth specifically to bound cost per SIGNED-IN user, not
// per network address (two users behind one office/campus NAT would
// otherwise share one 3-request budget; one user across two devices
// would get two). Keyed on the authenticated user id instead.
export const importPlanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: testMultiplier(3),
  standardHeaders: true,
  legacyHeaders: false,
  // ipKeyGenerator normalizes an IPv6 address before it's used as a key —
  // a raw one otherwise fails express-rate-limit's own validation
  // (ERR_ERL_KEY_GEN_IPV6), since different IPv6 representations of the
  // same address would silently bypass the limit. This route sits
  // behind requireAuth, so req.user is normally present; the IP fallback
  // only matters if that ever isn't true.
  keyGenerator: (req) => req.user?._id || ipKeyGenerator(req.ip || "unknown"),
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      code: "RATE_LIMITED",
      error: "Please wait before generating another plan.",
      retryAfter: 60,
    }),
});
