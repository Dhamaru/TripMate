// Task 2 — Planner controller: async trip generation with job polling

import crypto from 'crypto'
import NodeCache from 'node-cache'
import OpenAI from 'openai'
import type { Request, Response, NextFunction } from 'express'
import { TripModel } from '@shared/schema'
import { runAgentLoop } from '../agent/agentLoop'
import { buildPlanningPrompt } from '../agent/prompts/planningPrompt'
import { AiUtilitiesService } from '../AiUtilitiesService'
import { config } from '../config'
import logger from '../logger'

const openai = new OpenAI({
    apiKey: config.NVIDIA_API_KEY_2 || config.NVIDIA_API_KEY || '',
    baseURL: 'https://integrate.api.nvidia.com/v1',
})
const aiService = new AiUtilitiesService()

// In-memory job store (TTL = 1 hour)
const jobCache = new NodeCache({ stdTTL: 3600 })

export interface GenerationJob {
    status: 'pending' | 'running' | 'done' | 'failed'
    steps: string[]
    tripId?: string
    error?: string
    userId: string
}

const STEP_MESSAGES: Record<string, string> = {
    get_weather: '🌤 Checking weather...',
    calculate_budget: '💰 Allocating budget...',
    search_places: '📍 Finding places...',
    trip_plan_generator: '✍️ Building your itinerary...',
    finalize_trip_plan: '✈️ Saving your trip...',
}

export const generateTrip = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            origin, destination, startDate, endDate, totalBudget,
            currency = 'INR', travelStyle, travelMedium, companions, interests,
        } = req.body as {
            origin: string
            destination: string
            startDate: string
            endDate: string
            totalBudget: number
            currency?: string
            travelStyle: string
            travelMedium: string
            companions: number
            interests?: string[]
        }

        const userId = String(req.user?._id || req.user?.id)
        const jobId = crypto.randomUUID()

        const job: GenerationJob = { status: 'pending', steps: [], userId }
        jobCache.set(jobId, job)

        // Respond immediately — generation runs in background
        res.status(202).json({ success: true, data: { jobId } })

        const updateJob = (update: Partial<GenerationJob>) => {
            const current = jobCache.get<GenerationJob>(jobId)
            if (current) jobCache.set(jobId, { ...current, ...update })
        }

        updateJob({ status: 'running' })

        const prompt = buildPlanningPrompt({
            origin, destination, startDate, endDate, totalBudget,
            currency, travelStyle, travelMedium, companions, interests,
        })

        void (async () => {
            try {
                const result = await runAgentLoop(
                    {
                        message: prompt,
                        userId,
                        context: { userId, currentPage: 'planner' },
                        onToolCall: (toolName: string) => {
                            const step = STEP_MESSAGES[toolName] ?? `🔧 ${toolName}...`
                            const current = jobCache.get<GenerationJob>(jobId)
                            if (current) {
                                jobCache.set(jobId, { ...current, steps: [...current.steps, step] })
                            }
                        },
                    },
                    { openai, aiService: aiService as any }
                )

                // Parse structured JSON from agent response
                const jsonMatch = result.message.match(/\{[\s\S]*\}/)
                const tripData: Record<string, unknown> | null = jsonMatch
                    ? JSON.parse(jsonMatch[0]) as Record<string, unknown>
                    : null

                if (!tripData) throw new Error('Agent returned no parseable JSON')

                const trip = await TripModel.create({
                    userId,
                    origin,
                    ...tripData,
                    totalBudget,
                    travelStyle,
                    travelMedium,
                    companions,
                })

                const current = jobCache.get<GenerationJob>(jobId)
                updateJob({
                    status: 'done',
                    tripId: String(trip._id),
                    steps: [...(current?.steps ?? []), '✅ Trip ready!'],
                })
                logger.info(`[planner] Trip generation complete for user ${userId}, trip ${trip._id}`)
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Generation failed'
                updateJob({ status: 'failed', error: message })
                logger.error(`[planner] Trip generation failed: ${message}`)
            }
        })()
    } catch (err) {
        next(err)
    }
}

export const getGenerationStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { jobId } = req.params
        const job = jobCache.get<GenerationJob>(jobId)
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' })

        const userId = String(req.user!._id)
        if (job.userId !== userId) {
            return res.status(403).json({ success: false, error: 'Forbidden' })
        }

        return res.json({
            success: true,
            data: {
                status: job.status,
                steps: job.steps,
                tripId: job.tripId,
                error: job.error,
            },
        })
    } catch (err) {
        return next(err)
    }
}
