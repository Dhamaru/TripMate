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
      Your task is to draft a feasible itinerary baseline for the following goal:
      ${goalText}

      CRITICAL CONSTRAINTS - MATHEMATICAL BOUNDS:
      1. BUDGET: ${constraints.budget} ${constraints.currency} is a STRICT, HARD limit for the ENTIRE TRIP.
      2. If the user's travel style (e.g., "Luxury") conflicts with the strict numeric budget (e.g., "$50"), YOU MUST PRIORITIZE THE NUMERIC BUDGET. Do not suggest $500 luxury hotels if the budget is $50. Scale back the experience to fit the math.
      3. Pace: ${constraints.travelStyle}
      4. UNIQUENESS: Every single activity must be UNIQUE. DO NOT repeat the same park, museum, or landmark on different days unless it's a massive site requiring multiple days. DO NOT repeat restaurant names - travelers want variety!
      5. LOCALITY: All places MUST be real venues in ${constraints.destination}. No generic placeholders.

      GROUNDING CONTEXT (Provided by Research Phase):
      ${JSON.stringify(context.geo)}
      High-Priority Anchors MUST be included: ${JSON.stringify(context.anchors)}

      Constraints:
      - Destination: ${constraints.destination}
      - Duration: EXACTLY ${constraints.days} days
      - Persons: ${constraints.persons}
      - Style: ${constraints.travelStyle}
      - Budget: ${constraints.budget || 'Calculated'} ${constraints.currency || 'INR'}

      You MUST generate EXACTLY ${constraints.days} unique days of activities. Each day must have at least 3-4 activities (Breakfast, Activity 1, Lunch, Activity 2, Dinner/Evening).
      Failure to provide unique activities for ALL ${constraints.days} days will result in a plan rejection.

      For every activity, you MUST provide:
      1. Exact real-world "placeName" and "address".
      2. Geographic coordinates ("lat" and "lon") as NUMERICAL FLOATS.
      3. Realistic "cost" and "duration_minutes".

      JSON OUTPUT STRUCTURE:
      {
        "itinerary": [
          {
            "day": 1,
            "theme": "...",
            "activities": [
              {
                "time": "09:00 AM",
                "title": "...",
                "placeName": "...",
                "address": "...",
                "lat": 0.0,
                "lon": 0.0,
                "type": "sightseeing",
                "entryFee": 0,
                "cost": 0,
                "duration_minutes": 60
              }
            ]
          }
        ],
        "costBreakdown": { "accommodation": 0, "food": 0, "transport": 0, "activities": 0, "misc": 0, "total": 0 }
      }
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
