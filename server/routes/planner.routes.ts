// Task 3 — Planner routes: trip generation + status polling

import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { generateTripSchema } from '../schemas/trip.schemas'
import { generationLimiter } from "../middleware/rateLimit.middleware";
import { generateTrip, getGenerationStatus } from '../controllers/planner.controller'

const router = Router()

// POST /api/v1/trips/generate — kick off async generation, returns jobId
router.post('/trips/generate', requireAuth, generationLimiter, validate(generateTripSchema), generateTrip)

// GET /api/v1/trips/generate/status/:jobId — poll job status
router.get('/trips/generate/status/:jobId', requireAuth, getGenerationStatus)

export default router
