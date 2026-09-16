import { Request, Response } from "express";
import { OrchestratorInput, OrchestratorResult, AgentResult, OrchestratorTrigger } from "./types";
import { BaseAgent } from "./BaseAgent";

import { SuggestionAgent } from "./agents/SuggestionAgent";
import { HeroImageAgent } from "./agents/HeroImageAgent";
import { ItineraryAgent } from "./agents/ItineraryAgent";
import { BudgetAgent } from "./agents/BudgetAgent";
import { MapAgent } from "./agents/MapAgent";
import { PackingAgent } from "./agents/PackingAgent";
import { JournalAgent } from "./agents/JournalAgent";

import { AgentJob } from "../../models/AgentJob";
import crypto from "crypto";
import OpenAI from "openai";
import { config } from "../../config";

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
    JournalAgent: new JournalAgent(),
  };
  // Was Groq — removed along with every other non-Google/Gemini LLM
  // provider in this codebase. Same OpenAI-compat-endpoint trick
  // BaseAgent.ts already uses to talk to Gemini.
  private llm: OpenAI | null = null;

  constructor() {
    if (config.GEMINI_API_KEY) {
      this.llm = new OpenAI({
        apiKey: config.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      });
    }
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
              totalDurationMs: result.durationMs, // Approximating per result for running total
            },
          },
        );
      } catch (err) {
        console.error("[MasterOrchestrator] Failed to persist agent result", err);
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
        // User._id is a nanoid String, not a Mongo ObjectId. AgentJob.tripId
        // is String too (matches Trip._id's real hex form as text) — the
        // ObjectId() cast this used to have was redundant at best and, for
        // any caller that ever passes a non-24-hex tripId, throws a
        // CastError swallowed by the catch below, silently dropping the
        // job record entirely.
        userId: input.userId,
        tripId: input.tripId || undefined,
        trigger: input.trigger,
        status: "running",
        results: [],
      });
    } catch (err) {
      console.error("[MasterOrchestrator] Failed to create job record", err);
    }

    try {
      await this.executePipeline(input, streamResult);
    } catch (error) {
      console.error("[MasterOrchestrator] Pipeline failed catastrophically", error);
    }

    const durationMs = Date.now() - startTime;

    const finalResult: OrchestratorResult = {
      jobId,
      trigger: input.trigger,
      results,
      totalTokensUsed: totalTokens,
      totalDurationMs: durationMs,
      successCount,
      failureCount,
    };

    // Finalize Job record
    try {
      await AgentJob.findOneAndUpdate(
        { jobId },
        {
          status: failureCount === 0 ? "completed" : successCount > 0 ? "completed" : "failed",
          totalTokensUsed: totalTokens,
          totalDurationMs: durationMs,
        },
      );
    } catch (err) {
      console.error("[MasterOrchestrator] Failed to finalize job record", err);
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
    streamResult: (res: AgentResult) => void,
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
      case "dashboard_load":
      case "preferences_change":
        await Promise.allSettled([
          runAgentByName("SuggestionAgent"),
          runAgentByName("HeroImageAgent"),
        ]);
        break;

      case "trip_create": {
        const itineraryResult = await runAgentByName("ItineraryAgent");
        const priorDeps = { itinerary: itineraryResult.data };

        await Promise.allSettled([
          runAgentByName("BudgetAgent", priorDeps),
          runAgentByName("PackingAgent", priorDeps),
          runAgentByName("MapAgent", priorDeps),
        ]);
        break;
      }

      case "trip_view":
        await runAgentByName("MapAgent");
        break;

      case "journal_entry":
        await runAgentByName("JournalAgent");
        break;

      case "packing_request":
        await runAgentByName("PackingAgent");
        break;

      case "expense_audit":
        await runAgentByName("BudgetAgent");
        break;

      case "chat_message": {
        const intent = await this.classifyIntent(input.message || "");
        console.log(`[MasterOrchestrator] Chat intent classified: ${intent.join(", ")}`);

        if (intent.length > 0) {
          await Promise.allSettled(intent.map((agentName) => runAgentByName(agentName)));
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
    if (!this.llm) return [];

    try {
      const response = await this.llm.chat.completions.create({
        model: "gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content: `You are a triage agent for a travel system.
                        Given a user message, return the agent names that should be invoked.
                        Available Agents: SuggestionAgent, ItineraryAgent, BudgetAgent, MapAgent, PackingAgent, JournalAgent.
                        Examples:
                        - "How much did I spend?" -> {"agents": ["BudgetAgent"]}
                        - "Update my itinerary and check the weather" -> {"agents": ["ItineraryAgent", "MapAgent"]}
                        - "What should I pack for Paris?" -> {"agents": ["PackingAgent"]}
                        - "Where can I go next?" -> {"agents": ["SuggestionAgent"]}
                        Return ONLY a JSON object with a single "agents" key containing the array. response_format requires a JSON object root, not a bare array.`,
          },
          { role: "user", content: message },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content || "[]";
      const parsed = JSON.parse(content);
      const agents = Array.isArray(parsed) ? parsed : parsed.agents || [];

      // Validate agent names
      return agents.filter((name: string) => this.agents[name]);
    } catch (err) {
      console.error("[MasterOrchestrator] Intent classification failed", err);
      return [];
    }
  }
}

// Lazy, not `export const masterOrchestrator = new MasterOrchestrator()` --
// this file sits in a real import cycle (BaseAgent -> tools/executor ->
// MasterOrchestrator -> BaseAgent/agents/*, all of which extend BaseAgent).
// Eagerly constructing here means the `agents` field's `new SuggestionAgent()`
// etc. (MasterOrchestrator.ts:22-30) would run during MODULE EVALUATION, at
// whatever point this file happens to be reached in the cycle -- which can be
// before BaseAgent.ts has finished defining the `BaseAgent` class it exports,
// depending purely on which file the app happens to import first. Deferring
// construction to first actual use (inside executor.ts's function body, long
// after every module has finished loading) removes that ordering hazard
// without needing to restructure the cycle itself.
let _masterOrchestrator: MasterOrchestrator | null = null;
export function getMasterOrchestrator(): MasterOrchestrator {
  if (!_masterOrchestrator) _masterOrchestrator = new MasterOrchestrator();
  return _masterOrchestrator;
}
