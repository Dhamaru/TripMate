import { z } from "zod";
import { withRetries } from "./utils";

export class DraftingAgent {
    private openai: any;
    private geminiHelper: any;

    constructor(services: { openai: any, geminiHelper: any }) {
        this.openai = services.openai;
        this.geminiHelper = services.geminiHelper;
    }

    /**
     * Generates a primary draft itinerary that serves as the baseline for the CriticAgent.
     */
    async generateDraft(goalText: string, context: Record<string, any>, constraints: Record<string, any>): Promise<any> {
        const startTime = Date.now();
        console.log(`[DraftingAgent] Formulating draft baseline...`);

        const prompt = `
      You are an expert, meticulous travel planner.
      Your task is to draft a feasible itinerary baseline for the following goal:
      ${goalText}

      CRITICAL CONSTRAINTS - MATHEMATICAL BOUNDS:
      1. BUDGET: ${constraints.budget} ${constraints.currency} is a STRICT, HARD limit for the ENTIRE TRIP.
      2. If the user's travel style (e.g., "Luxury") conflicts with the strict numeric budget (e.g., "$50"), YOU MUST PRIORITIZE THE NUMERIC BUDGET. Do not suggest $500 luxury hotels if the budget is $50. Scale back the experience to fit the math.
      3. Pace: ${constraints.travelStyle}
      4. Group Size: ${constraints.persons} (Total budget must cover everyone)

      GROUNDING CONTEXT (Provided by Research Phase):
      ${JSON.stringify(context.geo)}
      High-Priority Anchors MUST be included: ${JSON.stringify(context.anchors)}

      Emit a JSON structure matching the full trip requirements. DO NOT provide markdown, ONLY the JSON.
      Format: {
        "costBreakdown": { "accommodation": 0, "food": 0, "transport": 0, "activities": 0, "misc": 0, "total": 0 },
        "itinerary": [{ "day": 1, "theme": "...", "activities": [ { "name": "...", "type": "...", "cost": 0, "time": "09:00 AM", "duration_minutes": 60 } ] }]
      }
      The "costBreakdown.total" MUST be less than or equal to ${constraints.budget}.
    `;

        try {
            // Primary Route: Gemini for rich context Drafting
            console.log(`[DraftingAgent] Engaging Gemini (Primary Drafter)`);
            const draftText: any = await withRetries(() => this.geminiHelper(prompt, "application/json"), 3, 2000);

            const latency = Date.now() - startTime;
            console.log(`[DraftingAgent] Initial draft generated in ${latency}ms`);

            return {
                success: true,
                source: 'gemini',
                rawDraft: typeof draftText === 'string' ? JSON.parse(draftText) : draftText,
                telemetry: { drafterLatencyMs: latency }
            };

        } catch (geminiError) {
            console.warn(`[DraftingAgent] Gemini failed. Falling back to OpenAI...`, geminiError);

            try {
                const openaiStart = Date.now();
                const fallbackRes: any = await withRetries(() => this.openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    response_format: { type: "json_object" },
                    messages: [{ role: "system", content: prompt }]
                }), 2, 3000);

                const latency = Date.now() - openaiStart;
                return {
                    success: true,
                    source: 'openai_fallback',
                    rawDraft: JSON.parse(fallbackRes.choices[0].message.content || '[]'),
                    telemetry: { drafterLatencyMs: latency, degraded: true }
                };
            } catch (openaiError) {
                console.error(`[DraftingAgent] FATAL Drafting Error: Both primary and fallback LLMs failed.`);
                throw new Error("Drafting phase completely failed.");
            }
        }
    }
}
