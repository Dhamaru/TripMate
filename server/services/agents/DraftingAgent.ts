import { z } from "zod";
import { withRetries } from "./utils";

export class DraftingAgent {
  private openai: any;
  private geminiHelper: any;

  constructor(services: { openai: any; geminiHelper: any }) {
    this.openai = services.openai;
    this.geminiHelper = services.geminiHelper;
  }

  /**
   * Generates a primary draft itinerary that serves as the baseline for the CriticAgent.
   */
  async generateDraft(
    goalText: string,
    context: Record<string, any>,
    constraints: Record<string, any>,
  ): Promise<any> {
    const startTime = Date.now();
    console.log(`[DraftingAgent] Formulating draft baseline...`);

    const anchors: string[] =
      Array.isArray(context.anchors) && context.anchors.length > 0 ? context.anchors : [];
    const anchorsText =
      anchors.length > 0
        ? `Real local places to PRIORITISE (use as many as possible): ${JSON.stringify(anchors)}`
        : `No pre-fetched anchors available. You MUST use your training knowledge to name real, well-known tourist spots, temples, restaurants, cafes, markets, and attractions that actually exist in ${constraints.destination}.`;

    const prompt = `
      You are an expert travel planner. Generate a REAL, SPECIFIC, day-by-day itinerary for ${constraints.destination}.

      ABSOLUTE RULES — VIOLATION WILL REJECT YOUR RESPONSE:
      ❌ NEVER use generic activity titles like "Wake up", "Dinner", "Lunch", "Breakfast", "Return to accommodation", "Check in", "Rest", or any placeholder that is NOT a real named place.
      ✅ EVERY activity title must be the ACTUAL NAME of a real place (e.g., "Durga Mata Temple", "Under The Wood Restaurant", "Lumbini Park", "Forum Mall").
      ✅ type "restaurant" or "cafe" must be a real restaurant name with its actual address — not just "Local Restaurant" or "Dinner".
      ✅ type "sightseeing"/"temple"/"museum"/"park"/"market" must be a real landmark name.
      ✅ Rotate different restaurants for lunch and dinner each day — no repeats.
      ✅ Include a mix per day: morning temple/attraction → lunch at named restaurant → afternoon market/monument → evening activity → dinner at named restaurant/street food area.
      ✅ EVERY sightseeing/temple/museum/park/market activity must be a DIFFERENT real place across the ENTIRE trip — never reuse the same landmark under a reworded title (e.g. "X Lake" on day 1 and "X Lake View Point" on day 2 is the SAME place and is forbidden). If ${constraints.destination} is small and genuinely doesn't have enough distinct attractions to fill every day, do NOT invent detours to other towns to pad it out — the traveler chose this destination, not a tour of the surrounding region. Instead give the existing real spots more time (a longer, unhurried visit) and fill the rest of the day with a genuine local experience clearly framed as such (a market walk, a boat ride on the same lake, a cooking class, leisure/rest time) rather than a second disguised visit to the same landmark.

      TRIP CONSTRAINTS:
      - Destination: ${constraints.destination}
      - Duration: EXACTLY ${constraints.days} days (generate ALL ${constraints.days} days, no exceptions)
      - Persons: ${constraints.persons}
      - Travel style: ${constraints.travelStyle}
      - Budget: ${constraints.budget || "flexible"} ${constraints.currency || "INR"}
      ${
        Array.isArray(constraints.cuisinePreferences) && constraints.cuisinePreferences.length > 0
          ? `- Cuisine preferences: ${constraints.cuisinePreferences.join(", ")} — every restaurant/cafe activity MUST match one of these cuisines, named and real (e.g. a real North Indian vegetarian restaurant, not a generic "local restaurant").`
          : ""
      }
      ${
        Array.isArray(constraints.dietaryPreferences) && constraints.dietaryPreferences.length > 0
          ? `- Dietary requirements: ${constraints.dietaryPreferences.join(", ")} — every restaurant/cafe/food activity MUST accommodate this (e.g. a genuinely vegetarian-friendly restaurant, not one that merely has a token veg option).`
          : ""
      }

      ${anchorsText}

      For every activity you MUST provide:
      1. "title" and "placeName": the REAL NAME of the venue (e.g. "Kanaka Durga Temple", NOT "Temple Visit")
      2. "address": real street/area address
      3. "lat" and "lon": approximate GPS coordinates as floats
      4. "type": one of sightseeing | restaurant | cafe | market | museum | temple | park
      5. "duration_minutes" and "cost" as numbers
      6. "time" in "HH:MM AM/PM" format

      JSON OUTPUT (strict, no extra keys):
      {
        "itinerary": [
          {
            "day": 1,
            "theme": "Temples & Local Cuisine",
            "activities": [
              {
                "time": "08:30 AM",
                "title": "Kanaka Durga Temple",
                "placeName": "Kanaka Durga Temple",
                "address": "Indrakeeladri Hill, Vijayawada, Andhra Pradesh",
                "lat": 16.5193,
                "lon": 80.6305,
                "type": "temple",
                "entryFee": 0,
                "cost": 0,
                "duration_minutes": 90
              },
              {
                "time": "11:00 AM",
                "title": "Prakasam Barrage",
                "placeName": "Prakasam Barrage",
                "address": "Krishna River, Vijayawada",
                "lat": 16.5124,
                "lon": 80.6217,
                "type": "sightseeing",
                "entryFee": 0,
                "cost": 0,
                "duration_minutes": 60
              },
              {
                "time": "01:00 PM",
                "title": "Babai Hotel",
                "placeName": "Babai Hotel",
                "address": "Governorpet, Vijayawada",
                "lat": 16.5062,
                "lon": 80.6480,
                "type": "restaurant",
                "entryFee": 0,
                "cost": 200,
                "duration_minutes": 60
              },
              {
                "time": "03:00 PM",
                "title": "Victoria Jubilee Museum",
                "placeName": "Victoria Jubilee Museum",
                "address": "Bandar Road, Vijayawada",
                "lat": 16.5088,
                "lon": 80.6399,
                "type": "museum",
                "entryFee": 20,
                "cost": 20,
                "duration_minutes": 90
              },
              {
                "time": "07:30 PM",
                "title": "Under The Wood",
                "placeName": "Under The Wood Restaurant",
                "address": "Benz Circle, Vijayawada",
                "lat": 16.5116,
                "lon": 80.6390,
                "type": "restaurant",
                "entryFee": 0,
                "cost": 400,
                "duration_minutes": 75
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
      const draftText: any = await withRetries(
        () => this.geminiHelper(prompt, "application/json"),
        3,
        2000,
      );

      const latency = Date.now() - startTime;
      console.log(`[DraftingAgent] Initial draft generated in ${latency}ms`);

      return {
        success: true,
        source: "gemini",
        rawDraft: typeof draftText === "string" ? JSON.parse(draftText) : draftText,
        telemetry: { drafterLatencyMs: latency },
      };
    } catch (geminiError) {
      console.warn(`[DraftingAgent] Gemini failed. Falling back to OpenAI...`, geminiError);

      try {
        const openaiStart = Date.now();
        const fallbackRes: any = await withRetries(
          () =>
            this.openai.chat.completions.create({
              model: "gpt-4o-mini",
              response_format: { type: "json_object" },
              messages: [{ role: "system", content: prompt }],
            }),
          2,
          3000,
        );

        const latency = Date.now() - openaiStart;
        return {
          success: true,
          source: "openai_fallback",
          rawDraft: JSON.parse(fallbackRes.choices[0].message.content || "[]"),
          telemetry: { drafterLatencyMs: latency, degraded: true },
        };
      } catch (openaiError) {
        console.error(
          `[DraftingAgent] FATAL Drafting Error: Both primary and fallback LLMs failed.`,
        );
        throw new Error("Drafting phase completely failed.");
      }
    }
  }
}
