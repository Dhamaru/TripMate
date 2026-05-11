import { Request, Response } from 'express';
import { OrchestratorInput, OrchestratorResult, AgentResult, OrchestratorTrigger } from './types';
import { BaseAgent } from './BaseAgent';

import { SuggestionAgent } from './agents/SuggestionAgent';
import { HeroImageAgent } from './agents/HeroImageAgent';
import { ItineraryAgent } from './agents/ItineraryAgent';
import { BudgetAgent } from './agents/BudgetAgent';
import { MapAgent } from './agents/MapAgent';
import { PackingAgent } from './agents/PackingAgent';
import { JournalAgent } from './agents/JournalAgent';

import { AgentJob } from '../../models/AgentJob';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Groq from 'groq-sdk';
import { config } from '../../config';

export class MasterOrchestrator {
    // Hardcoded daily limits for now based on PRD
    private static readonly MAX_TOKENS_PER_DAY = 50000; 

    private agents: Record<string, BaseAgent<any>> = {
        SuggestionAgent: new SuggestionAgent(),
        HeroImageAgent: new HeroImageAgent(),
        ItineraryAgent: new ItineraryAgent(),
        BudgetAgent: new BudgetAgent(),
        MapAgent: new MapAgent(),
        PackingAgent: new PackingAgent(),
        JournalAgent: new JournalAgent()
    };
    private groq: Groq;

    constructor() {
        this.groq = new Groq({ apiKey: config.GROQ_API_KEY });
    }

    /**
     * The main entry point for starting an agent pipeline.
     */
    async run(input: OrchestratorInput, sseResponse?: Response): Promise<OrchestratorResult> {
        const jobId = crypto.randomUUID();
        const startTime = Date.now();
        const results: AgentResult[] = [];
        
        let totalTokens = 0;
        let successCount = 0;
        let failureCount = 0;

        const streamResult = async (result: AgentResult) => {
            results.push(result);
            totalTokens += result.tokensUsed;
            if (result.success) successCount++;
            else failureCount++;

            // Persist result to DB
            try {
                await AgentJob.findOneAndUpdate(
                    { jobId },
                    { 
                        $push: { results: result },
                        $inc: { 
                            totalTokensUsed: result.tokensUsed,
                            totalDurationMs: result.durationMs // Approximating per result for running total
                        }
                    }
                );
            } catch (err) {
                console.error('[MasterOrchestrator] Failed to persist agent result', err);
            }

            // Stream to frontend if SSE is connected
            if (sseResponse) {
                sseResponse.write(`data: ${JSON.stringify(result)}\n\n`);
                if ((sseResponse as any).flush) {
                    (sseResponse as any).flush();
                }
            }
        };

        // Create initial Job record
        try {
            await AgentJob.create({
                jobId,
                userId: new mongoose.Types.ObjectId(input.userId),
                tripId: input.tripId ? new mongoose.Types.ObjectId(input.tripId) : undefined,
                trigger: input.trigger,
                status: 'running',
                results: []
            });
        } catch (err) {
            console.error('[MasterOrchestrator] Failed to create job record', err);
        }

        try {
            await this.executePipeline(input, streamResult);
        } catch (error) {
            console.error('[MasterOrchestrator] Pipeline failed catastrophically', error);
        }

        const durationMs = Date.now() - startTime;

        const finalResult: OrchestratorResult = {
            jobId,
            trigger: input.trigger,
            results,
            totalTokensUsed: totalTokens,
            totalDurationMs: durationMs,
            successCount,
            failureCount
        };

        // Finalize Job record
        try {
            await AgentJob.findOneAndUpdate(
                { jobId },
                { 
                    status: failureCount === 0 ? 'completed' : (successCount > 0 ? 'completed' : 'failed'),
                    totalTokensUsed: totalTokens,
                    totalDurationMs: durationMs
                }
            );
        } catch (err) {
            console.error('[MasterOrchestrator] Failed to finalize job record', err);
        }

        if (sseResponse) {
            sseResponse.write(`event: complete\ndata: ${JSON.stringify({ jobId })}\n\n`);
            sseResponse.end();
        }

        return finalResult;
    }

    /**
     * Decides pipeline topology based on the trigger.
     */
    private async executePipeline(
        input: OrchestratorInput, 
        streamResult: (res: AgentResult) => void
    ) {
        const runAgentByName = async (agentName: string, priorResults?: Record<string, any>) => {
            const agent = this.agents[agentName];
            if (!agent) {
                console.error(`Agent ${agentName} not found`);
                return { success: false, data: null };
            }
            const res = await agent.run(input, priorResults);
            streamResult(res);
            return res;
        };

        switch (input.trigger) {
            case 'dashboard_load':
            case 'preferences_change':
                await Promise.allSettled([
                    runAgentByName('SuggestionAgent'),
                    runAgentByName('HeroImageAgent')
                ]);
                break;

            case 'trip_create': {
                const itineraryResult = await runAgentByName('ItineraryAgent');
                const priorDeps = { itinerary: itineraryResult.data };
                
                await Promise.allSettled([
                    runAgentByName('BudgetAgent', priorDeps),
                    runAgentByName('PackingAgent', priorDeps),
                    runAgentByName('MapAgent', priorDeps)
                ]);
                break;
            }

            case 'trip_view':
                await runAgentByName('MapAgent');
                break;

            case 'journal_entry':
                await runAgentByName('JournalAgent');
                break;

            case 'packing_request':
                await runAgentByName('PackingAgent');
                break;

            case 'expense_audit':
                await runAgentByName('BudgetAgent');
                break;

            case 'chat_message': {
                const intent = await this.classifyIntent(input.message || '');
                console.log(`[MasterOrchestrator] Chat intent classified: ${intent.join(', ')}`);
                
                if (intent.length > 0) {
                    await Promise.allSettled(
                        intent.map(agentName => runAgentByName(agentName))
                    );
                }
                break;
            }

            default:
                console.warn(`[MasterOrchestrator] Unknown trigger: ${input.trigger}`);
        }
    }

    /**
     * Uses LLM to determine which agents should be involved in a chat request.
     */
    private async classifyIntent(message: string): Promise<string[]> {
        if (!message) return [];

        try {
            const response = await this.groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { 
                        role: 'system', 
                        content: `You are a triage agent for a travel system. 
                        Given a user message, return a JSON array of agent names that should be invoked.
                        Available Agents: SuggestionAgent, ItineraryAgent, BudgetAgent, MapAgent, PackingAgent, JournalAgent.
                        Examples:
                        - "How much did I spend?" -> ["BudgetAgent"]
                        - "Update my itinerary and check the weather" -> ["ItineraryAgent", "MapAgent"]
                        - "What should I pack for Paris?" -> ["PackingAgent"]
                        - "Where can I go next?" -> ["SuggestionAgent"]
                        Return ONLY a JSON array.`
                    },
                    { role: 'user', content: message }
                ],
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0].message.content || '[]';
            const parsed = JSON.parse(content);
            const agents = Array.isArray(parsed) ? parsed : (parsed.agents || []);
            
            // Validate agent names
            return agents.filter((name: string) => this.agents[name]);
        } catch (err) {
            console.error('[MasterOrchestrator] Intent classification failed', err);
            return [];
        }
    }
}

export const masterOrchestrator = new MasterOrchestrator();
