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
router.use(logsLimiter);

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

router.post("/logs/info", (req, res) => {
  logger.info(`[client] ${sanitizeString(req.body?.event)}`, sanitizePayload(req.body?.payload));
  res.status(204).send();
});

router.post("/logs/error", (req, res) => {
  logger.error(`[client] ${sanitizeString(req.body?.event)}`, sanitizePayload(req.body?.payload));
  res.status(204).send();
});

export default router;
