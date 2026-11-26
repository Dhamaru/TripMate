import { Router } from "express";
import {
  runPipeline,
  streamResults,
  getJob,
  getJobs,
} from "../controllers/orchestrator.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { generationLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

// Base Orchestrator Endpoints
// Start a pipeline synchronously (returns full result when done) — the
// most API-intensive endpoint in the app (sequential multi-agent LLM
// calls per run), previously only under the 100-req/15min generalLimiter.
router.post("/run", requireAuth, generationLimiter, runPipeline);

// Start a pipeline and stream intermediate agent results via SSE
router.post("/stream", requireAuth, generationLimiter, streamResults);

// Get historical job results
router.get("/jobs", requireAuth, getJobs);
router.get("/jobs/:jobId", requireAuth, getJob);

export default router;
