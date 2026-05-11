import { Request, Response, NextFunction } from 'express';
import { MasterOrchestrator } from '../agent/multiAgent/MasterOrchestrator';
import { OrchestratorInput, OrchestratorTrigger } from '../agent/multiAgent/types';
import logger from '../logger';
import { AgentJob } from '../models/AgentJob';

const orchestrator = new MasterOrchestrator();

/**
 * Starts a new multi-agent pipeline and immediately returns a jobId
 */
export const runPipeline = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { trigger, context, tripId, message } = req.body;
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        if (!trigger) {
            return res.status(400).json({ success: false, error: 'Trigger is required' });
        }

        const input: OrchestratorInput = {
            userId,
            trigger: trigger as OrchestratorTrigger,
            context: context || {},
            tripId,
            message
        };

        // We run the pipeline synchronously for now to return the final result.
        // The PRD mentions SSE streaming, which we implement in streamResults below.
        // If the client calls `/run` without streaming, they get the full response.
        const result = await orchestrator.run(input);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Establishes an SSE connection to stream agent results as they finish 
 * for a specific user action trigger.
 */
export const streamResults = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { trigger, context, tripId, message } = req.body; // In SSE, this is often a GET with query params, but PRD implies we trigger and stream. We'll use a POST for the trigger that returns an SSE stream.
        const userId = req.user?._id || req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send initial connection successful ping
        res.write('event: connected\ndata: {"status": "streaming ready"}\n\n');

        const input: OrchestratorInput = {
            userId,
            trigger: trigger as OrchestratorTrigger,
            context: context || {},
            tripId,
            message
        };

        // Pass the response object so the orchestrator can write chunks to it
        await orchestrator.run(input, res);
        
        // Response is ended by MasterOrchestrator
    } catch (error) {
        logger.error('[OrchestratorController] Stream failed:', error);
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
        res.end();
    }
};

/**
 * Gets the status of a previously run background job
 */
export const getJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { jobId } = req.params;
        const userId = req.user?._id || req.user?.id;

        const job = await AgentJob.findOne({ jobId, userId });
        
        if (!job) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }
        
        res.status(200).json({
            success: true,
            data: job
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Lists historical jobs for the user, optionally filtered by tripId
 */
export const getJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const { tripId } = req.query;

        const query: any = { userId };
        if (tripId) query.tripId = tripId;

        const jobs = await AgentJob.find(query)
            .sort({ createdAt: -1 })
            .limit(20);

        res.status(200).json({
            success: true,
            data: jobs
        });
    } catch (error) {
        next(error);
    }
};
