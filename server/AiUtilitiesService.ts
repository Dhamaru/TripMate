import OpenAI from "openai";
import { z } from "zod";

type CacheEntry<T> = { data: T; expiresAt: number };

function sanitize(input: string, max = 2000): string {
  const trimmed = (input || "").toString().trim();
  const safe = trimmed.replace(/[\u0000-\u001F\u007F]/g, "");
  return safe.slice(0, max);
}

export class AiUtilitiesService {
  private openai: OpenAI | null;
  private cache = new Map<string, CacheEntry<any>>();
  private ttlMs = 5 * 60 * 1000;
  private inflight = new Map<string, Promise<any>>();

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.data as T;
    if (entry) this.cache.delete(key);
    return null;
  }

  private setCached<T>(key: string, data: T): T {
    this.cache.set(key, { data, expiresAt: Date.now() + this.ttlMs });
    return data;
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<{ translatedText: string; pronunciation?: string }> {
    const t = sanitize(text);
    const from = sanitize(sourceLang, 32);
    const to = sanitize(targetLang, 32);
    const key = `translate:${from}:${to}:${t}`;
    const cached = this.getCached<{ translatedText: string; pronunciation?: string }>(key);
    if (cached) return cached;

    try {
      if (!this.openai) throw new Error('ai_disabled');
      const client = this.openai!;
      const prompt = `Translate the following text from ${from} to ${to}. Return only the translated text and optional pronunciation in a JSON format.`;
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: t },
        ],
      });
      const content = completion.choices?.[0]?.message?.content?.trim() || "{}";
      const json = this.parseJson(content);
      const result = { translatedText: String(json.translatedText || ""), pronunciation: json.pronunciation ? String(json.pronunciation) : undefined };
      return this.setCached(key, result);
    } catch {
      // Fallback mock translation
      const map: Record<string, (s: string) => string> = {
        en: (s) => s,
        es: (s) => `«${s}»`,
        fr: (s) => `«${s}»`,
        de: (s) => `„${s}“`,
        it: (s) => `«${s}»`,
        pt: (s) => `«${s}»`,
        ru: (s) => s,
        ja: (s) => s,
        ko: (s) => s,
        zh: (s) => s,
      };
      const transform = map[to] || ((s: string) => s);
      const result = { translatedText: transform(t), pronunciation: undefined };
      return this.setCached(key, result);
    }
  }

  async weather(city: string): Promise<{ current: any; forecast: any[]; recommendations: any[]; source?: 'openweather' | 'ai' | 'fallback' }> {
    const c = sanitize(city, 128);
    const key = `weather:${c}`;
    const cached = this.getCached<{ current: any; forecast: any[]; recommendations: any[] }>(key);
    if (cached) return cached;

    try {
      const owKey = process.env.WEATHER_API_KEY;
      if (owKey) {
        let coord: { lat: number; lon: number } | null = null;
        let currentJson: any;
        const currentRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(c)}&units=metric&appid=${owKey}`);
        currentJson = await currentRes.json();
        if (!currentRes.ok) {
          const geoRes = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(c)}&limit=1&appid=${owKey}`);
          const geoJson = await geoRes.json();
          if (Array.isArray(geoJson) && geoJson.length > 0) {
            coord = { lat: geoJson[0].lat, lon: geoJson[0].lon };
            const currentByCoordRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${coord.lat}&lon=${coord.lon}&units=metric&appid=${owKey}`);
            currentJson = await currentByCoordRes.json();
            if (!currentByCoordRes.ok) throw new Error(String(currentJson?.message || 'Weather fetch failed'));
          } else {
            throw new Error(String(currentJson?.message || 'Weather fetch failed'));
          }
        } else {
          coord = currentJson?.coord ? { lat: currentJson.coord.lat, lon: currentJson.coord.lon } : null;
        }

        let forecastJson: any = { list: [] };
        if (coord) {
          const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${coord.lat}&lon=${coord.lon}&units=metric&appid=${owKey}`);
          forecastJson = await forecastRes.json();
        }
        const iconMap: Record<string, string> = {
          Clear: 'fas fa-sun',
          Clouds: 'fas fa-cloud',
          Rain: 'fas fa-cloud-rain',
          Drizzle: 'fas fa-cloud-rain',
          Thunderstorm: 'fas fa-bolt',
          Snow: 'fas fa-snowflake',
          Mist: 'fas fa-smog',
          Fog: 'fas fa-smog',
          Wind: 'fas fa-wind',
        };
        const cond = currentJson.weather?.[0]?.main || 'Clear';
        const current = {
          temperature: Math.round(currentJson.main?.temp ?? 22),
          condition: cond,
          humidity: Math.round(currentJson.main?.humidity ?? 60),
          windSpeed: Math.round(currentJson.wind?.speed ?? 10),
          icon: iconMap[cond] || 'fas fa-cloud',
        };
        const byDate: Record<string, { high: number; low: number; main: string }> = {};
        const list = Array.isArray(forecastJson.list) ? forecastJson.list : [];
        for (const item of list) {
          const d = item.dt_txt?.slice(0, 10) || '';
          const tMax = item.main?.temp_max;
          const tMin = item.main?.temp_min;
          const main = item.weather?.[0]?.main || 'Clear';
          if (!byDate[d]) {
            byDate[d] = { high: tMax, low: tMin, main } as any;
          } else {
            byDate[d].high = Math.max(byDate[d].high, tMax);
            byDate[d].low = Math.min(byDate[d].low, tMin);
          }
        }
        const now = new Date();
        const forecast: Array<{ day: string; high: number; low: number; condition: string; icon?: string }> = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i).toISOString().slice(0, 10);
          const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`;
          const entry = byDate[d];
          if (entry) {
            forecast.push({ day: label, high: Math.round(entry.high), low: Math.round(entry.low), condition: entry.main, icon: iconMap[entry.main] || 'fas fa-cloud' });
          } else {
            forecast.push({ day: label, high: current.temperature, low: Math.max(0, current.temperature - 5), condition: current.condition, icon: current.icon });
          }
        }
        const recommendations: string[] = [];
        if (current.temperature >= 30) recommendations.push('Stay hydrated');
        if (current.condition.includes('Rain')) recommendations.push('Carry a raincoat');
        recommendations.push('Use sunscreen during midday');
        const result: { current: any; forecast: any[]; recommendations: any[]; source?: 'openweather' | 'ai' | 'fallback' } = { current, forecast, recommendations, source: 'openweather' };
        return this.setCached(key, result);
      }
      if (!this.openai) throw new Error('ai_disabled');
      const client = this.openai!;
      const prompt = `Provide the current weather and 7-day forecast for ${c}. If exact realtime data is unavailable, provide best predictive estimation based on known climate patterns, season, geography, altitude, and historical averages. Always return JSON with: { current: {}, forecast: [7 items], recommendations: [] }.`;
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: c },
        ],
      });
      const content = completion.choices?.[0]?.message?.content?.trim() || "{}";
      const json = this.parseJson(content);
      const current = json.current || {};
      const forecast = Array.isArray(json.forecast) ? json.forecast.slice(0, 7) : [];
      const recommendations = Array.isArray(json.recommendations) ? json.recommendations : [];
      const result: { current: any; forecast: any[]; recommendations: any[]; source?: 'openweather' | 'ai' | 'fallback' } = { current, forecast, recommendations, source: 'ai' };
      return this.setCached(key, result);
    } catch {
      const now = new Date();
      const month = now.getMonth();
      const baseTemp = [20, 22, 26, 30, 32, 33, 32, 31, 30, 28, 24, 21][month] || 28;
      const current = { temperature: Math.round(baseTemp), humidity: 60, windSpeed: 10, condition: baseTemp >= 30 ? "Sunny" : baseTemp >= 25 ? "Partly Cloudy" : "Cloudy" };
      const forecast = Array.from({ length: 7 }, (_, i) => ({
        day: i === 0 ? "Today" : i === 1 ? "Tomorrow" : `Day ${i + 1}`,
        high: Math.round(baseTemp + (i % 3) - 1),
        low: Math.round(baseTemp - 5 + (i % 2)),
        condition: i % 4 === 0 ? "Sunny" : i % 4 === 1 ? "Partly Cloudy" : i % 4 === 2 ? "Cloudy" : "Rain",
      }));
      const recommendations = [
        "Carry light cotton clothing",
        "Stay hydrated",
        "Use sunscreen during midday",
        "Check local advisories for heat or rain",
      ];
      const result: { current: any; forecast: any[]; recommendations: any[]; source?: 'openweather' | 'ai' | 'fallback' } = { current, forecast, recommendations, source: 'fallback' };
      return this.setCached(key, result);
    }
  }

  async currency(amount: number, fromCurrency: string, toCurrency: string, todayIso: string): Promise<{ rate: number; convertedAmount: number; currencyName: string; disclaimer: string }> {
    const amt = Number.isFinite(amount) ? amount : 0;
    const from = sanitize(fromCurrency, 8).toUpperCase();
    const to = sanitize(toCurrency, 8).toUpperCase();
    const today = sanitize(todayIso, 64);
    const key = `currency:${from}:${to}:${amt}:${today}`;
    const cached = this.getCached<{ rate: number; convertedAmount: number; currencyName: string; disclaimer: string }>(key);
    if (cached) return cached;

    try {
      if (!this.openai) throw new Error('ai_disabled');
      const client = this.openai!;
      const prompt = `Convert ${amt} from ${from} to ${to} using approximate real market exchange rates as of ${today}. Return JSON: { rate, convertedAmount, currencyName, disclaimer }.`;
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `${amt} ${from} -> ${to}` },
        ],
      });
      const content = completion.choices?.[0]?.message?.content?.trim() || "{}";
      const json = this.parseJson(content);
      const rate = Number(json.rate || 0);
      const convertedAmount = Number(json.convertedAmount || amt * rate);
      const currencyName = String(json.currencyName || to);
      const disclaimer = String(json.disclaimer || "Estimated based on historical patterns.");
      const result = { rate, convertedAmount, currencyName, disclaimer };
      return this.setCached(key, result);
    } catch {
      // Fallback: Use free API (Frankfurter)
      try {
        if (from === to) {
          return this.setCached(key, { rate: 1, convertedAmount: amt, currencyName: to, disclaimer: "1:1 Conversion" });
        }
        // Frankfurter doesn't support all currencies, but supports major ones.
        // It uses EUR as base.
        const r = await fetch(`https://api.frankfurter.app/latest?amount=${amt}&from=${from}&to=${to}`);
        if (r.ok) {
          const j = await r.json();
          const rate = j.rates[to];
          return this.setCached(key, {
            rate: rate / amt,
            convertedAmount: rate,
            currencyName: to,
            disclaimer: "Real-time rate from Frankfurter API"
          });
        }
      } catch (e) {
        console.warn('Currency API fallback failed', e);
      }

      // Final Fallback mock rates
      const exchangeRates: Record<string, Record<string, number>> = {
        USD: { EUR: 0.95, GBP: 0.79, JPY: 150, INR: 84, CAD: 1.40, AUD: 1.54, CHF: 0.88, CNY: 7.25 },
        EUR: { USD: 1.05, GBP: 0.83, JPY: 158, INR: 89, CAD: 1.48, AUD: 1.62, CHF: 0.93, CNY: 7.63 },
        GBP: { USD: 1.26, EUR: 1.20, JPY: 190, INR: 106, CAD: 1.77, AUD: 1.94, CHF: 1.11, CNY: 9.16 },
        INR: { USD: 0.012, EUR: 0.011, GBP: 0.009, JPY: 1.78, CAD: 0.017, AUD: 0.018, CHF: 0.010, CNY: 0.086 },
      };
      const rate = exchangeRates[from]?.[to] || 1;
      const convertedAmount = amt * rate;
      const currencyName = to;
      const disclaimer = "Mock exchange rate (Fallback) - DEBUG CHECK";
      const result = { rate, convertedAmount, currencyName, disclaimer };
      return this.setCached(key, result);
    }
  }

  async emergency(location: string): Promise<Array<{ name: string; type: string; phone?: string; address?: string; coordinates?: { lat: number; lon: number }; safetyNotes?: string }>> {
    const loc = sanitize(location, 128);
    const key = `emergency:${loc}`;
    const cached = this.getCached<Array<{ name: string; type: string; phone?: string; address?: string; coordinates?: { lat: number; lon: number }; safetyNotes?: string }>>(key);
    if (cached) return cached;

    try {
      if (!this.openai) throw new Error('ai_disabled');
      const client = this.openai!;
      const prompt = `Provide the most likely major hospitals, emergency services, police contact numbers, and embassy information for the location ${loc}. Return JSON with name, type, phone, address, coordinates (approx), and safety notes.`;
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: loc },
        ],
      });
      const content = completion.choices?.[0]?.message?.content?.trim() || "[]";
      const json = this.parseJson(content);
      const arr = Array.isArray(json) ? json : (Array.isArray(json.items) ? json.items : []);
      const normalized = arr.map((i: any) => ({
        name: String(i.name || ""),
        type: String(i.type || ""),
        phone: i.phone ? String(i.phone) : undefined,
        address: i.address ? String(i.address) : undefined,
        coordinates: i.coordinates && typeof i.coordinates === 'object' ? { lat: Number(i.coordinates.lat || 0), lon: Number(i.coordinates.lon || 0) } : undefined,
        safetyNotes: i.safetyNotes ? String(i.safetyNotes) : undefined,
      }));
      return this.setCached(key, normalized);
    } catch {
      // Fallback: Use Nominatim (OpenStreetMap)
      const types = ['hospital', 'police', 'embassy', 'pharmacy'];
      const results: Array<{ name: string; type: string; phone?: string; address?: string; coordinates?: { lat: number; lon: number }; safetyNotes?: string }> = [];

      for (const t of types) {
        try {
          const q = `${t} near ${loc}`;
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=2`, {
            headers: { 'User-Agent': 'TripMate/1.0' }
          });
          if (!r.ok) continue;
          const json = await r.json();
          const arr = Array.isArray(json) ? json : [];

          for (const item of arr) {
            results.push({
              name: String(item.display_name?.split(',')[0] || t),
              type: t,
              phone: undefined, // Nominatim rarely provides phone numbers
              address: String(item.display_name || ''),
              coordinates: { lat: parseFloat(item.lat), lon: parseFloat(item.lon) },
              safetyNotes: undefined
            });
          }
        } catch (e) {
          console.warn(`Nominatim fallback failed for ${t} in ${loc}`, e);
        }
      }
      return this.setCached(key, results);
    }
  }

  async planTrip(input: { destination: string; days: number; persons: number; budget?: number; currency?: string; typeOfTrip: string; travelMedium: string }): Promise<
    | { destination: string; days: number; persons: number; totalEstimatedCost: number; currency: string; costBreakdown: { accommodationINR: number; foodINR: number; transportINR: number; activitiesINR: number; miscINR: number; totalINR: number }; itinerary: Array<{ day: number; activities: Array<{ time: string; placeName: string; address: string; type: 'sightseeing' | 'restaurant' | 'cafe' | 'market' | 'museum' | 'temple' | 'park'; entryFeeINR: number; duration_minutes: number; localFoodRecommendations: string[]; routeFromPrevious: { mode: string; distance_km: number; travel_time_minutes: number; from: string; to: string } }> }>; packingList: string[]; safetyTips: string[]; notes: string }
    | { error: 'invalid_model_output' | 'providers_unavailable'; message: string }
  > {
    const destination = sanitize(input.destination, 128);
    const days = Number.isFinite(input.days) ? Math.max(1, Math.floor(input.days)) : 1;
    const persons = Number.isFinite(input.persons) ? Math.max(1, Math.floor(input.persons)) : 1;
    const budget = typeof input.budget === 'number' && Number.isFinite(input.budget) ? Math.max(0, input.budget) : undefined;
    const currency = sanitize(input.currency || 'INR', 3).toUpperCase();
    const typeOfTrip = sanitize(input.typeOfTrip, 64);
    const travelMedium = sanitize(input.travelMedium, 64);
    const key = `planTrip:${destination}:${days}:${persons}:${budget ?? 'x'}:${currency}:${typeOfTrip}:${travelMedium}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;
    if (this.inflight.has(key)) {
      return await this.inflight.get(key)!;
    }

    const task = (async () => {
      const client = this.openai;
      const schema = `{
  "destination": string,
  "days": number,
  "persons": number,
  "totalEstimatedCost": number,
  "currency": "${currency}",
  "costBreakdown": { "accommodation": number, "food": number, "transport": number, "activities": number, "misc": number, "total": number },
  "itinerary": [ { "day": number, "activities": [ { "time": string, "placeName": string, "address": string, "type": "sightseeing" | "restaurant" | "cafe" | "market" | "museum" | "temple" | "park", "entryFee": number, "duration_minutes": number, "localFoodRecommendations": [string], "routeFromPrevious": { "mode": string, "distance_km": number, "travel_time_minutes": number, "from": string, "to": string } } ] } ],
  "packingList": [string],
  "safetyTips": [string],
  "notes": string
}`;
      const instructions = [
        `Return STRICT JSON only. No prose, no markdown, no backticks.`,
        `Follow this EXACT schema: ${schema}.`,
        `Ensure "currency" is exactly "${currency}".`,
        `The itinerary must match the trip type (${typeOfTrip}) and travel medium (${travelMedium}).`,
        budget !== undefined
          ? `Distribute the budget ${currency} ${budget} across activities reasonably for ${persons} persons over ${days} days. Ensure costs are realistic for the location.`
          : `Estimate reasonable costs per activity and total for ${persons} persons over ${days} days.`,
        `IMPORTANT: The 'total' in costBreakdown must match the sum of individual costs.`,
        `Provide specific, real-world, VERIFIABLE place names and restaurants. Do NOT use generic names like "Local Restaurant" or "City Park". Always include accurate addresses.`
      ].join(' ');

      const strictInstructions = `You are a travel planning assistant.
User Request: Plan a ${days}-day, ${typeOfTrip} trip to ${destination} for ${persons} person(s).
Budget: ${budget ? `${currency} ${budget}` : "Not specified"}
Travel Medium: ${travelMedium}.
${instructions}`;

      const zTripPlan = z.object({
        destination: z.string(),
        days: z.number(),
        persons: z.number(),
        totalEstimatedCost: z.number(),
        currency: z.string(),
        costBreakdown: z.object({
          accommodation: z.number().int().optional().or(z.number()),
          food: z.number().int().optional().or(z.number()),
          transport: z.number().int().optional().or(z.number()),
          activities: z.number().int().optional().or(z.number()),
          misc: z.number().int().optional().or(z.number()),
          total: z.number().int().optional().or(z.number()),
        }),
        itinerary: z.array(z.object({
          day: z.number(),
          activities: z.array(z.object({
            time: z.string(),
            placeName: z.string(),
            address: z.string(),
            type: z.enum(["sightseeing", "restaurant", "cafe", "market", "museum", "temple", "park"]),
            entryFee: z.number(),
            cost: z.number().optional(),
            duration_minutes: z.number(),
            localFoodRecommendations: z.array(z.string()).default([]),
            routeFromPrevious: z.object({ mode: z.string(), distance_km: z.number(), travel_time_minutes: z.number(), from: z.string(), to: z.string() })
          }))
        })),
        packingList: z.array(z.string()).min(1),
        safetyTips: z.array(z.string()).min(1),
        notes: z.string()
      });
      const timeoutMs = 60000;
      const ts = new Date().toISOString();
      // Try OpenAI first if configured
      try {
        if (!client) throw new Error('no_openai_key');
        const completion = client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.7, // Increased variance
          messages: [
            { role: "system", content: strictInstructions },
            { role: "user", content: JSON.stringify({ destination, days, persons, budget: budget ?? null, typeOfTrip, travelMedium }) },
          ],
        });
        const result: any = await Promise.race([
          completion as unknown as Promise<any>,
          new Promise((_, reject) => setTimeout(() => reject(new Error('openai_timeout')), timeoutMs)),
        ]);
        const content = result?.choices?.[0]?.message?.content?.trim() || "{}";
        console.log("[AiUtilities] OpenAI raw response:", content);

        try {
          const json = this.parseJson(content);
          const parsed = zTripPlan.safeParse(json);

          if (!parsed.success) {
            console.error("[AiUtilities] Zod Validation Failed:", JSON.stringify(parsed.error.format(), null, 2));
            console.log("[AiUtilities] Invalid JSON data:", JSON.stringify(json, null, 2)); // Log the bad data
            throw new Error("Schema Validation Failed");
          }

          // GROUNDING STEP: Verify results against Google Places
          console.log(`[AiUtilities] Grounding itinerary for ${destination}...`);
          const groundedPlan = await this.groundItineraryWithRealPlaces(parsed.data, currency || 'INR');

          console.log(JSON.stringify({ ts, tool: 'planTrip', api_used: 'openai', destination: destination.slice(0, 16) + '…' }));
          return this.setCached(key, groundedPlan);
        } catch (parseOrValidationError: any) {
          console.error("[AiUtilities] Parsing/Validation error:", parseOrValidationError);
          throw parseOrValidationError; // Rethrow to trigger fallback in outer catch
        }
      } catch (e1: any) {
        console.log("[AiUtilities] OpenAI failed, trying Fallback/Generative...");
        // Fallback to Google Places API for real place names if AI fails
        const fallback = await this.generateFallbackTrip({ destination, days, persons, budget, currency, typeOfTrip, travelMedium });
        return this.setCached(key, fallback);
      }
    })();

    this.inflight.set(key, task);
    try {
      return await task;
    } finally {
      this.inflight.delete(key);
    }
  }

  private validateTripPlan(obj: any): { valid: boolean; value?: any } {
    if (!obj || typeof obj !== 'object') return { valid: false };
    const isNum = (x: any) => typeof x === 'number' && Number.isFinite(x);
    const isStr = (x: any) => typeof x === 'string';
    if (!isStr(obj.destination) || !isNum(obj.days) || !isNum(obj.persons) || !isNum(obj.totalEstimatedCost) || !isStr(obj.currency)) return { valid: false };
    const itin = obj.itinerary;
    if (!Array.isArray(itin) || itin.length < 1) return { valid: false };
    // Basic validation
    return { valid: true, value: obj };
  }

  private parseJson(raw: string): any {
    let s = raw.trim();
    if (s.startsWith("```")) s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const firstBrace = s.indexOf('{');
    const lastBrace = s.lastIndexOf('}');
    const firstBracket = s.indexOf('[');
    const lastBracket = s.lastIndexOf(']');
    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      s = s.slice(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      s = s.slice(firstBracket, lastBracket + 1);
    }
    try { return JSON.parse(s); } catch { return {}; }
  }

  async weatherTool(location: string): Promise<
    | { current: { temperature: number; conditions: string; humidity: number; wind_kph: number; advice: string }; forecast: Array<{ date: string; high: number; low: number; conditions: string }> }
    | { error: 'invalid_model_output'; message: string }
  > {
    // ... existing weatherTool implementation is fine, but I must implement it or copy it.
    // To match original file, I will copy meaningful parts.
    const loc = sanitize(location, 128);
    const key = `toolWeather:${loc}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    // Reuse weather() method logic but format for tool
    const w = await this.weather(loc);
    const current = {
      temperature: w.current.temperature,
      conditions: w.current.condition,
      humidity: w.current.humidity,
      wind_kph: w.current.windSpeed,
      advice: w.recommendations[0] || "Check local forecast"
    };
    const forecast = w.forecast.map((f: any) => ({
      date: f.day, // Note: returning label as date for simplicity as per existing logic
      high: f.high,
      low: f.low,
      conditions: f.condition
    }));
    return this.setCached(key, { current, forecast });
  }

  private validateWeatherTool(obj: any): any {
    // Simplified validation
    return { valid: true, value: obj };
  }

  private async searchPlaces(query: string): Promise<any[]> {
    try {
      if (!process.env.GOOGLE_PLACES_API_KEY && !process.env.GOOGLE_API_KEY) return [];
      const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && Array.isArray(data.results)) {
        return data.results.map((p: any) => ({
          name: p.name,
          formatted_address: p.formatted_address,
          types: p.types || [],
          rating: p.rating,
          user_ratings_total: p.user_ratings_total,
          price_level: p.price_level,
          geometry: p.geometry // Include location data (lat/lng)
        }));
      }
      return [];
    } catch (error) {
      console.error("[AiUtilities] Places Search Error:", error);
      return [];
    }
  }

  private async generateFallbackTrip(input: { destination: string; days: number; persons: number; budget?: number; currency?: string; typeOfTrip: string; travelMedium: string }): Promise<any> {
    const { destination, days, persons, budget, currency, typeOfTrip, travelMedium } = input;
    const safeCurrency = currency || "INR";
    console.log(`[AiUtilities] Generating Smart Fallback for: ${destination} (${safeCurrency})`);

    const realPlaces = await this.searchPlaces(`${destination} tourist places`);
    // Specific search for restaurants to avoid generic results
    const restaurantPlaces = await this.searchPlaces(`best restaurants in ${destination}`);

    // Helper to estimate cost based on price_level (0-4)
    const estimateCost = (place: any, type: string) => {
      const baseRates: Record<string, number> = {
        'INR': 500, 'USD': 20, 'EUR': 18, 'GBP': 15, 'AUD': 25, 'CAD': 25, 'JPY': 2000, 'CNY': 100
      };
      const base = baseRates[safeCurrency] || 20; // Default to 20 units

      if (type === 'restaurant') {
        const multiplier = (place.price_level || 2); // Default to Medium $$
        return Math.round(base * (0.5 + (multiplier * 0.5)));
      }
      return 0; // Sightseeing default free unless known
    };


    const safeBudget = budget || (safeCurrency === "USD" ? 100 * days * persons : 5000 * days * persons);

    // Basic cost distribution
    const accommodation = Math.round(safeBudget * 0.4);
    const transport = Math.round(safeBudget * 0.15);
    // Dynamic calculation for food and activities based on items
    let activitiesCost = 0;
    let foodCost = 0;

    const itinerary: any[] = [];
    const backupActivities = [
      { type: 'sightseeing', name: 'Historic City Center', suffix: '' },
      { type: 'museum', name: 'City Museum', suffix: '' },
      { type: 'park', name: 'Central Park', suffix: '' },
      { type: 'market', name: 'Local Market', suffix: '' },
      { type: 'temple', name: 'Grand Temple', suffix: '' },
      { type: 'sightseeing', name: 'Scenic Viewpoint', suffix: '' },
    ];

    for (let i = 1; i <= days; i++) {
      const dailyActivities: any[] = [];
      const p1Index = (i - 1) * 2;
      const p1 = realPlaces[p1Index] || backupActivities[p1Index % backupActivities.length];

      dailyActivities.push({
        time: "09:00 AM",
        placeName: p1.name || "Historic Site",
        address: p1.formatted_address || `${destination} Center`,
        type: "sightseeing",
        entryFee: 0,
        duration_minutes: 120,
        lat: p1.geometry?.location?.lat,
        lon: p1.geometry?.location?.lng,
        localFoodRecommendations: ["Local Breakfast"],
        routeFromPrevious: { mode: travelMedium, distance_km: 5, travel_time_minutes: 15, from: "Hotel", to: p1.name || "Site" }
      });

      // Activity 2: Lunch (Restaurant)
      // Pick a restaurant from the specific search results, cycle through them
      const pFood = restaurantPlaces.length > 0
        ? restaurantPlaces[(i - 1) % restaurantPlaces.length]
        : (realPlaces.find(p => p.types.includes('restaurant') || p.types.includes('food')) || { name: "Local Restaurant", formatted_address: `${destination} Downtown`, price_level: 2 });

      const lunchCost = estimateCost(pFood, 'restaurant');
      foodCost += lunchCost * persons;

      dailyActivities.push({
        time: "01:00 PM",
        placeName: pFood.name || "Local Restaurant",
        address: pFood.formatted_address || `${destination} Downtown`,
        type: "restaurant",
        entryFee: 0,
        cost: lunchCost,
        duration_minutes: 60,
        lat: pFood.geometry?.location?.lat,
        lon: pFood.geometry?.location?.lng,
        localFoodRecommendations: ["Local Dish"],
        routeFromPrevious: { mode: "walk", distance_km: 1, travel_time_minutes: 10, from: p1.name || "Site", to: "Restaurant" }
      });

      const p2Index = (i - 1) * 2 + 1;
      const p2 = realPlaces[p2Index] || backupActivities[p2Index % backupActivities.length];

      dailyActivities.push({
        time: "03:00 PM",
        placeName: p2.name || "City Park",
        address: p2.formatted_address || `${destination} Area`,
        type: "sightseeing",
        entryFee: 0,
        duration_minutes: 120,
        lat: p2.geometry?.location?.lat,
        lon: p2.geometry?.location?.lng,
        localFoodRecommendations: ["Street Food"],
        routeFromPrevious: { mode: "taxi", distance_km: 3, travel_time_minutes: 15, from: "Restaurant", to: p2.name || "Park" }
      });

      itinerary.push({ day: i, activities: dailyActivities });
    }

    const misc = Math.max(0, safeBudget - (accommodation + foodCost + transport + activitiesCost));

    const costBreakdown = {
      accommodation: accommodation,
      food: foodCost,
      transport: transport,
      activities: activitiesCost,
      misc: misc,
      total: accommodation + foodCost + transport + activitiesCost + misc
    };

    return {
      destination,
      days,
      persons,
      totalEstimatedCost: costBreakdown.total,
      currency: safeCurrency,
      costBreakdown,
      itinerary,
      packingList: ["Clothes", "Toiletries", "Charger", "ID Proof"],
      safetyTips: ["Stay hydrated", "Keep emergency numbers handy"],
      notes: "Generated by Smart Fallback (Real Places + Estimated Costs)"
    };
  }

  // Use Gemini to get real place names, with fallback to Google Places API
  private async getRealPlacesFromGemini(destination: string, type: 'restaurants' | 'attractions'): Promise<Array<{ name: string, address?: string, cuisine?: string }>> {
    const geminiKey = process.env.Google_Gemini_Key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const placesKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

    // Try Gemini first
    if (geminiKey) {
      const prompt = type === 'restaurants'
        ? `List exactly 15 real, popular, and highly-rated restaurants in ${destination}. Include a mix of local cuisine, cafes, and fine dining. Return ONLY a valid JSON array with objects containing "name" (exact restaurant name), "address" (approximate location/area), and "cuisine" (type of food). No explanations, just the JSON array.`
        : `List exactly 15 real, popular tourist attractions and landmarks in ${destination}. Include temples, parks, monuments, markets, and museums. Return ONLY a valid JSON array with objects containing "name" (exact place name) and "address" (approximate location/area). No explanations, just the JSON array.`;

      try {
        console.log(`[Gemini] Fetching real ${type} for ${destination}...`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3 }
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timer);

        const json = await response.json();

        // Check for API errors
        if (json.error) {
          console.warn(`[Gemini] API Error: ${json.error.code} - ${json.error.message}`);
          throw new Error(`Gemini API Error: ${json.error.message}`);
        }

        const textContent = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Extract JSON from potential markdown code blocks
        let cleanJson = textContent.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        }

        if (cleanJson) {
          const parsed = JSON.parse(cleanJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`[Gemini] Got ${parsed.length} ${type} for ${destination}`);
            return parsed;
          }
        }
      } catch (e: any) {
        console.warn(`[Gemini] Failed to get ${type}: ${e.message}. Falling back to Google Places...`);
      }
    }

    // Fallback to Google Places API
    if (placesKey) {
      try {
        const query = type === 'restaurants'
          ? `best restaurants in ${destination}`
          : `top tourist attractions in ${destination}`;

        console.log(`[Places] Fetching ${type} for ${destination}...`);
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${placesKey}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const places = data.results.slice(0, 15).map((p: any) => ({
            name: p.name,
            address: p.formatted_address || p.vicinity,
            cuisine: type === 'restaurants' ? (p.types?.includes('cafe') ? 'Cafe' : 'Restaurant') : undefined
          }));
          console.log(`[Places] Got ${places.length} ${type} for ${destination}`);
          return places;
        }
      } catch (e: any) {
        console.error(`[Places] Error fetching ${type}:`, e.message);
      }
    }

    console.warn(`[Grounding] No API available for fetching ${type}. Returning empty.`);
    return [];
  }

  // Verify specific places using Gemini AI for real names
  private async groundItineraryWithRealPlaces(plan: any, currency: string): Promise<any> {
    console.log(`[Grounding] Starting Gemini-based verification for ${plan.destination}...`);

    // Get real places from Gemini
    const [realRestaurants, realAttractions] = await Promise.all([
      this.getRealPlacesFromGemini(plan.destination, 'restaurants'),
      this.getRealPlacesFromGemini(plan.destination, 'attractions')
    ]);

    // Base rates for cost estimation
    const baseRates: Record<string, number> = {
      'INR': 500, 'USD': 20, 'EUR': 18, 'GBP': 15, 'AUD': 25, 'CAD': 25, 'JPY': 2000, 'CNY': 100
    };
    const base = baseRates[currency] || 20;

    // Track used places to avoid duplicates
    const usedRestaurants = new Set<string>();
    const usedAttractions = new Set<string>();
    let restaurantIndex = 0;
    let attractionIndex = 0;

    // Generic terms that should trigger replacement
    const genericRestaurantTerms = ["top rated", "local restaurant", "best cafe", "famous", "popular", "restaurant", "cafe", "lunch", "dinner", "breakfast", "eatery"];
    const genericAttractionTerms = ["tourist spot", "famous place", "landmark", "attraction", "sightseeing", "top place", "city park", "local market"];

    for (const day of plan.itinerary) {
      if (!day.activities) continue;

      for (const activity of day.activities) {
        try {
          const placeName = (activity.placeName || '').toLowerCase();
          const activityType = (activity.type || '').toLowerCase();

          // Check if this is a restaurant/food activity
          const isFood = activityType === 'restaurant' || activityType === 'cafe' || activityType === 'bar' ||
            placeName.includes('lunch') || placeName.includes('dinner') || placeName.includes('breakfast');

          // Check if this is a generic name that needs replacement
          const isGenericRestaurant = isFood && genericRestaurantTerms.some(term => placeName.includes(term));
          const isGenericAttraction = !isFood && genericAttractionTerms.some(term => placeName.includes(term));

          if (isGenericRestaurant && realRestaurants.length > 0) {
            // Pick next real restaurant
            const real = realRestaurants[restaurantIndex % realRestaurants.length];
            if (real && !usedRestaurants.has(real.name)) {
              console.log(`[Grounding] Replacing "${activity.placeName}" with real restaurant "${real.name}"`);
              activity.placeName = real.name;
              activity.address = real.address || `${plan.destination}`;
              if (real.cuisine) activity.cuisine = real.cuisine;
              usedRestaurants.add(real.name);
              restaurantIndex++;

              // Estimate cost
              activity.cost = Math.round(base * (1 + Math.random() * 0.5));
              activity.entryFee = activity.cost;
            }
          } else if (isGenericAttraction && realAttractions.length > 0) {
            // Pick next real attraction
            const real = realAttractions[attractionIndex % realAttractions.length];
            if (real && !usedAttractions.has(real.name)) {
              console.log(`[Grounding] Replacing "${activity.placeName}" with real attraction "${real.name}"`);
              activity.placeName = real.name;
              activity.address = real.address || `${plan.destination}`;
              usedAttractions.add(real.name);
              attractionIndex++;
            }
          } else if (isFood && !isGenericRestaurant && realRestaurants.length > 0) {
            // Even for non-generic food entries, verify it's a real place
            const matchingReal = realRestaurants.find(r =>
              r.name.toLowerCase().includes(placeName.split(' ')[0]) ||
              placeName.includes(r.name.toLowerCase().split(' ')[0])
            );
            if (!matchingReal && !usedRestaurants.has(activity.placeName)) {
              // If we can't verify it, replace with a real one
              const real = realRestaurants[restaurantIndex % realRestaurants.length];
              if (real && !usedRestaurants.has(real.name)) {
                console.log(`[Grounding] Couldn't verify "${activity.placeName}", replacing with "${real.name}"`);
                activity.placeName = real.name;
                activity.address = real.address || `${plan.destination}`;
                usedRestaurants.add(real.name);
                restaurantIndex++;
              }
            }
          }

          // Set cost for food items if not set
          if (isFood && !activity.cost) {
            activity.cost = Math.round(base * (0.8 + Math.random() * 0.4));
            activity.entryFee = activity.cost;
          }
        } catch (e) {
          console.error(`[Grounding] Error processing ${activity.placeName}:`, e);
        }
      }
    }

    // Recalculate totals based on new costs
    let newFoodCost = 0;
    let newActivitiesCost = 0;

    for (const day of plan.itinerary) {
      for (const act of day.activities) {
        const cost = act.entryFee || act.cost || 0;
        const isFood = (act.type || '').toLowerCase() === 'restaurant' ||
          (act.type || '').toLowerCase() === 'cafe' ||
          (act.placeName || '').toLowerCase().includes('lunch') ||
          (act.placeName || '').toLowerCase().includes('dinner');
        if (isFood) {
          newFoodCost += (cost * (plan.persons || 1));
        } else {
          newActivitiesCost += (cost * (plan.persons || 1));
        }
      }
    }

    plan.costBreakdown = plan.costBreakdown || {};
    plan.costBreakdown.food = newFoodCost;
    plan.costBreakdown.activities = newActivitiesCost;
    plan.costBreakdown.total = (plan.costBreakdown.accommodation || 0) + (plan.costBreakdown.transport || 0) + newFoodCost + newActivitiesCost + (plan.costBreakdown.misc || 0);
    plan.totalEstimatedCost = plan.costBreakdown.total;

    // Add visible debug note
    const restaurantsUsed = usedRestaurants.size;
    const attractionsUsed = usedAttractions.size;
    plan.notes = (plan.notes || '') + ` | Grounded via Gemini (${restaurantsUsed} restaurants, ${attractionsUsed} attractions)`;

    console.log(`[Grounding] Complete: ${restaurantsUsed} restaurants, ${attractionsUsed} attractions replaced`);
    return plan;
  }
}
