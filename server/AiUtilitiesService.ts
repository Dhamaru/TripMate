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
          const convertedAmount = rate; // API returns total amount if amount param is passed
          // If amount param is passed, j.rates[to] is the total converted amount.
          // Wait, frankfurter returns { amount: 100, base: 'USD', date: '...', rates: { EUR: 85.5 } }
          // Actually if amount is passed, rates contains the converted total.
          // Let's verify standard behavior: ?amount=1&from=USD&to=EUR -> rates: { EUR: 0.95 }
          // ?amount=100&from=USD&to=EUR -> rates: { EUR: 95.0 }

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

  async planTrip(input: { destination: string; days: number; persons: number; budget?: number; typeOfTrip: string; travelMedium: string }): Promise<
    | { destination: string; days: number; persons: number; totalEstimatedCost: number; currency: 'INR'; costBreakdown: { accommodationINR: number; foodINR: number; transportINR: number; activitiesINR: number; miscINR: number; totalINR: number }; itinerary: Array<{ day: number; activities: Array<{ time: string; placeName: string; address: string; type: 'sightseeing' | 'restaurant' | 'cafe' | 'market' | 'museum' | 'temple' | 'park'; entryFeeINR: number; duration_minutes: number; localFoodRecommendations: string[]; routeFromPrevious: { mode: string; distance_km: number; travel_time_minutes: number; from: string; to: string } }> }>; packingList: string[]; safetyTips: string[]; notes: string }
    | { error: 'invalid_model_output' | 'providers_unavailable'; message: string }
  > {
    const destination = sanitize(input.destination, 128);
    const days = Number.isFinite(input.days) ? Math.max(1, Math.floor(input.days)) : 1;
    const persons = Number.isFinite(input.persons) ? Math.max(1, Math.floor(input.persons)) : 1;
    const budget = typeof input.budget === 'number' && Number.isFinite(input.budget) ? Math.max(0, input.budget) : undefined;
    const typeOfTrip = sanitize(input.typeOfTrip, 64);
    const travelMedium = sanitize(input.travelMedium, 64);
    const key = `planTrip:${destination}:${days}:${persons}:${budget ?? 'x'}:${typeOfTrip}:${travelMedium}`;
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
  "currency": "INR",
  "costBreakdown": { "accommodationINR": number, "foodINR": number, "transportINR": number, "activitiesINR": number, "miscINR": number, "totalINR": number },
  "itinerary": [ { "day": number, "activities": [ { "time": string, "placeName": string, "address": string, "type": "sightseeing" | "restaurant" | "cafe" | "market" | "museum" | "temple" | "park", "entryFeeINR": number, "duration_minutes": number, "localFoodRecommendations": [string], "routeFromPrevious": { "mode": string, "distance_km": number, "travel_time_minutes": number, "from": string, "to": string } } ] } ],
  "packingList": [string],
  "safetyTips": [string],
  "notes": string
}`;
      const instructions = [
        `Return STRICT JSON only. No prose, no markdown, no backticks.`,
        `Follow this EXACT schema: ${schema}.`,
        `Ensure "currency" is exactly "INR".`,
        `The itinerary must match the trip type (${typeOfTrip}) and travel medium (${travelMedium}).`,
        budget !== undefined
          ? `Distribute the budget 8${budget}A across activities reasonably for ${persons} persons over ${days} days.`
          : `Estimate reasonable costs per activity and total for ${persons} persons over ${days} days.`,
        `Always return exactly one JSON object and nothing else.`,
      ].join(' ');

      const strictInstructions = [
        `Return STRICT JSON only. No prose, no markdown, no backticks.`,
        `Follow this EXACT schema: ${schema}.`,
        `Ensure "currency" is exactly "INR".`,
        `Use real, verified place names and exact restaurants/cafes in ${destination}. No placeholders.`,
        `CRITICAL: Ensure strictly unique activities for every single day. Do not repeat activities across days.`,
        `CRITICAL: Ensure "day" fields are numbered 1, 2, 3... strictly integers. Do not use strings or NaN.`,
        `Include route details: distance_km, travel_time_minutes, and transport mode.`,
        `Include entry fees (INR) and duration_minutes for each activity.`,
        `The itinerary must match the trip type (${typeOfTrip}) and travel medium (${travelMedium}).`,
        budget !== undefined
          ? `Distribute total budget \u20B9${budget} for ${persons} persons over ${days} days; ensure costBreakdown sums correctly and uses realistic local pricing.`
          : `Estimate reasonable costs using realistic local pricing in INR; ensure costBreakdown total matches totalEstimatedCost for ${persons} persons over ${days} days.`,
        `If destination is Vadodara (Baroda), include specific known places like Laxmi Vilas Palace, Sayaji Baug, Ratri Bazaar, Baroda Museum, EME Temple.`,
        `Always return exactly one JSON object and nothing else.`,
      ].join(' ');

      const zTripPlan = z.object({
        destination: z.string(),
        days: z.number(),
        persons: z.number(),
        totalEstimatedCost: z.number(),
        currency: z.literal('INR'),
        costBreakdown: z.object({
          accommodationINR: z.number(),
          foodINR: z.number(),
          transportINR: z.number(),
          activitiesINR: z.number(),
          miscINR: z.number(),
          totalINR: z.number(),
        }),
        itinerary: z.array(z.object({
          day: z.number(),
          activities: z.array(z.object({
            time: z.string(),
            placeName: z.string(),
            address: z.string(),
            type: z.enum(["sightseeing", "restaurant", "cafe", "market", "museum", "temple", "park"]),
            entryFeeINR: z.number(),
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
        const json = this.parseJson(content);
        const parsed = zTripPlan.safeParse(json);
        if (!parsed.success) {
          const raw = String(content || '').slice(0, 500);
          return { error: 'invalid_model_output', message: raw } as any;
        }
        console.log(JSON.stringify({ ts, tool: 'planTrip', api_used: 'openai', destination: destination.slice(0, 16) + '…' }));
        return this.setCached(key, parsed.data);
      } catch (e1: any) {
        const gmKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
        try {
          if (!gmKey) throw new Error('no_gemini_key');
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(gmKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: 'user', parts: [{
                  text: [
                    `Return STRICT JSON only. No prose, no markdown, no backticks.`,
                    `Follow this EXACT schema: ${schema}. Ensure "currency" is exactly "INR".`,
                    `CRITICAL: Itinerary must strictly different for each day. Do NOT repeat activities for ${days} days.`,
                    `Ensure "day" fields are numbered 1, 2, 3...`,
                    budget !== undefined
                      ? `Distribute total budget \u20B9${budget} for ${persons} persons over ${days} days; sum correctly.`
                      : `Estimate reasonable costs with a correct total for ${persons} persons over ${days} days.`,
                    `Always return exactly one JSON object and nothing else.`,
                    `Destination: ${destination}. Days: ${days}. Persons: ${persons}. Type: ${typeOfTrip}. Medium: ${travelMedium}.`
                  ].join(' ')
                }]
              }]
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          const j = await r.json();
          const parts = j?.candidates?.[0]?.content?.parts || [];
          const raw = parts.map((p: any) => String(p.text || '')).filter(Boolean).join('\n');
          const json = this.parseJson(raw || '{}');
          const parsed = zTripPlan.safeParse(json);
          if (!parsed.success) {
            const rawOut = String(raw || '').slice(0, 500);
            return { error: 'invalid_model_output', message: rawOut } as any;
          }
          console.log(JSON.stringify({ ts, tool: 'planTrip', api_used: 'gemini', destination: destination.slice(0, 16) + '…' }));
          return this.setCached(key, parsed.data);
        } catch (e2: any) {
          console.error(JSON.stringify({ ts, tool: 'planTrip', openai_error: String(e1?.message || e1), gemini_error: String(e2?.message || e2) }));
          // Fallback to rule-based generation
          console.log('Falling back to rule-based trip generation');
          const fallback = this.generateFallbackTrip({ destination, days, persons, budget, typeOfTrip, travelMedium });
          return this.setCached(key, fallback);
        }
      }
    })();

    this.inflight.set(key, task);
    try {
      return await task;
    } finally {
      this.inflight.delete(key);
    }
  }

  private validateTripPlan(obj: any): { valid: boolean; value?: { destination: string; days: number; persons: number; totalEstimatedCost: number; currency: 'INR'; itinerary: Array<{ day: number; activities: Array<{ time: string; title: string; description: string; estimatedCost: number; location: string }> }>; packingSuggestions: string[]; notes: string } } {
    if (!obj || typeof obj !== 'object') return { valid: false };
    const isNum = (x: any) => typeof x === 'number' && Number.isFinite(x);
    const isStr = (x: any) => typeof x === 'string';
    if (!isStr(obj.destination) || !isNum(obj.days) || !isNum(obj.persons) || !isNum(obj.totalEstimatedCost) || obj.currency !== 'INR') return { valid: false };
    const itin = obj.itinerary;
    if (!Array.isArray(itin) || itin.length < 1) return { valid: false };
    for (const day of itin) {
      if (!isNum(day.day) || !Array.isArray(day.activities)) return { valid: false };
      for (const act of day.activities) {
        if (!isStr(act.time) || !isStr(act.title) || !isStr(act.description) || !isNum(act.estimatedCost) || !isStr(act.location)) return { valid: false };
      }
    }
    const packingSuggestions = Array.isArray(obj.packingSuggestions) ? obj.packingSuggestions.map((s: any) => String(s)) : [];
    if (packingSuggestions.length === 0) return { valid: false };
    const notes = isStr(obj.notes) ? String(obj.notes) : '';
    const value = {
      destination: String(obj.destination),
      days: Number(obj.days),
      persons: Number(obj.persons),
      totalEstimatedCost: Number(obj.totalEstimatedCost),
      currency: 'INR' as const,
      itinerary: itin.map((d: any) => ({ day: Number(d.day), activities: d.activities.map((a: any) => ({ time: String(a.time), title: String(a.title), description: String(a.description), estimatedCost: Number(a.estimatedCost), location: String(a.location) })) })),
      packingSuggestions,
      notes,
    };
    return { valid: true, value };
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
    const loc = sanitize(location, 128);
    const key = `toolWeather:${loc}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    if (!this.openai) throw new Error('ai_disabled');
    const client = this.openai!;
    const prompt = `Return strict JSON only. No prose, no markdown. The JSON must contain at least: { "current": { "temperature": number, "conditions": string, "humidity": number, "wind_kph": number, "advice": string }, "forecast": [ { "date": "YYYY-MM-DD", "high": number, "low": number, "conditions": string } x 7 ] }. Location: ${loc}.`;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: "You are a weather assistant. Return strict JSON only." },
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify({ location: loc }) },
      ],
    });
    const content = completion.choices?.[0]?.message?.content?.trim() || "{}";
    const json = this.parseJson(content);
    const validated = this.validateWeatherTool(json);
    if (!validated.valid || !validated.value) {
      return { error: 'invalid_model_output', message: 'Model output was not valid JSON' };
    }
    return this.setCached(key, validated.value);
  }

  private validateWeatherTool(obj: any): { valid: boolean; value?: { current: { temperature: number; conditions: string; humidity: number; wind_kph: number; advice: string }; forecast: Array<{ date: string; high: number; low: number; conditions: string }> } } {
    if (!obj || typeof obj !== 'object') return { valid: false };
    const cur = obj.current;
    const fc = obj.forecast;
    if (!cur || typeof cur !== 'object') return { valid: false };
    const isNum = (x: any) => typeof x === 'number' && Number.isFinite(x);
    const isStr = (x: any) => typeof x === 'string' && x.length > 0;
    if (!isNum(cur.temperature) || !isStr(cur.conditions) || !isNum(cur.humidity) || !isNum(cur.wind_kph) || !isStr(cur.advice)) return { valid: false };
    if (!Array.isArray(fc) || fc.length < 7) return { valid: false };
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const out: Array<{ date: string; high: number; low: number; conditions: string }> = [];
    for (let i = 0; i < 7; i++) {
      const it = fc[i];
      if (!it || !dateRe.test(String(it.date)) || !isNum(it.high) || !isNum(it.low) || !isStr(it.conditions)) return { valid: false };
      out.push({ date: String(it.date), high: Number(it.high), low: Number(it.low), conditions: String(it.conditions) });
    }
    const value = { current: { temperature: Number(cur.temperature), conditions: String(cur.conditions), humidity: Number(cur.humidity), wind_kph: Number(cur.wind_kph), advice: String(cur.advice) }, forecast: out };
    return { valid: true, value };
  }

  private generateFallbackTrip(input: { destination: string; days: number; persons: number; budget?: number; typeOfTrip: string; travelMedium: string }): any {
    const { destination, days, persons, budget, typeOfTrip, travelMedium } = input;
    const safeBudget = budget || 5000 * days * persons;

    // Basic cost distribution
    const accommodation = Math.round(safeBudget * 0.4);
    const food = Math.round(safeBudget * 0.25);
    const transport = Math.round(safeBudget * 0.15);
    const activities = Math.round(safeBudget * 0.15);
    const misc = safeBudget - (accommodation + food + transport + activities);

    const itinerary = [];
    const activitiesList = ["City Center", "Museum", "Park", "Market", "Historical Site", "Lake/River", "Temple", "Shopping Mall"];
    for (let i = 1; i <= days; i++) {
      const morn = activitiesList[(i * 2) % activitiesList.length];
      const aft = activitiesList[(i * 2 + 1) % activitiesList.length];
      itinerary.push({
        day: i,
        activities: [
          {
            time: "09:00 AM",
            placeName: `${destination} ${morn}`,
            address: `${morn} Area`,
            type: "sightseeing",
            entryFeeINR: 100,
            duration_minutes: 120,
            localFoodRecommendations: ["Local Breakfast"],
            routeFromPrevious: { mode: travelMedium, distance_km: 5, travel_time_minutes: 15, from: "Hotel", to: morn }
          },
          {
            time: "01:00 PM",
            placeName: `Top Rated Restaurant`,
            address: "Downtown",
            type: "restaurant",
            entryFeeINR: 0,
            duration_minutes: 60,
            localFoodRecommendations: ["Thali"],
            routeFromPrevious: { mode: "walk", distance_km: 1, travel_time_minutes: 10, from: morn, to: "Restaurant" }
          },
          {
            time: "03:00 PM",
            placeName: `${destination} ${aft}`,
            address: `${aft} Road`,
            type: "park",
            entryFeeINR: 50,
            duration_minutes: 120,
            localFoodRecommendations: [],
            routeFromPrevious: { mode: "taxi", distance_km: 3, travel_time_minutes: 15, from: "Restaurant", to: aft }
          }
        ]
      });
    }

    return {
      destination,
      days,
      persons,
      totalEstimatedCost: safeBudget,
      currency: 'INR',
      costBreakdown: {
        accommodationINR: accommodation,
        foodINR: food,
        transportINR: transport,
        activitiesINR: activities,
        miscINR: misc,
        totalINR: safeBudget
      },
      itinerary,
      packingList: ["Clothes", "Toiletries", "Chargers", "Travel Documents", "First Aid Kit"],
      safetyTips: ["Keep valuables safe", "Stay hydrated", "Keep emergency numbers handy"],
      notes: "Fallback itinerary generated. Please verify details."
    };
  }
}
