import { z } from "zod";
import { withRetries } from "./utils";

// The strict schema enforced by the TripMate frontend UI
export const zTripPlan = z.object({
  destination: z.string(),
  days: z.number(),
  persons: z.number(),
  totalEstimatedCost: z.number().optional(),
  currency: z.string().optional(),
  // Was set on candidatePayload below (`travelStyle: constraints.travelStyle`)
  // but never declared here -- harmless while formatFinalPayload returned
  // the raw candidatePayload object (nothing stripped it), but once that
  // was fixed to return the actual `.parse()` result (a real bug: it used
  // to let junk keys from the model ride through unstripped), this
  // legitimate field started getting silently stripped at the exact same
  // point the junk keys now correctly are. Needs to be declared, not just
  // assigned, for a non-strict Zod object to keep it.
  travelStyle: z.string().optional(),
  // Live-reported gaps: no travel/logistics guidance and no accommodation
  // suggestions in a generated plan. Both optional -- zTripPlan has no
  // .strict(), so an unrecognized key from a prompt change gets silently
  // stripped by .safeParse() rather than erroring; these have to be
  // declared here to actually survive into what the client receives.
  travelLogistics: z
    .object({
      toDestination: z.string().optional(),
      gettingAround: z.string().optional(),
    })
    .optional(),
  accommodationSuggestions: z
    .array(
      z.object({
        name: z.string(),
        area: z.string().optional(),
        priceRange: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .optional(),
  costBreakdown: z
    .object({
      accommodation: z.number().int().optional().or(z.number()),
      food: z.number().int().optional().or(z.number()),
      transport: z.number().int().optional().or(z.number()),
      activities: z.number().int().optional().or(z.number()),
      misc: z.number().int().optional().or(z.number()),
      total: z.number().int().optional().or(z.number()),
    })
    .optional(),
  itinerary: z.array(
    z.object({
      day: z.number(),
      activities: z
        .array(
          z.object({
            time: z.string(),
            title: z.string(),
            placeName: z.string().optional(),
            address: z.string(),
            type: z.enum([
              "sightseeing",
              "restaurant",
              "cafe",
              "market",
              "museum",
              "temple",
              "park",
            ]),
            entryFee: z.number(),
            cost: z.number().optional(),
            duration_minutes: z.number(),
            localFoodRecommendations: z.array(z.string()).default([]),
            lat: z.number().optional(),
            lon: z.number().optional(),
            routeFromPrevious: z
              .object({
                mode: z.string(),
                distance_km: z.number(),
                travel_time_minutes: z.number(),
                from: z.string(),
                to: z.string(),
              })
              .optional(),
          }),
        )
        .min(1),
      reasoning: z.string().optional(),
      confidenceScore: z.enum(["high", "medium", "low"]).optional(),
    }),
  ),
  packingList: z.array(z.string()).optional(),
  safetyTips: z.array(z.string()).optional(),
  notes: z.string().optional(),
  explainability: z
    .object({
      reasoning: z.string().optional(),
      confidenceScore: z.number().optional(),
      degradedConstraints: z.array(z.string()).optional(),
      telemetry: z
        .object({
          latencySeconds: z.number(),
          iterations: z.number(),
          models: z.array(z.string()),
        })
        .optional(),
    })
    .optional(),
});

export class FormattingAgent {
  private openai: any;
  private geminiHelper: any;

  constructor(services: { openai: any; geminiHelper: any }) {
    this.openai = services.openai;
    this.geminiHelper = services.geminiHelper;
  }

  /**
   * Final firewall: Enforces strict adherence to the frontend zTripPlan schema.
   * If parsing fails, it autonomously attempts to self-correct the JSON instead of 500-erroring the API.
   */
  async formatFinalPayload(
    rawDraft: any,
    constraints: Record<string, any>,
    reasoningParams: Record<string, any>,
  ): Promise<any> {
    console.log(`[FormattingAgent] Structural validation initiated.`);

    // Root-cause fix (found via an LLM Council review of this exact
    // reliability problem): this object used to be missing `days`,
    // `persons`, `totalEstimatedCost`, `currency`, `packingList`, and
    // `notes` entirely (it had a `totalDays` key instead of `days`, plus
    // `budgetCategory`/`weatherContext` fields that aren't even part of
    // the real schema). Every one of those is required by the STRICTER
    // duplicate zTripPlan in AiUtilitiesService.ts that actually gates the
    // live generation path -- and DraftingAgent.ts's prompt never asks the
    // model for any of them either. That meant every single request
    // failed this file's own (looser) validation on the first attempt,
    // 100% of the time, forcing every generation through the fragile
    // self-correction LLM call below -- not as a rare recovery path but as
    // the load-bearing normal path, which is exactly why that step's own
    // occasional failures showed up as "5/5 fell back to the simpler
    // generator" rather than as a rare edge case. All of these are
    // deterministic from constraints/rawDraft -- no LLM call needed to
    // supply them correctly.
    const totalEstimatedCost =
      Number(rawDraft.costBreakdown?.total) || Number(constraints.budget) || 0;
    const packingList = Array.isArray(rawDraft.packingList)
      ? rawDraft.packingList
      : [
          "Comfortable walking shoes",
          "Weather-appropriate clothing",
          "Phone charger",
          "ID/passport",
        ];
    const notes =
      typeof rawDraft.notes === "string" && rawDraft.notes.trim()
        ? rawDraft.notes
        : `Trip plan for ${constraints.destination}, generated for ${constraints.persons} traveler(s) over ${constraints.days} day(s).`;

    // First attempt: Structural coercion
    const candidatePayload = {
      // Spread FIRST, not last -- every field below this line is a
      // deliberate coercion of raw LLM output (name->title fallback,
      // type-enum normalization, lat/lon field-name variants, etc.), and a
      // trailing `...rawDraft` would silently overwrite every one of them
      // with the un-coerced original, since rawDraft already contains
      // `itinerary`/`costBreakdown`/`safetyTips` under the same key names.
      // That's exactly what this object did for a long time: the whole
      // coercion block below existed to tolerate alternate field names the
      // model sometimes uses, but was completely inert because the raw
      // (potentially malformed) draft always won the last-write.
      ...rawDraft,
      destination: constraints.destination || "Unknown",
      days: Number(constraints.days) || 1,
      persons: Number(constraints.persons) || 1,
      totalEstimatedCost,
      currency: constraints.currency || "INR",
      packingList,
      notes,
      travelStyle: constraints.travelStyle,
      safetyTips: Array.isArray(rawDraft.safetyTips)
        ? rawDraft.safetyTips
        : ["Stay hydrated.", "Keep emergency numbers handy."],
      costBreakdown: rawDraft.costBreakdown || {
        accommodation: 0,
        food: 0,
        transport: 0,
        activities: 0,
        misc: 0,
        total: totalEstimatedCost,
      },
      itinerary: (Array.isArray(rawDraft.itinerary) ? rawDraft.itinerary : []).map(
        (dayPlan: any, i: number) => ({
          day: dayPlan.day || i + 1,
          reasoning: dayPlan.theme || dayPlan.reasoning || `Exploring Day ${i + 1}`,
          confidenceScore: "high",
          activities: Array.isArray(dayPlan.activities)
            ? dayPlan.activities.map((act: any) => {
                const mappedType = (act.type || "sightseeing").toLowerCase();
                const validTypes = [
                  "sightseeing",
                  "restaurant",
                  "cafe",
                  "market",
                  "museum",
                  "temple",
                  "park",
                ];

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
                  localFoodRecommendations: [],
                };
              })
            : [],
        }),
      ),
      localRecommendations: {
        food: [],
        culturalEtiquette: [],
      },
      explainability: {
        reasoning: reasoningParams.insight || "Optimized based on standard algorithms.",
        confidenceScore: reasoningParams.confidence || 0.9,
        degradedConstraints: reasoningParams.degraded || [],
      },
      // A second `...rawDraft` used to sit here too -- last-write-wins meant
      // THIS one, not the one moved to the top of the object, actually
      // determined every field, silently undoing that fix entirely. It
      // clobbered costBreakdown specifically with whatever raw (possibly
      // junk-key-laden) object the model produced -- confirmed live: a real
      // response had costBreakdown.foodINR/activitiesINR/totalINR
      // duplicate keys the model invented, which only the RAW draft could
      // have contained (the coercion above never adds "INR"-suffixed keys).
      // Removed; the leading spread already covers "draft already matches."
    };

    // Attempt native validation
    try {
      // Was `zTripPlan.parse(candidatePayload)` for the side effect only,
      // then returning the original candidatePayload -- Zod's whole point
      // of stripping unrecognized keys from a non-strict object never took
      // effect, since the cleaned return value was discarded. Any junk key
      // the model invents (e.g. a stray "foodINR" alongside the real
      // "food") rode straight through instead of being stripped here.
      const parsedPayload = zTripPlan.parse(candidatePayload);
      console.log(`[FormattingAgent] Payload rigidly matched Zod Schema.`);
      return parsedPayload;
    } catch (e: any) {
      console.warn(
        `[FormattingAgent] Zod mismatch detected. Initiating structural self-correction wrap...`,
      );
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
          const fixRes: any = await withRetries(
            () =>
              this.openai.chat.completions.create({
                model: "gemini-3.6-flash",
                response_format: { type: "json_object" },
                // System-only messages 400 on Gemini's OpenAI-compat
                // endpoint — no separate system/user split here, so
                // send it as user.
                messages: [{ role: "user", content: fixPrompt }],
              }),
            2,
            2000,
          );
          fixedPayload = JSON.parse(fixRes.choices[0].message.content || "{}");
        } else if (this.geminiHelper) {
          const fixResText: string = await withRetries(
            () => this.geminiHelper(fixPrompt, "application/json"),
            2,
            2000,
          );
          fixedPayload = JSON.parse(fixResText);
        } else {
          throw new Error("No LLM available for JSON repair.");
        }

        console.log(`[FormattingAgent] Self-correction completed.`);
        return fixedPayload;
      } catch (fixError) {
        console.error(
          `[FormattingAgent] FATAL formatting error. The LLM could not parse the required schema. Returning safe fallback payload to preserve UI state.`,
          fixError,
        );
        // Absolute fallback to prevent App Crash on the Frontend
        return {
          destination: constraints.destination,
          days: constraints.days,
          persons: constraints.persons,
          currency: constraints.currency || "INR",
          totalEstimatedCost: 0,
          itinerary: [],
          explainability: {
            reasoning: "Generation succeeded but formatting failed. Please retry.",
          },
        };
      }
    }
  }
}
