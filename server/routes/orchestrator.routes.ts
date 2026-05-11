import { Router } from 'express';
import { runPipeline, streamResults, getJob, getJobs } from '../controllers/orchestrator.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Base Orchestrator Endpoints
// Start a pipeline synchronously (returns full result when done)
router.post('/run', requireAuth, runPipeline);

// Start a pipeline and stream intermediate agent results via SSE
router.post('/stream', requireAuth, streamResults);

// Get historical job results
router.get('/jobs', requireAuth, getJobs);
router.get('/jobs/:jobId', requireAuth, getJob);

// Future agent-specific explicit execution routes (Task 6 spec)
router.post('/suggestions/refresh', requireAuth, (req, res) => res.json({ success: true, message: 'Not implemented Yet' }));
router.post('/agent/map/cache/:tripId', requireAuth, (req, res) => res.json({ success: true, message: 'Not implemented Yet' }));
router.post('/agent/budget/recalculate/:tripId', requireAuth, (req, res) => res.json({ success: true, message: 'Not implemented Yet' }));
router.post('/agent/packing/regenerate/:tripId', requireAuth, (req, res) => res.json({ success: true, message: 'Not implemented Yet' }));

export default router;
