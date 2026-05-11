import { z } from "zod";
import { withRetries } from "./utils";

// The strict schema enforced by the TripMate frontend UI
export const zTripPlan = z.object({
    destination: z.string(),
    days: z.number(),
    persons: z.number(),
    totalEstimatedCost: z.number().optional(),
    currency: z.string().optional(),
    costBreakdown: z.object({
        accommodation: z.number().int().optional().or(z.number()),
        food: z.number().int().optional().or(z.number()),
        transport: z.number().int().optional().or(z.number()),
        activities: z.number().int().optional().or(z.number()),
        misc: z.number().int().optional().or(z.number()),
        total: z.number().int().optional().or(z.number()),
    }).optional(),
    itinerary: z.array(z.object({
        day: z.number(),
        activities: z.array(z.object({
            time: z.string(),
            title: z.string(),
            placeName: z.string().optional(),
            address: z.string(),
            type: z.enum(["sightseeing", "restaurant", "cafe", "market", "museum", "temple", "park"]),
            entryFee: z.number(),
            cost: z.number().optional(),
            duration_minutes: z.number(),
            localFoodRecommendations: z.array(z.string()).default([]),
            lat: z.number().optional(),
            lon: z.number().optional(),
            routeFromPrevious: z.object({ mode: z.string(), distance_km: z.number(), travel_time_minutes: z.number(), from: z.string(), to: z.string() }).optional()
        })).min(1),
        reasoning: z.string().optional(),
        confidenceScore: z.enum(['high', 'medium', 'low']).optional()
    })),
    packingList: z.array(z.string()).optional(),
    safetyTips: z.array(z.string()).optional(),
    notes: z.string().optional(),
    explainability: z.object({
        reasoning: z.string().optional(),
        confidenceScore: z.number().optional(),
        degradedConstraints: z.array(z.string()).optional(),
        telemetry: z.object({
            latencySeconds: z.number(),
            iterations: z.number(),
            models: z.array(z.string())
        }).optional()
    }).optional()
});

export class FormattingAgent {
    private openai: any;
    private geminiHelper: any;

    constructor(services: { openai: any, geminiHelper: any }) {
        this.openai = services.openai;
        this.geminiHelper = services.geminiHelper;
    }

    /**
     * Final firewall: Enforces strict adherence to the frontend zTripPlan schema.
     * If parsing fails, it autonomously attempts to self-correct the JSON instead of 500-erroring the API.
     */
    async formatFinalPayload(rawDraft: any, constraints: Record<string, any>, reasoningParams: Record<string, any>): Promise<any> {
        console.log(`[FormattingAgent] Structural validation initiated.`);

        // First attempt: Structural coercion
        let candidatePayload = {
            destination: constraints.destination || "Unknown",
            totalDays: constraints.days,
            travelStyle: constraints.travelStyle,
            budgetCategory: "calculated",
            weatherContext: {},
            safetyTips: ["Stay hydrated.", "Keep emergency numbers handy."],
            costBreakdown: rawDraft.costBreakdown || {
                accommodation: 0,
                food: 0,
                transport: 0,
                activities: 0,
                misc: 0,
                total: 0
            },
            itinerary: (Array.isArray(rawDraft.itinerary) ? rawDraft.itinerary : []).map((dayPlan: any, i: number) => ({
                day: dayPlan.day || i + 1,
                reasoning: dayPlan.theme || dayPlan.reasoning || `Exploring Day ${i + 1}`,
                confidenceScore: "high",
                activities: Array.isArray(dayPlan.activities) ? dayPlan.activities.map((act: any) => {
                    const mappedType = (act.type || "sightseeing").toLowerCase();
                    const validTypes = ["sightseeing", "restaurant", "cafe", "market", "museum", "temple", "park"];

                    return {
                        title: act.name || act.title || "Local Spot",
                        placeName: act.name || act.placeName || "Local Spot",
                        address: act.address || act.location || "Central, TBD",
                        type: validTypes.includes(mappedType) ? mappedType : "sightseeing",
                        entryFee: act.entryFee || 0,
                        cost: Number(act.cost) || Number(act.estimatedCost) || 0,
                        duration_minutes: Number(act.duration_minutes) || Number(act.duration) || 60,
                        time: act.time || act.timeOfDay || "09:00 AM",
                        lat: act.lat || act.latitude || (act.coords && act.coords.lat),
                        lon: act.lon || act.lng || act.longitude || (act.coords && act.coords.lon),
                        localFoodRecommendations: []
                    };
                }) : []
            })),
            localRecommendations: {
                food: [],
                culturalEtiquette: []
            },
            explainability: {
                reasoning: reasoningParams.insight || "Optimized based on standard algorithms.",
                confidenceScore: reasoningParams.confidence || 0.9,
                degradedConstraints: reasoningParams.degraded || []
            },
            ...rawDraft // Fallback spread in case the draft already perfectly matches
        };

        // Attempt native validation
        try {
            zTripPlan.parse(candidatePayload);
            console.log(`[FormattingAgent] Payload rigidly matched Zod Schema.`);
            return candidatePayload;
        } catch (e: any) {
            console.warn(`[FormattingAgent] Zod mismatch detected. Initiating structural self-correction wrap...`);
            // If validation fails, we use GPT-4o-mini strictly as a JSON structural fixer.
            const fixPrompt = `
        You are a JSON schema fixing engineer.
        The following JSON payload failed to parse against a strict Zod schema for a Travel Itinerary.
        
        Failed Payload: 
        ${JSON.stringify(candidatePayload)}
        
        Zod Error:
        ${JSON.stringify(e.errors)}

        Fix the JSON structure to resolve the missing or incorrect types. 
        DO NOT alter the itinerary data, ONLY fix the keys and type shapes. Return ONLY the JSON object.
      `;

            try {
                let fixedPayload: any;
                if (this.openai) {
                    const fixRes: any = await withRetries(() => this.openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        response_format: { type: "json_object" },
                        messages: [{ role: "system", content: fixPrompt }]
                    }), 2, 2000);
                    fixedPayload = JSON.parse(fixRes.choices[0].message.content || '{}');
                } else if (this.geminiHelper) {
                    const fixResText: string = await withRetries(() => this.geminiHelper(fixPrompt, "application/json"), 2, 2000);
                    fixedPayload = JSON.parse(fixResText);
                } else {
                    throw new Error("No LLM available for JSON repair.");
                }

                console.log(`[FormattingAgent] Self-correction completed.`);
                return fixedPayload;
            } catch (fixError) {
                console.error(`[FormattingAgent] FATAL formatting error. The LLM could not parse the required schema. Returning safe fallback payload to preserve UI state.`, fixError);
                // Absolute fallback to prevent App Crash on the Frontend
                return {
                    destination: constraints.destination,
                    days: constraints.days,
                    persons: constraints.persons,
                    currency: constraints.currency || "INR",
                    totalEstimatedCost: 0,
                    itinerary: [],
                    explainability: { reasoning: "Generation succeeded but formatting failed. Please retry." }
                };
            }
        }
    }
}
