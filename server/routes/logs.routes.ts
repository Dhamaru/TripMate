import { Router } from "express";
import rateLimit from "express-rate-limit";
import logger from "../logger";
import { config } from "../config";

const router = Router();

// Unauthenticated by design — these exist to capture pre-auth client
// errors (a failed signup call, a landing-page crash) where no session
// exists yet to gate behind requireAuth. That does mean anyone can write
// to server logs; sanitizePayload below bounds the injection/size risk,
// and this cap (down from 20/min) bounds the flood-storage risk further.
// Relaxed in test env — express-rate-limit's in-memory store is a
// per-process singleton shared across every test file in one vitest
// worker (Node module caching), so a low ceiling here could trip on
// unrelated test suite volume, same class of issue already fixed in
// rateLimit.middleware.ts.
const logsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.NODE_ENV === "test" ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
});
// Was router.use(logsLimiter) — that applies to EVERY request that enters
// this router, not just ones that match one of its two routes. Because
// this router is mounted at the shared "/api/v1" prefix (server/index.ts)
// alongside every other v1 router, any request that doesn't match
// /logs/info or /logs/error still passes through this limiter first
// before falling through to whatever actually handles it further down
// the chain — live-reproduced: ordinary navigation (Home -> Trips ->
// Journal) tripped this 10-req/60s ceiling and GET /api/v1/trips started
// 429ing, rendering as "No trips yet" for an account that has real trips.
// Attaching the limiter to each route directly instead of router-wide
// scopes it to only the requests it was actually meant to bound.

function sanitizeString(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .slice(0, 200);
}

function sanitizePayload(payload: unknown, depth = 0): unknown {
  if (depth > 3) return undefined;
  if (typeof payload === "string") return sanitizeString(payload);
  if (Array.isArray(payload)) return payload.slice(0, 20).map((v) => sanitizePayload(v, depth + 1));
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(payload as object).slice(0, 20)) {
      out[sanitizeString(key)] = sanitizePayload(
        (payload as Record<string, unknown>)[key],
        depth + 1,
      );
    }
    return out;
  }
  return payload;
}

router.post("/logs/info", logsLimiter, (req, res) => {
  logger.info(`[client] ${sanitizeString(req.body?.event)}`, sanitizePayload(req.body?.payload));
  res.status(204).send();
});

router.post("/logs/error", logsLimiter, (req, res) => {
  logger.error(`[client] ${sanitizeString(req.body?.event)}`, sanitizePayload(req.body?.payload));
  res.status(204).send();
});

export default router;
