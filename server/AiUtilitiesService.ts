import { config } from "./config";
import OpenAI from "openai";
import { z } from "zod";
import { MultiAgentOrchestrator } from "./services/MultiAgentOrchestrator";
import { FeasibilityModeler } from "./services/FeasibilityModeler";
import { PlanValidator } from "./services/PlanValidator";

type CacheEntry<T> = { data: T; expiresAt: number };

// MyMemory's anonymous quota is 100 requests/day; a registered `de` email
// param raises that to 10,000 words/day at no cost. Only used as the last
// fallback (GPT-4o-mini and NVIDIA are tried first) but real usage was
// hitting the anonymous ceiling under light load.
const MYMEMORY_CONTACT_EMAIL = "kasivasi2005@gmail.com";

function sanitize(input: string, max = 2000): string {
  const trimmed = (input || "").toString().trim();
  const safe = trimmed.replace(/[\u0000-\u001F\u007F]/g, "");
  return safe.slice(0, max);
}

// Mirrors the language list in client/src/components/LanguageTranslator.tsx —
// small instruct models translate far more reliably from a spelled-out
// language name than a bare ISO code.
const LANGUAGE_NAMES: Record<string, string> = {
  auto: "the detected language",
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  gu: "Gujarati",
  mr: "Marathi",
  pa: "Punjabi",
  bn: "Bengali",
  ur: "Urdu",
  fr: "French",
  de: "German",
  es: "Spanish",
};

export class AiUtilitiesService {
  private openai: OpenAI | null;
  private cache = new Map<string, CacheEntry<any>>();
  private ttlMs = 5 * 60 * 1000;
  private inflight = new Map<string, Promise<any>>();

  constructor(apiKey?: string) {
    const key = apiKey || config.OPENAI_API_KEY;
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  // Fallback map for major cities to ensure transit calculation never fails
  private readonly CITIES_COORD_MAP: Record<string, { lat: number; lon: number }> = {
    delhi: { lat: 28.6139, lon: 77.209 },
    "new delhi": { lat: 28.6139, lon: 77.209 },
    mumbai: { lat: 19.076, lon: 72.8777 },
    bangalore: { lat: 12.9716, lon: 77.5946 },
    hyderabad: { lat: 17.385, lon: 78.4867 },
    chennai: { lat: 13.0827, lon: 80.2707 },
    kolkata: { lat: 22.5726, lon: 88.3639 },
    jaipur: { lat: 26.9124, lon: 75.7873 },
    lucknow: { lat: 26.8467, lon: 80.9462 },
    agra: { lat: 27.1767, lon: 78.0081 },
    goa: { lat: 15.2993, lon: 74.124 },
    pune: { lat: 18.5204, lon: 73.8567 },
    bengaluru: { lat: 12.9716, lon: 77.5946 },
    ahmedabad: { lat: 23.0225, lon: 72.5714 },
    london: { lat: 51.5074, lon: -0.1278 },
    "new york": { lat: 40.7128, lon: -74.006 },
    paris: { lat: 48.8566, lon: 2.3522 },
    tokyo: { lat: 35.6762, lon: 139.6503 },
    singapore: { lat: 1.3521, lon: 103.8198 },
    dubai: { lat: 25.2048, lon: 55.2708 },
    bangkok: { lat: 13.7563, lon: 100.5018 },
  };

  private async generateWithGemini(prompt: string, systemPrompt?: string): Promise<string> {
    const geminiKey = config.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("gemini_disabled");

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Gemini status ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      if (json.error) throw new Error(`Gemini API Error: ${json.error.message}`);

      let text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
      // Clean markdown if present
      if (text.startsWith("```")) {
        text = text
          .replace(/```json?\n?/g, "")
          .replace(/```/g, "")
          .trim();
      }
      return text;
    } catch (error) {
      console.error("[AiUtilities] Gemini Error:", error);
      throw error;
    }
  }

  // NVIDIA's OpenAI-compatible chat endpoint — the same provider the main
  // itinerary-generation pipeline (agentLoop.ts) uses as its primary model,
  // but this service's other text-generation methods only ever fell back to
  // Gemini then OpenAI. When both of those are quota-exhausted, those
  // methods have no working provider left even though NVIDIA is reachable.
  private async generateWithNvidia(
    prompt: string,
    systemPrompt?: string,
    temperature = 0.3,
    model = "meta/llama-3.1-8b-instruct",
  ): Promise<string> {
    const nvidiaKey = config.NVIDIA_API_KEY;
    if (!nvidiaKey) throw new Error("nvidia_disabled");

    const messages = systemPrompt
      ? [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ]
      : [{ role: "user", content: prompt }];

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${nvidiaKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`NVIDIA status ${response.status}: ${await response.text()}`);
    }

    const json = await response.json();
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("NVIDIA returned an empty response");
    return text;
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

  /**
   * Calculates the Haversine distance between two points in kilometers.
   */
  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Resolves coordinates for a place name using cache and searchPlaces.
   */
  /* resolveCoordinates removed from here, integrated below */

  /**
   * Enforces deterministic constraints on a trip plan (distances, transit times, buffers).
   */
  private async enforceTransitConstraints(plan: any): Promise<any> {
    const destination = plan.destination;
    const avgSpeedKph = 30; // Average city traffic speed
    const minBufferMinutes = 30;

    for (const day of plan.itinerary) {
      if (!day.activities || day.activities.length === 0) continue;

      // Track major attractions for fatigue check
      let majorAttractionCount = 0;

      for (let i = 0; i < day.activities.length; i++) {
        const activity = day.activities[i];

        // Fatigue check: Flag major attractions
        if (["sightseeing", "museum", "temple"].includes(activity.type)) {
          majorAttractionCount++;
        }

        // Resolve coordinates if missing (some grounded places might not have them)
        if (activity.lat === undefined || activity.lon === undefined) {
          const coords = await this.resolveCoordinates(
            activity.placeName || activity.title,
            destination,
          );
          if (coords) {
            activity.lat = coords.lat;
            activity.lon = coords.lon;
          }
        }

        // Calculate route from previous
        if (i > 0) {
          const prev = day.activities[i - 1];
          if (
            prev.lat !== undefined &&
            prev.lon !== undefined &&
            activity.lat !== undefined &&
            activity.lon !== undefined
          ) {
            const distance = this.calculateHaversineDistance(
              prev.lat,
              prev.lon,
              activity.lat,
              activity.lon,
            );
            const travelTime = Math.round((distance / avgSpeedKph) * 60) + 15; // +15 min overhead

            activity.routeFromPrevious = {
              mode: distance < 0.8 ? "walk" : "taxi",
              distance_km: parseFloat(distance.toFixed(2)),
              travel_time_minutes: travelTime,
              from: prev.title || prev.placeName,
              to: activity.title || activity.placeName,
            };

            // Explainability note
            if (travelTime > 60) {
              plan.notes =
                (plan.notes || "") + ` | Long travel alert on Day ${day.day} to ${activity.title}`;
            }
          }
        } else {
          // First activity of the day (start from hotel/center)
          activity.routeFromPrevious = activity.routeFromPrevious || {
            mode: "taxi",
            distance_km: 5,
            travel_time_minutes: 20,
            from: "Hotel",
            to: activity.title || activity.placeName,
          };
        }

        // Add mandatory buffer to duration for realistic planning
        activity.duration_minutes = (activity.duration_minutes || 60) + minBufferMinutes;
      }

      // Add fatigue warning if too many major spots
      if (majorAttractionCount > 3) {
        plan.notes =
          (plan.notes || "") +
          ` | Fatigue alert: Day ${day.day} is very busy. Consider local transport for recovery.`;
      }
    }

    return plan;
  }

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<{
    translatedText: string;
    pronunciation?: string;
    source?: "openai" | "google" | "nvidia" | "mymemory";
  }> {
    const t = sanitize(text);
    const from = sanitize(sourceLang, 32);
    const to = sanitize(targetLang, 32);
    const key = `translate:${from}:${to}:${t}`;
    const cached = this.getCached<{
      translatedText: string;
      pronunciation?: string;
      source?: "openai" | "google" | "nvidia" | "mymemory";
    }>(key);
    if (cached) return cached;

    try {
      if (!this.openai) throw new Error("ai_disabled");
      const client = this.openai!;
      // Pin the exact JSON shape explicitly (key name, no prose) and force
      // response_format: json_object — without both, gpt-4o-mini sometimes
      // returns the translation under a different key ("translation",
      // "text") or wrapped in prose, which silently produced an empty
      // translatedText below.
      const prompt = `Translate the following text from ${LANGUAGE_NAMES[from] || from} to ${LANGUAGE_NAMES[to] || to}. Write the translation in the native script of ${LANGUAGE_NAMES[to] || to} (not a Romanized transliteration). Respond with ONLY a JSON object of the exact shape {"translatedText": string, "pronunciation": string | null} — no other keys, no prose.`;
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: t },
        ],
      });
      const content = completion.choices?.[0]?.message?.content?.trim() || "{}";
      const json = this.parseJson(content);
      // Accept a few key-name variants defensively, in case the model still
      // deviates from the requested shape despite response_format.
      const translatedText = String(json.translatedText || json.translation || json.text || "");
      // A malformed/differently-shaped JSON reply (wrong key name, empty
      // object) previously became a "successful" result with an empty
      // translatedText — no exception was thrown, so the NVIDIA/MyMemory
      // fallbacks below never ran. Treat an empty result as a real failure.
      if (!translatedText) throw new Error("empty_gpt_translation");
      const result = {
        translatedText,
        pronunciation: json.pronunciation ? String(json.pronunciation) : undefined,
        source: "openai" as const,
      };
      return this.setCached(key, result);
    } catch {
      // Fallback 1: Google Cloud Translation — a dedicated NMT engine, not
      // an improvising LLM, so it doesn't have the small-instruct-model
      // failure mode below (confusing "who"/"what", swapping "I"/"you").
      // Reuses the same GOOGLE_API_KEY already provisioned for Places —
      // Cloud Translation just needs to be enabled + allowlisted in that
      // key's API restrictions on the same GCP project.
      try {
        const googleKey = config.GOOGLE_API_KEY;
        if (!googleKey) throw new Error("google_translate_disabled");
        const res = await fetch(
          `https://translation.googleapis.com/language/translate/v2?key=${googleKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              q: t,
              source: from === "auto" ? undefined : from,
              target: to,
              format: "text",
            }),
          },
        );
        if (res.ok) {
          const json = await res.json();
          const translated = String(json?.data?.translations?.[0]?.translatedText || "");
          if (translated) {
            const result = {
              translatedText: translated,
              pronunciation: undefined,
              source: "google" as const,
            };
            return this.setCached(key, result);
          }
        }
      } catch {
        /* fall through to NVIDIA */
      }

      // Fallback 2: NVIDIA (reliable LLM translation). MyMemory's free
      // crowd-sourced translation memory can return confidently wrong
      // results even for common phrases — e.g. "Thank you" -> a sentence
      // about reciting a poem, with match:1 (max confidence). NVIDIA gives
      // a real translation instead of a lookup, so try it before falling
      // all the way to MyMemory.
      try {
        // Small instruct models are unreliable with bare ISO codes (observed:
        // asking for "te" produced Hindi written in Roman transliteration,
        // not Telugu script at all) — spell out the language name and
        // explicitly require native script to stop it from transliterating.
        const langName = (code: string) => LANGUAGE_NAMES[code] || code;
        // A small generic instruct model's single most common failure mode
        // on real user reports was swapping the grammatical subject —
        // "who are you?" translated to mean "who am I?", "what is your
        // name?" to mean "what are you?". Forcing the model to name the
        // subject BEFORE translating (and parsing only the line after it)
        // makes it externalize that reasoning step instead of silently
        // pattern-matching straight to an answer — a known mitigation for
        // this exact error class in small LLMs. temperature 0 (not the
        // 0.3 default used elsewhere in this file) for deterministic,
        // literal output rather than creative variance.
        const prompt = `You are a precise translator. Follow these steps internally, then output in exactly this two-line format:
SUBJECT: <who or what the sentence is about — the speaker ("I"/"we"), the person addressed ("you"), or a third thing ("this"/"it"/"he"/"she")>
TRANSLATION: <the translation only>

Never swap "I" and "you" or "this" and "you" between the SUBJECT line and the TRANSLATION.

Examples:
Source (English): "Who are you?"
SUBJECT: you (the person being addressed)
TRANSLATION: आप कौन हैं?

Source (English): "What is your name?"
SUBJECT: you (the person being addressed)
TRANSLATION: आपका नाम क्या है?

Source (English): "This is my bag."
SUBJECT: this (a third thing)
TRANSLATION: यह मेरा बैग है।

Now translate the following text from ${langName(from)} to ${langName(to)}, in the native script of ${langName(to)} (not a Romanized transliteration).`;
        // Tried mistralai/mistral-large-2-instruct here as a stronger
        // model — it's not available on this NIM API key's catalog, so
        // every call hard-failed and silently fell through to MyMemory,
        // which is worse (confirmed live: "Thank you" -> a phrase meaning
        // "I am a Tamil girl", the exact failure mode already documented
        // below). Reverted to the known-working default model; the
        // subject-identification prompt and temperature 0 above are kept
        // since they're still real improvements even though they don't
        // fully fix the WH-word confusion on this smaller model.
        const nvidiaRaw = await this.generateWithNvidia(t, prompt, 0);
        const translationLine = nvidiaRaw.split("\n").find((l) => /^TRANSLATION:/i.test(l.trim()));
        const nvidiaText = translationLine
          ? translationLine.replace(/^TRANSLATION:/i, "").trim()
          : nvidiaRaw.trim();
        if (nvidiaText) {
          const result = {
            translatedText: nvidiaText,
            pronunciation: undefined,
            source: "nvidia" as const,
          };
          return this.setCached(key, result);
        }
      } catch {
        /* fall through to MyMemory */
      }

      // Fallback 3: MyMemory free translation API (no key required). The
      // `de` param registers requests against a real email, raising the
      // rate ceiling from 100 req/day (anonymous) to 10,000 words/day —
      // without it, real usage burns through the anonymous quota quickly
      // and MyMemory starts returning its error text as if it were a
      // translation.
      try {
        const langPair = `${from === "auto" ? "en" : from}|${to}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${encodeURIComponent(langPair)}&de=${encodeURIComponent(MYMEMORY_CONTACT_EMAIL)}`;
        const r = await fetch(url, { headers: { "User-Agent": "TripMate/2.0.0" } });
        if (r.ok) {
          const json = await r.json();
          // Previously fell back to `t` (the original input) when MyMemory
          // returned an empty translatedText — that made a blank/quota
          // response look like a real, successful translation of the input
          // back to itself, indistinguishable from success. Fall through to
          // the last-resort error instead.
          const translated = String(json?.responseData?.translatedText || "");
          if (translated) {
            const result = {
              translatedText: translated,
              pronunciation: undefined,
              source: "mymemory" as const,
            };
            return this.setCached(key, result);
          }
        }
      } catch {
        /* fall through */
      }
      // All three backends failed — surface this as a real error instead of
      // silently echoing the user's own input back as if it were a
      // translation (previously done here, with only a small italic
      // "Translation unavailable" pronunciation note as the only signal).
      throw new Error("Translation unavailable — all providers failed");
    }
  }

  async weather(city: string): Promise<{
    current: any;
    forecast: any[];
    recommendations: any[];
    source?: "openweather" | "ai" | "fallback-route" | "fallback";
  }> {
    const c = sanitize(city, 128);
    const key = `weather:${c}`;
    const cached = this.getCached<{ current: any; forecast: any[]; recommendations: any[] }>(key);
    if (cached) return cached;

    // Check if input is already lat,lon coords
    const coordMatch = c.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);

    try {
      const owKey = config.WEATHER_API_KEY || config.OPENWEATHER_API_KEY;
      if (owKey) {
        let coord: { lat: number; lon: number } | null = coordMatch
          ? { lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]) }
          : null;
        let currentJson: any;
        const currentRes = coordMatch
          ? await fetch(
              `https://api.openweathermap.org/data/2.5/weather?lat=${coordMatch[1]}&lon=${coordMatch[2]}&units=metric&appid=${owKey}`,
            )
          : await fetch(
              `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(c)}&units=metric&appid=${owKey}`,
            );
        currentJson = await currentRes.json();
        if (!currentRes.ok) {
          const geoRes = await fetch(
            `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(c)}&limit=1&appid=${owKey}`,
          );
          const geoJson = await geoRes.json();
          if (Array.isArray(geoJson) && geoJson.length > 0) {
            coord = { lat: geoJson[0].lat, lon: geoJson[0].lon };
            const currentByCoordRes = await fetch(
              `https://api.openweathermap.org/data/2.5/weather?lat=${coord.lat}&lon=${coord.lon}&units=metric&appid=${owKey}`,
            );
            currentJson = await currentByCoordRes.json();
            if (!currentByCoordRes.ok)
              throw new Error(String(currentJson?.message || "Weather fetch failed"));
          } else {
            throw new Error(String(currentJson?.message || "Weather fetch failed"));
          }
        } else {
          coord = currentJson?.coord
            ? { lat: currentJson.coord.lat, lon: currentJson.coord.lon }
            : null;
        }

        let forecastJson: any = { list: [] };
        let uvIndex: number | null = null;
        if (coord) {
          const [forecastRes, uvRes] = await Promise.all([
            fetch(
              `https://api.openweathermap.org/data/2.5/forecast?lat=${coord.lat}&lon=${coord.lon}&units=metric&appid=${owKey}`,
            ),
            fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lon}&current=uv_index&timezone=auto`,
            ),
          ]);
          forecastJson = await forecastRes.json();
          if (uvRes.ok) {
            const uvJson = await uvRes.json();
            uvIndex = uvJson.current?.uv_index ?? null;
          }
        }
        const iconMap: Record<string, string> = {
          Clear: "fas fa-sun",
          Clouds: "fas fa-cloud",
          Rain: "fas fa-cloud-rain",
          Drizzle: "fas fa-cloud-rain",
          Thunderstorm: "fas fa-bolt",
          Snow: "fas fa-snowflake",
          Mist: "fas fa-smog",
          Fog: "fas fa-smog",
          Wind: "fas fa-wind",
        };
        const cond = currentJson.weather?.[0]?.main || "Clear";
        const fmtTime = (unix: number | undefined) => {
          if (!unix) return "";
          return new Date(unix * 1000).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
        };
        // OpenWeather's own icon code carries a day/night suffix ("01d" vs
        // "01n") based on the queried location's actual local sunrise/sunset
        // — not the browser's clock or dark-mode setting — so it's the
        // correct signal for "is it night at this destination right now."
        // Previously ignored entirely: a sunny-at-night result always showed
        // the sun icon and the bright daytime gradient.
        const isDay = !String(currentJson.weather?.[0]?.icon || "").endsWith("n");
        const current = {
          temperature: Math.round(currentJson.main?.temp ?? 22),
          condition: cond,
          humidity: Math.round(currentJson.main?.humidity ?? 60),
          windSpeed: Math.round(currentJson.wind?.speed ?? 10),
          wind_kph: Math.round((currentJson.wind?.speed ?? 0) * 3.6),
          icon: cond === "Clear" && !isDay ? "fas fa-moon" : iconMap[cond] || "fas fa-cloud",
          isDay,
          visibility:
            currentJson.visibility != null ? Math.round(currentJson.visibility / 100) / 10 : null,
          sunrise: fmtTime(currentJson.sys?.sunrise),
          sunset: fmtTime(currentJson.sys?.sunset),
          uv_index: uvIndex,
        };
        const byDate: Record<string, { high: number; low: number; main: string }> = {};
        const list = Array.isArray(forecastJson.list) ? forecastJson.list : [];
        for (const item of list) {
          const d = item.dt_txt?.slice(0, 10) || "";
          const tMax = item.main?.temp_max;
          const tMin = item.main?.temp_min;
          const main = item.weather?.[0]?.main || "Clear";
          if (!byDate[d]) {
            byDate[d] = { high: tMax, low: tMin, main } as any;
          } else {
            byDate[d].high = Math.max(byDate[d].high, tMax);
            byDate[d].low = Math.min(byDate[d].low, tMin);
          }
        }
        const now = new Date();
        const forecast: Array<{
          day: string;
          high: number;
          low: number;
          condition: string;
          icon?: string;
        }> = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
            .toISOString()
            .slice(0, 10);
          const label = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + i,
          ).toLocaleDateString("en-US", { weekday: "short" });
          const entry = byDate[d];
          if (entry) {
            forecast.push({
              day: label,
              high: Math.round(entry.high),
              low: Math.round(entry.low),
              condition: entry.main,
              icon: iconMap[entry.main] || "fas fa-cloud",
            });
          } else {
            forecast.push({
              day: label,
              high: current.temperature,
              low: Math.max(0, current.temperature - 5),
              condition: current.condition,
              icon: current.icon,
            });
          }
        }
        const recommendations: string[] = [];
        if (current.temperature >= 30) recommendations.push("Stay hydrated");
        if (current.condition.includes("Rain")) recommendations.push("Carry a raincoat");
        recommendations.push("Use sunscreen during midday");
        const result: {
          current: any;
          forecast: any[];
          recommendations: any[];
          source?: "openweather" | "ai" | "fallback-route" | "fallback";
        } = { current, forecast, recommendations, source: "openweather" };
        return this.setCached(key, result);
      }
      const prompt = `Provide the current weather and 7-day forecast for ${c}. If exact realtime data is unavailable, provide best predictive estimation based on known climate patterns, season, geography, altitude, and historical averages. Always return JSON with: { current: {}, forecast: [7 items], recommendations: [] }.`;
      let content: string;
      if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: c },
          ],
        });
        content = completion.choices?.[0]?.message?.content?.trim() || "{}";
      } else {
        content = await this.generateWithGemini(c, prompt);
      }
      const json = this.parseJson(content);
      const current = json.current || {};
      const forecast = Array.isArray(json.forecast) ? json.forecast.slice(0, 7) : [];
      const recommendations = Array.isArray(json.recommendations) ? json.recommendations : [];
      const result: {
        current: any;
        forecast: any[];
        recommendations: any[];
        source?: "openweather" | "ai" | "fallback-route" | "fallback";
      } = { current, forecast, recommendations, source: "ai" };
      return this.setCached(key, result);
    } catch {
      // Try Open-Meteo (free, no API key) via Nominatim geocoding
      try {
        let lat: string, lon: string;
        if (coordMatch) {
          lat = coordMatch[1];
          lon = coordMatch[2];
        } else {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(c)}&limit=1`,
            { headers: { "User-Agent": "TripMate/2.0.0" } },
          );
          if (!geoRes.ok) throw new Error("geo_fail");
          const geoJson = await geoRes.json();
          if (!Array.isArray(geoJson) || geoJson.length === 0) throw new Error("geo_no_results");
          lat = geoJson[0].lat;
          lon = geoJson[0].lon;
        }
        {
          const meteoRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&forecast_days=7&timezone=auto`,
          );
          if (meteoRes.ok) {
            const meteo = await meteoRes.json();
            const wc = meteo.current_weather?.weathercode ?? 0;
            const condMap = (code: number) => {
              if (code === 0) return "Clear";
              if (code <= 3) return "Clouds";
              if (code <= 49) return "Mist";
              if (code <= 69) return "Rain";
              if (code <= 79) return "Snow";
              if (code <= 99) return "Thunderstorm";
              return "Clouds";
            };
            const iconMap: Record<string, string> = {
              Clear: "fas fa-sun",
              Clouds: "fas fa-cloud",
              Rain: "fas fa-cloud-rain",
              Snow: "fas fa-snowflake",
              Thunderstorm: "fas fa-bolt",
              Mist: "fas fa-smog",
            };
            const cond = condMap(wc);
            const temp = Math.round(meteo.current_weather?.temperature ?? 20);
            // Open-Meteo's current_weather already reports is_day (0/1) at
            // no extra cost — same day/night fix as the primary OWM path.
            const isDay = meteo.current_weather?.is_day !== 0;
            const current = {
              temperature: temp,
              condition: cond,
              humidity: 60,
              windSpeed: Math.round(meteo.current_weather?.windspeed ?? 10),
              icon: cond === "Clear" && !isDay ? "fas fa-moon" : iconMap[cond] || "fas fa-cloud",
              isDay,
            };
            const daily = meteo.daily || {};
            const forecast = Array.from({ length: 7 }, (_, i) => {
              const hi = Math.round(daily.temperature_2m_max?.[i] ?? temp);
              const lo = Math.round(daily.temperature_2m_min?.[i] ?? temp - 5);
              const dc = condMap(daily.weathercode?.[i] ?? 0);
              const now2 = new Date();
              const dayLabel = new Date(
                now2.getFullYear(),
                now2.getMonth(),
                now2.getDate() + i,
              ).toLocaleDateString("en-US", { weekday: "short" });
              return {
                day: dayLabel,
                high: hi,
                low: lo,
                condition: dc,
                icon: iconMap[dc] || "fas fa-cloud",
              };
            });
            const recommendations: string[] =
              temp < 10
                ? ["Dress warmly — cold temperatures expected", "Check road conditions"]
                : temp >= 30
                  ? ["Stay hydrated", "Use sunscreen"]
                  : ["Comfortable weather — light layers recommended"];
            const result = {
              current,
              forecast,
              recommendations,
              source: "fallback-route" as const,
            };
            return this.setCached(key, result);
          }
        }
      } catch {
        /* fall through to generic */
      }

      // Last resort: generic month-based estimate (clearly labelled)
      const now = new Date();
      const month = now.getMonth();
      const baseTemp = [20, 22, 26, 30, 32, 33, 32, 31, 30, 28, 24, 21][month] || 28;
      const current = {
        temperature: Math.round(baseTemp),
        humidity: 60,
        windSpeed: 10,
        condition: baseTemp >= 30 ? "Sunny" : baseTemp >= 25 ? "Partly Cloudy" : "Cloudy",
      };
      const fallbackNow = new Date();
      const forecast = Array.from({ length: 7 }, (_, i) => ({
        day: new Date(
          fallbackNow.getFullYear(),
          fallbackNow.getMonth(),
          fallbackNow.getDate() + i,
        ).toLocaleDateString("en-US", { weekday: "short" }),
        high: Math.round(baseTemp + (i % 3) - 1),
        low: Math.round(baseTemp - 5 + (i % 2)),
        condition:
          i % 4 === 0 ? "Sunny" : i % 4 === 1 ? "Partly Cloudy" : i % 4 === 2 ? "Cloudy" : "Rain",
      }));
      const result = {
        current,
        forecast,
        recommendations: ["Weather data unavailable — shown estimate only"],
        source: "fallback" as const,
      };
      return this.setCached(key, result);
    }
  }

  async currency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    todayIso: string,
  ): Promise<{ rate: number; convertedAmount: number; currencyName: string; disclaimer: string }> {
    const amt = Number.isFinite(amount) ? amount : 0;
    const from = sanitize(fromCurrency, 8).toUpperCase();
    const to = sanitize(toCurrency, 8).toUpperCase();
    const today = sanitize(todayIso, 64);
    const key = `currency:${from}:${to}:${amt}:${today}`;
    const cached = this.getCached<{
      rate: number;
      convertedAmount: number;
      currencyName: string;
      disclaimer: string;
    }>(key);
    if (cached) return cached;

    try {
      if (!this.openai) throw new Error("ai_disabled");
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
          return this.setCached(key, {
            rate: 1,
            convertedAmount: amt,
            currencyName: to,
            disclaimer: "1:1 Conversion",
          });
        }
        // Frankfurter doesn't support all currencies, but supports major ones.
        // It uses EUR as base.
        const r = await fetch(
          `https://api.frankfurter.app/latest?amount=${amt}&from=${from}&to=${to}`,
        );
        if (r.ok) {
          const j = await r.json();
          const rate = j.rates[to];
          return this.setCached(key, {
            rate: rate / amt,
            convertedAmount: rate,
            currencyName: to,
            disclaimer: "Real-time rate from Frankfurter API",
          });
        }
      } catch (e) {
        console.warn("Currency API fallback failed", e);
      }

      // Final Fallback mock rates
      const exchangeRates: Record<string, Record<string, number>> = {
        USD: { EUR: 0.95, GBP: 0.79, JPY: 150, INR: 84, CAD: 1.4, AUD: 1.54, CHF: 0.88, CNY: 7.25 },
        EUR: {
          USD: 1.05,
          GBP: 0.83,
          JPY: 158,
          INR: 89,
          CAD: 1.48,
          AUD: 1.62,
          CHF: 0.93,
          CNY: 7.63,
        },
        GBP: {
          USD: 1.26,
          EUR: 1.2,
          JPY: 190,
          INR: 106,
          CAD: 1.77,
          AUD: 1.94,
          CHF: 1.11,
          CNY: 9.16,
        },
        INR: {
          USD: 0.012,
          EUR: 0.011,
          GBP: 0.009,
          JPY: 1.78,
          CAD: 0.017,
          AUD: 0.018,
          CHF: 0.01,
          CNY: 0.086,
        },
      };
      const rate = exchangeRates[from]?.[to] || 1;
      const convertedAmount = amt * rate;
      const currencyName = to;
      const disclaimer = "Mock exchange rate (Fallback) - DEBUG CHECK";
      const result = { rate, convertedAmount, currencyName, disclaimer };
      return this.setCached(key, result);
    }
  }

  // National emergency dial codes rarely change and are the same nationwide,
  // so a static table is more reliable here than an AI guess or a Places
  // lookup (Places only returns physical hospital/police-station addresses,
  // never the number you'd actually dial). Matched by substring against the
  // country name — "Rome, Italy" and "Italy" both resolve to "italy".
  private static readonly NATIONAL_EMERGENCY_NUMBERS: Record<
    string,
    { police: string; ambulance: string; fire: string; general?: string }
  > = {
    italy: { police: "113", ambulance: "118", fire: "115", general: "112 (EU-wide)" },
    "united kingdom": { police: "999", ambulance: "999", fire: "999", general: "112" },
    uk: { police: "999", ambulance: "999", fire: "999", general: "112" },
    england: { police: "999", ambulance: "999", fire: "999", general: "112" },
    france: { police: "17", ambulance: "15", fire: "18", general: "112" },
    germany: { police: "110", ambulance: "112", fire: "112", general: "112" },
    spain: { police: "091", ambulance: "112", fire: "112", general: "112" },
    portugal: { police: "112", ambulance: "112", fire: "112", general: "112" },
    "united states": { police: "911", ambulance: "911", fire: "911" },
    usa: { police: "911", ambulance: "911", fire: "911" },
    canada: { police: "911", ambulance: "911", fire: "911" },
    mexico: { police: "911", ambulance: "911", fire: "911" },
    japan: { police: "110", ambulance: "119", fire: "119" },
    china: { police: "110", ambulance: "120", fire: "119" },
    "south korea": { police: "112", ambulance: "119", fire: "119" },
    india: { police: "100", ambulance: "102", fire: "101", general: "112" },
    thailand: { police: "191", ambulance: "1669", fire: "199" },
    vietnam: { police: "113", ambulance: "115", fire: "114" },
    indonesia: { police: "110", ambulance: "118", fire: "113" },
    bali: { police: "110", ambulance: "118", fire: "113" },
    singapore: { police: "999", ambulance: "995", fire: "995" },
    malaysia: { police: "999", ambulance: "999", fire: "994" },
    philippines: { police: "911", ambulance: "911", fire: "911" },
    australia: { police: "000", ambulance: "000", fire: "000" },
    "new zealand": { police: "111", ambulance: "111", fire: "111" },
    "united arab emirates": { police: "999", ambulance: "998", fire: "997" },
    uae: { police: "999", ambulance: "998", fire: "997" },
    dubai: { police: "999", ambulance: "998", fire: "997" },
    turkey: { police: "155", ambulance: "112", fire: "110" },
    greece: { police: "100", ambulance: "166", fire: "199", general: "112" },
    netherlands: { police: "112", ambulance: "112", fire: "112" },
    switzerland: { police: "117", ambulance: "144", fire: "118", general: "112" },
    austria: { police: "133", ambulance: "144", fire: "122", general: "112" },
    ireland: { police: "999", ambulance: "999", fire: "999", general: "112" },
    iceland: { police: "112", ambulance: "112", fire: "112" },
    norway: { police: "112", ambulance: "113", fire: "110" },
    sweden: { police: "112", ambulance: "112", fire: "112" },
    denmark: { police: "112", ambulance: "112", fire: "112" },
    finland: { police: "112", ambulance: "112", fire: "112" },
    egypt: { police: "122", ambulance: "123", fire: "180" },
    "south africa": { police: "10111", ambulance: "10177", fire: "10177" },
    brazil: { police: "190", ambulance: "192", fire: "193" },
    argentina: { police: "911", ambulance: "911", fire: "911" },
    peru: { police: "105", ambulance: "106", fire: "116" },
    russia: { police: "102", ambulance: "103", fire: "101", general: "112" },
    morocco: { police: "19", ambulance: "15", fire: "15" },
  };

  private getNationalEmergencyNumber(location: string): {
    name: string;
    type: string;
    phone: string;
    safetyNotes: string;
  } | null {
    const normalized = location.toLowerCase();
    for (const [country, numbers] of Object.entries(
      AiUtilitiesService.NATIONAL_EMERGENCY_NUMBERS,
    )) {
      if (normalized.includes(country)) {
        const parts = [
          `Police: ${numbers.police}`,
          `Ambulance: ${numbers.ambulance}`,
          `Fire: ${numbers.fire}`,
        ];
        if (numbers.general) parts.push(`General/EU-wide: ${numbers.general}`);
        return {
          name: "National Emergency Numbers",
          type: "general",
          phone: numbers.general || numbers.police,
          safetyNotes: parts.join(" · "),
        };
      }
    }
    return null;
  }

  async emergency(location: string): Promise<
    Array<{
      name: string;
      type: string;
      phone?: string;
      address?: string;
      coordinates?: { lat: number; lon: number };
      safetyNotes?: string;
    }>
  > {
    const loc = sanitize(location, 128);
    const key = `emergency:${loc}`;
    const cached = this.getCached<
      Array<{
        name: string;
        type: string;
        phone?: string;
        address?: string;
        coordinates?: { lat: number; lon: number };
        safetyNotes?: string;
      }>
    >(key);
    if (cached) return cached;

    const nationalEntry = this.getNationalEmergencyNumber(loc);

    try {
      if (!this.openai) throw new Error("ai_disabled");
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
      const arr = Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : [];
      const normalized = arr.map((i: any) => ({
        name: String(i.name || ""),
        type: String(i.type || ""),
        phone: i.phone ? String(i.phone) : undefined,
        address: i.address ? String(i.address) : undefined,
        coordinates:
          i.coordinates && typeof i.coordinates === "object"
            ? { lat: Number(i.coordinates.lat || 0), lon: Number(i.coordinates.lon || 0) }
            : undefined,
        safetyNotes: i.safetyNotes ? String(i.safetyNotes) : undefined,
      }));
      return this.setCached(key, nationalEntry ? [nationalEntry, ...normalized] : normalized);
    } catch {
      const types = ["hospital", "police", "embassy", "pharmacy"];
      const results: Array<{
        name: string;
        type: string;
        phone?: string;
        address?: string;
        coordinates?: { lat: number; lon: number };
        safetyNotes?: string;
      }> = [];

      // Geocode the location first, then search by proximity. Uses Google
      // Places (Text Search + Nearby Search) rather than Nominatim/Overpass —
      // those free OSM services are rate-limited per-IP and this app's own
      // testing volume has been enough to trip that limit (confirmed: 429
      // from Nominatim, connection failures from Overpass), while Places is
      // the same reliable, already-enabled API used elsewhere in this file.
      let center: { lat: number; lon: number } | null = null;

      // "Near your location" sends raw "lat,lon" as the location string —
      // that's already coordinates, no geocoding needed.
      const coordMatch = loc.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
      if (coordMatch) {
        center = { lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]) };
      } else {
        const key2 = config.GOOGLE_API_KEY;
        if (key2) {
          try {
            const geoRes = await fetch(
              `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(loc)}&key=${key2}`,
            );
            const geoJson = await geoRes.json();
            const loc2 = geoJson?.results?.[0]?.geometry?.location;
            if (loc2) center = { lat: loc2.lat, lon: loc2.lng };
          } catch (e) {
            console.warn(`Emergency: geocoding failed for ${loc}`, e);
          }
        }
      }

      if (center) {
        const key2 = config.GOOGLE_API_KEY;
        if (key2) {
          const { lat, lon } = center;
          const radius = 5000; // meters
          for (const t of types) {
            try {
              const params =
                t === "embassy" ? `keyword=embassy&radius=${radius}` : `type=${t}&radius=${radius}`;
              const r = await fetch(
                `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&${params}&key=${key2}`,
              );
              if (!r.ok) continue;
              const json = await r.json();
              const items = Array.isArray(json?.results) ? json.results.slice(0, 3) : [];
              for (const p of items) {
                results.push({
                  name: String(p.name || t.charAt(0).toUpperCase() + t.slice(1)),
                  type: t,
                  phone: undefined,
                  address: p.vicinity || undefined,
                  coordinates: p.geometry?.location
                    ? { lat: p.geometry.location.lat, lon: p.geometry.location.lng }
                    : undefined,
                  safetyNotes: undefined,
                });
              }
            } catch (e) {
              console.warn(`Places nearby search failed for ${t} near ${loc}`, e);
            }
          }
        }
      }

      return this.setCached(key, nationalEntry ? [nationalEntry, ...results] : results);
    }
  }

  /**
   * Generates a budget forecast for a trip based on current spending and remaining itinerary.
   */
  async getBudgetForecast(trip: any): Promise<{
    burnRate: number;
    estimatedFinalCost: number;
    isOverBudget: boolean;
    remainingBudget: number;
    daysRemaining: number;
    alerts: string[];
    pivots: string[];
  }> {
    const budget = trip.budget || 0;
    const totalDays = trip.days || 1;
    const expenses = trip.expenses || [];
    const itinerary = trip.itinerary || [];
    const currency = trip.currency || "INR";

    // 1. Calculate Manual Spent
    const manualSpent = expenses.reduce(
      (acc: number, curr: any) => acc + (Number(curr.amount) || 0),
      0,
    );

    // 2. Calculate Planned Itinerary Cost (Activities)
    let itineraryCost = 0;
    if (Array.isArray(itinerary)) {
      itinerary.forEach((day: any) => {
        if (Array.isArray(day.activities)) {
          day.activities.forEach((act: any) => {
            itineraryCost += Number(act.cost || act.entryFee || 0);
          });
        }
      });
    }

    // 3. Estimate Fixed Costs (Accommodation/Transit if not in expenses)
    const breakdown = trip.costBreakdown || {};
    const estimatedAccommodation = Number(
      breakdown.accommodation || breakdown.accommodationINR || 0,
    );
    const estimatedTransit = Number(breakdown.transport || breakdown.transportINR || 0);

    const totalSpent = manualSpent + itineraryCost;
    const estimatedFinalCost = totalSpent + estimatedAccommodation + estimatedTransit;
    const isOverBudget = estimatedFinalCost > budget;
    const remainingBudget = Math.max(0, budget - totalSpent);

    // 4. Calculate Burn Rate (Proportional)
    // If we have a startDate, calculate actual days passed. Otherwise, assume progress based on logged expenses.
    let currentDay = 1;
    if (trip.startDate) {
      const start = new Date(trip.startDate);
      const now = new Date();
      currentDay = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      currentDay = Math.min(totalDays, Math.max(1, currentDay));
    }

    const daysRemaining = Math.max(0, totalDays - currentDay);
    const expectedDailyBudget = budget / totalDays;
    const actualDailySpent = totalSpent / currentDay;
    const burnRate = actualDailySpent / (expectedDailyBudget || 1);

    // 5. Generate Intelligent Alerts & Pivots
    const alerts: string[] = [];
    const pivots: string[] = [];

    if (burnRate > 1.2) {
      alerts.push(
        `Critical Burn Rate: You are spending ${Math.round((burnRate - 1) * 100)}% faster than planned.`,
      );
      pivots.push("Switch to public transport (Metro/Buses) for the next 48 hours.");
      pivots.push("Prioritize free sightseeing spots or city parks for the next two days.");
    } else if (burnRate > 1.05) {
      alerts.push("Moderate Overspending: Careful, you might exceed the budget by the trip's end.");
      pivots.push(
        "Limit dining to local 'Hidden Gems' or street food hubs instead of fine dining.",
      );
    }

    if (manualSpent > budget * 0.7 && currentDay < totalDays / 2) {
      alerts.push(
        "Resource Exhaustion: You've used 70% of your budget in less than half the trip.",
      );
    }

    if (!isOverBudget && remainingBudget < expectedDailyBudget * 0.5 && daysRemaining > 1) {
      alerts.push(
        "Low Liquidity: Remaining funds are insufficient for your current daily spending habits.",
      );
    }

    // Generic helpful advice if doing well
    if (burnRate < 0.8 && totalSpent > 0) {
      alerts.push("Excellent Budget Management: You are well within your financial limits!");
      pivots.push(
        "Consider upgrading to a premium experience or a unique local activity on your final day.",
      );
    }

    return {
      burnRate: parseFloat(burnRate.toFixed(2)),
      estimatedFinalCost,
      isOverBudget,
      remainingBudget,
      daysRemaining,
      alerts,
      pivots,
    };
  }

  async planTrip(input: {
    destination: string;
    days: number;
    persons: number;
    budget?: number;
    currency?: string;
    typeOfTrip: string;
    travelMedium: string;
    existingItinerary?: any[];
  }): Promise<
    | {
        destination: string;
        days: number;
        persons: number;
        totalEstimatedCost: number;
        currency: string;
        costBreakdown: {
          accommodationINR: number;
          foodINR: number;
          transportINR: number;
          activitiesINR: number;
          miscINR: number;
          totalINR: number;
        };
        itinerary: Array<{
          day: number;
          activities: Array<{
            time: string;
            title: string;
            placeName?: string;
            address: string;
            type: "sightseeing" | "restaurant" | "cafe" | "market" | "museum" | "temple" | "park";
            entryFeeINR: number;
            duration_minutes: number;
            localFoodRecommendations: string[];
            routeFromPrevious: {
              mode: string;
              distance_km: number;
              travel_time_minutes: number;
              from: string;
              to: string;
            };
          }>;
        }>;
        packingList: string[];
        safetyTips: string[];
        notes: string;
      }
    | { error: "invalid_model_output" | "providers_unavailable"; message: string }
  > {
    const {
      destination: rawDestination,
      days: rawDays,
      persons: rawPersons,
      budget: rawBudget,
      currency: rawCurrency,
      typeOfTrip: rawTypeOfTrip,
      travelMedium: rawTravelMedium,
      existingItinerary,
    } = input;

    const destination = sanitize(rawDestination, 128);
    const days = Number.isFinite(rawDays) ? Math.max(1, Math.floor(rawDays)) : 1;
    const persons = Number.isFinite(rawPersons) ? Math.max(1, Math.floor(rawPersons)) : 1;
    const budget =
      typeof rawBudget === "number" && Number.isFinite(rawBudget)
        ? Math.max(0, rawBudget)
        : undefined;
    const currency = sanitize(rawCurrency || "INR", 3).toUpperCase();
    const typeOfTrip = sanitize(rawTypeOfTrip, 64);
    const travelMedium = sanitize(rawTravelMedium, 64);
    const key = `planTrip:${destination}:${days}:${persons}:${budget ?? "x"}:${currency}:${typeOfTrip}:${travelMedium}:${existingItinerary ? "opt" : "fresh"}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;
    if (this.inflight.has(key)) {
      return await this.inflight.get(key)!;
    }

    const task = (async () => {
      // Validate destination
      if (!this.validateDestination(destination)) {
        console.warn(`[planTrip] Invalid destination: "${destination}", using fallback generator`);
        return await this.generateFallbackTrip({
          destination,
          days,
          persons,
          budget,
          currency,
          typeOfTrip,
          travelMedium,
        });
      }

      // Initialize Agentic Services
      const modeler = new FeasibilityModeler();
      const validator = new PlanValidator(modeler);

      // Initialize the new highly-resilient Multi-Agent architecture
      const orchestrator = new MultiAgentOrchestrator({
        openai: this.openai,
        geminiHelper: this.generateWithGemini.bind(this),
        places: { getPointsOfInterest: this.getPointsOfInterest.bind(this) },
        weather: { getWeatherForLocation: this.getWeatherForLocation.bind(this) },
      });

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
                  routeFromPrevious: z.object({
                    mode: z.string(),
                    distance_km: z.number(),
                    travel_time_minutes: z.number(),
                    from: z.string(),
                    to: z.string(),
                  }),
                }),
              )
              .min(3),
            reasoning: z.string().optional(),
            confidenceScore: z.enum(["high", "medium", "low"]).optional(),
          }),
        ),
        packingList: z.array(z.string()).min(1),
        safetyTips: z.array(z.string()).min(1),
        notes: z.string(),
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
      try {
        // Orchestrated Cognitive Reasoning Loop replacing single-shot text generation
        const rawPlan = await orchestrator.executeReasoningLoop({
          goal: `Plan a ${days}-day, ${typeOfTrip} trip to ${destination} for ${persons} person(s). It is CRITICAL that you generate EXACTLY ${days} days of itineraries.`,
          constraints: {
            budget,
            days,
            persons,
            travelStyle: typeOfTrip,
            currency,
            destination,
            existingItinerary,
          },
          maxIterations: 3,
        });

        // Zod still checks here for the router response shape
        const parsed = zTripPlan.safeParse(rawPlan);

        if (!parsed.success) {
          console.error(
            "[AiUtilities] Zod Validation Failed:",
            JSON.stringify(parsed.error.format(), null, 2),
          );
          throw new Error("Schema Validation Failed after reasoning loop");
        }

        let finalPlan = parsed.data;

        try {
          // GROUNDING STEP: Verify results against Google Places with timeout
          const groundingPromise = this.groundItineraryWithRealPlaces(finalPlan, currency || "INR");
          finalPlan = await this.withTimeout(
            groundingPromise,
            20000,
            finalPlan, // Fallback to raw AI plan if grounding takes too long
            `Grounding: ${destination}`,
          );

          // DETERMINISTIC CONSTRAINT ENGINE (Stage 5 Architecture)
          finalPlan = await this.enforceTransitConstraints(finalPlan);
        } catch (postProcessingError: any) {
          console.error(
            `[AiUtilities] Grounding or Constraint enforcement failed for ${destination}, falling back to pristine AI plan:`,
            postProcessingError.message,
          );
          // If grounding fails, we intentionally swallow the error and use the pristine AI plan.
        }

        // Final explainability tag
        finalPlan.notes =
          (finalPlan.notes || "") +
          " | Cognitive Validator applied: Multi-Agent architecture active.";

        return this.setCached(key, finalPlan);
      } catch (genError: any) {
        console.error(
          `[AiUtilities] planTrip failed for ${destination}, using fallback:`,
          genError.message,
        );
        const fallback = await this.generateFallbackTrip({
          destination,
          days,
          persons,
          budget,
          currency,
          typeOfTrip,
          travelMedium,
        });
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

  /**
   * PROACTIVE TRAVEL OPTIMIZER (Stage 5 Architecture)
   * Cross-references weather forecasts with itinerary to suggest proactive adjustments.
   */
  async getProactiveInsights(
    destination: string,
    itinerary: any[],
  ): Promise<{ insights: string[]; suggestedPackingItems: string[] }> {
    try {
      const weatherData = await this.weather(destination);
      const insights: string[] = [];
      const suggestedPackingItems: string[] = [];

      const current = weatherData.current;
      const condition = String(current?.condition || "").toLowerCase();
      const temperature = current?.temperature;

      // Weather-Aware Packing
      if (condition.includes("rain") || condition.includes("drizzle")) {
        insights.push(
          `🌧️ Rain expected in ${destination}. Consider moving outdoor sightseeing workshops to afternoon.`,
        );
        suggestedPackingItems.push("Umbrella", "Raincoat", "Waterproof Shoes");
      }
      if (temperature > 30) {
        insights.push(
          `🔥 High heat alert (${temperature}°C). Schedule heavy walking before 11:00 AM or after 4:00 PM.`,
        );
        suggestedPackingItems.push("Sunscreen", "Large Water Bottle", "Breathable Cotton Wear");
      }
      if (temperature < 10) {
        insights.push(
          `❄️ Chilly weather expected (${temperature}°C). Layer up for the evening activities.`,
        );
        suggestedPackingItems.push("Warm Jacket", "Gloves", "Scarf");
      }

      // Logic check: If rain + sightseeing, suggest specific movement
      for (const day of itinerary) {
        const hasOutdoor = (day.activities || []).some((a: any) =>
          ["sightseeing", "market", "park"].includes(a.type),
        );
        if (hasOutdoor && condition.includes("rain")) {
          insights.push(
            `💡 Day ${day.day}: Rain might impact outdoor spots. Check for indoor museum alternatives.`,
          );
        }
      }

      return { insights, suggestedPackingItems };
    } catch (e) {
      console.error("[ProactiveInsights] Error:", e);
      return { insights: [], suggestedPackingItems: [] };
    }
  }

  private validateTripPlan(obj: any): { valid: boolean; value?: any } {
    if (!obj || typeof obj !== "object") return { valid: false };
    const isNum = (x: any) => typeof x === "number" && Number.isFinite(x);
    const isStr = (x: any) => typeof x === "string";
    if (
      !isStr(obj.destination) ||
      !isNum(obj.days) ||
      !isNum(obj.persons) ||
      !isNum(obj.totalEstimatedCost) ||
      !isStr(obj.currency)
    )
      return { valid: false };
    const itin = obj.itinerary;
    if (!Array.isArray(itin) || itin.length < 1) return { valid: false };
    // Basic validation
    return { valid: true, value: obj };
  }

  private parseJson(raw: string): any {
    let s = raw.trim();

    // Deeper cleanup for markdown if it exists anywhere
    if (s.includes("```")) {
      const match = s.match(/```(?:json)?([\s\S]*?)```/);
      if (match) s = match[1].trim();
    }

    const firstBrace = s.indexOf("{");
    const lastBrace = s.lastIndexOf("}");
    const firstBracket = s.indexOf("[");
    const lastBracket = s.lastIndexOf("]");

    // Find the outer-most structure (brace or bracket)
    if (
      firstBrace !== -1 &&
      lastBrace !== -1 &&
      (firstBracket === -1 || firstBrace < firstBracket)
    ) {
      s = s.slice(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      s = s.slice(firstBracket, lastBracket + 1);
    }

    try {
      return JSON.parse(s);
    } catch (e: any) {
      console.error("[AiUtilities] JSON fallback triggered:", e?.message || e);
      return {};
    }
  }

  async weatherTool(location: string): Promise<
    | {
        current: {
          temperature: number;
          conditions: string;
          humidity: number;
          wind_kph: number;
          advice: string;
        };
        forecast: Array<{ date: string; high: number; low: number; conditions: string }>;
      }
    | { error: "invalid_model_output"; message: string }
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
      advice: w.recommendations[0] || "Check local forecast",
    };
    const forecast = w.forecast.map((f: any) => ({
      date: f.day, // Note: returning label as date for simplicity as per existing logic
      high: f.high,
      low: f.low,
      conditions: f.condition,
    }));
    return this.setCached(key, { current, forecast });
  }

  private validateWeatherTool(obj: any): any {
    // Simplified validation
    return { valid: true, value: obj };
  }

  /**
   * Wraps a promise with a timeout to prevent hanging on slow API calls
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T,
    label: string,
  ): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeoutMs),
    );

    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (e: any) {
      console.warn(`[${label}] ${e.message || "Failed"}, using fallback`);
      return fallback;
    }
  }

  /**
   * Validates if a destination string appears to be legitimate
   */
  private validateDestination(destination: string): boolean {
    if (!destination || destination.length < 2) return false;

    // Check for basic alphanumeric + common punctuation
    const validPattern = /^[a-zA-Z\s,.\-']+$/;
    if (!validPattern.test(destination)) return false;

    // Reject obvious gibberish (repeated characters)
    const repeatedPattern = /(.)\1{5,}/;
    if (repeatedPattern.test(destination)) return false;

    // Reject too many consecutive special chars
    if (/[,.\-']{3,}/.test(destination)) return false;

    return true;
  }

  private async searchPlaces(query: string, timeoutMs = 10000): Promise<any[]> {
    try {
      if (!config.GOOGLE_API_KEY) {
        console.warn("[searchPlaces] No Google API key configured");
        return [];
      }

      const key = config.GOOGLE_API_KEY;
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;

      // Wrap fetch in timeout
      const fetchPromise = fetch(url).then((res) => res.json());
      const data = await this.withTimeout(
        fetchPromise,
        timeoutMs,
        { status: "TIMEOUT", results: [] },
        `Google Places API: "${query}"`,
      );

      if (data.status === "TIMEOUT") {
        console.warn(`[searchPlaces] Timeout for query "${query}"`);
        return [];
      }

      if (data.status === "ZERO_RESULTS") {
        return [];
      }

      if (data.status === "OVER_QUERY_LIMIT") {
        console.error("[searchPlaces] Google Places quota exceeded");
        return [];
      }

      if (data.status === "OK" && Array.isArray(data.results)) {
        return data.results.map((p: any) => ({
          name: p.name,
          formatted_address: p.formatted_address,
          types: p.types || [],
          rating: p.rating,
          user_ratings_total: p.user_ratings_total,
          price_level: p.price_level,
          geometry: p.geometry, // Include location data (lat/lng)
        }));
      }

      console.warn(`[searchPlaces] Unexpected status: ${data.status}`);
      return [];
    } catch (error: any) {
      console.error(`[searchPlaces] Error for query "${query}":`, error.message);
      return [];
    }
  }

  private async generateFallbackTrip(input: {
    destination: string;
    days: number;
    persons: number;
    budget?: number;
    currency?: string;
    typeOfTrip: string;
    travelMedium: string;
  }): Promise<any> {
    const { destination, days, persons, budget, currency, typeOfTrip, travelMedium } = input;
    const safeCurrency = currency || "INR";

    const realPlaces = await this.searchPlaces(`${destination} tourist places`);
    // Specific search for restaurants to avoid generic results
    const restaurantPlaces = await this.searchPlaces(`best restaurants in ${destination}`);

    // Helper to estimate cost based on price_level (0-4)
    const estimateCost = (place: any, type: string) => {
      const baseRates: Record<string, number> = {
        INR: 500,
        USD: 20,
        EUR: 18,
        GBP: 15,
        AUD: 25,
        CAD: 25,
        JPY: 2000,
        CNY: 100,
      };
      const base = baseRates[safeCurrency] || 20; // Default to 20 units

      if (type === "restaurant") {
        const multiplier = place.price_level || 2; // Default to Medium $$
        return Math.round(base * (0.5 + multiplier * 0.5));
      }
      return 0; // Sightseeing default free unless known
    };

    const safeBudget =
      budget || (safeCurrency === "USD" ? 100 * days * persons : 5000 * days * persons);

    // Basic cost distribution
    const accommodation = Math.round(safeBudget * 0.4);
    const transport = Math.round(safeBudget * 0.15);
    // Dynamic calculation for food and activities based on items
    const activitiesCost = 0;
    let foodCost = 0;

    const itinerary: any[] = [];
    const backupActivities = [
      { type: "sightseeing", name: "Historic City Center", suffix: "" },
      { type: "museum", name: "City Museum", suffix: "" },
      { type: "park", name: "Central Park", suffix: "" },
      { type: "market", name: "Local Market", suffix: "" },
      { type: "temple", name: "Grand Temple", suffix: "" },
      { type: "sightseeing", name: "Scenic Viewpoint", suffix: "" },
    ];

    for (let i = 1; i <= days; i++) {
      const dailyActivities: any[] = [];
      const p1Index = (i - 1) * 2;
      const p1 = realPlaces[p1Index] || backupActivities[p1Index % backupActivities.length];

      dailyActivities.push({
        time: "09:00 AM",
        title: p1.name || "Historic Site",
        placeName: p1.name || "Historic Site",
        address: p1.formatted_address || `${destination} Center`,
        type: "sightseeing",
        entryFee: 0,
        duration_minutes: 120,
        lat: p1.geometry?.location?.lat,
        lon: p1.geometry?.location?.lng,
        localFoodRecommendations: ["Local Breakfast"],
        routeFromPrevious: {
          mode: travelMedium,
          distance_km: 5,
          travel_time_minutes: 15,
          from: "Hotel",
          to: p1.name || "Site",
        },
      });

      // Activity 2: Lunch (Restaurant)
      // Pick a restaurant from the specific search results, cycle through them
      const pFood =
        restaurantPlaces.length > 0
          ? restaurantPlaces[(i - 1) % restaurantPlaces.length]
          : realPlaces.find((p) => p.types.includes("restaurant") || p.types.includes("food")) || {
              name: "Local Restaurant",
              formatted_address: `${destination} Downtown`,
              price_level: 2,
            };

      const lunchCost = estimateCost(pFood, "restaurant");
      foodCost += lunchCost * persons;

      dailyActivities.push({
        time: "01:00 PM",
        title: pFood.name || "Local Restaurant",
        placeName: pFood.name || "Local Restaurant",
        address: pFood.formatted_address || `${destination} Downtown`,
        type: "restaurant",
        entryFee: 0,
        cost: lunchCost,
        duration_minutes: 60,
        lat: pFood.geometry?.location?.lat,
        lon: pFood.geometry?.location?.lng,
        localFoodRecommendations: ["Local Dish"],
        routeFromPrevious: {
          mode: "walk",
          distance_km: 1,
          travel_time_minutes: 10,
          from: p1.name || "Site",
          to: "Restaurant",
        },
      });

      const p2Index = (i - 1) * 2 + 1;
      const p2 = realPlaces[p2Index] || backupActivities[p2Index % backupActivities.length];

      dailyActivities.push({
        time: "03:00 PM",
        title: p2.name || "City Park",
        placeName: p2.name || "City Park",
        address: p2.formatted_address || `${destination} Area`,
        type: "sightseeing",
        entryFee: 0,
        duration_minutes: 120,
        lat: p2.geometry?.location?.lat,
        lon: p2.geometry?.location?.lng,
        localFoodRecommendations: ["Street Food"],
        routeFromPrevious: {
          mode: "taxi",
          distance_km: 3,
          travel_time_minutes: 15,
          from: "Restaurant",
          to: p2.name || "Park",
        },
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
      total: accommodation + foodCost + transport + activitiesCost + misc,
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
      notes: "Generated by Smart Fallback (Real Places + Estimated Costs)",
    };
  }

  // Use Gemini to get real place names, with fallback to Google Places API
  private async getRealPlacesFromGemini(
    destination: string,
    type: "restaurants" | "attractions",
  ): Promise<Array<{ name: string; address?: string; cuisine?: string }>> {
    const geminiKey = config.GEMINI_API_KEY;
    const placesKey = config.GOOGLE_API_KEY;

    // Try Gemini first
    if (geminiKey) {
      const prompt =
        type === "restaurants"
          ? `List exactly 15 real, popular, and highly-rated restaurants in ${destination}. Include a mix of local cuisine, cafes, and fine dining. Return ONLY a valid JSON array with objects containing "name" (exact restaurant name), "address" (approximate location/area), and "cuisine" (type of food). No explanations, just the JSON array.`
          : `List exactly 15 real, popular tourist attractions and landmarks in ${destination}. Include temples, parks, monuments, markets, and museums. Return ONLY a valid JSON array with objects containing "name" (exact place name) and "address" (approximate location/area). No explanations, just the JSON array.`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3 },
            }),
            signal: controller.signal,
          },
        );
        clearTimeout(timer);

        const json = await response.json();

        // Check for API errors
        if (json.error) {
          console.warn(`[Gemini] API Error: ${json.error.code} - ${json.error.message}`);
          throw new Error(`Gemini API Error: ${json.error.message}`);
        }

        const textContent = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Extract JSON from potential markdown code blocks
        let cleanJson = textContent.trim();
        if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson
            .replace(/```json?\n?/g, "")
            .replace(/```/g, "")
            .trim();
        }

        if (cleanJson) {
          const parsed = JSON.parse(cleanJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e: any) {
        console.warn(`[Gemini] Failed to get ${type} for ${destination}: ${e.message}`);
      }
    }

    // Fallback to Google Places API
    if (placesKey) {
      try {
        const query =
          type === "restaurants"
            ? `best restaurants in ${destination}`
            : `top tourist attractions in ${destination}`;

        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${placesKey}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.status === "OK" && data.results && data.results.length > 0) {
          return data.results.slice(0, 15).map((p: any) => ({
            name: p.name,
            address: p.formatted_address || p.vicinity,
            cuisine:
              type === "restaurants"
                ? p.types?.includes("cafe")
                  ? "Cafe"
                  : "Restaurant"
                : undefined,
          }));
        }
      } catch (e: any) {
        console.error(`[Places] Error fetching ${type} for ${destination}:`, e.message);
      }
    }

    return [];
  }

  // Verify specific places using Gemini AI for real names
  private async groundItineraryWithRealPlaces(plan: any, currency: string): Promise<any> {
    // Get real places from Gemini
    const [realRestaurants, realAttractions] = await Promise.all([
      this.getRealPlacesFromGemini(plan.destination, "restaurants"),
      this.getRealPlacesFromGemini(plan.destination, "attractions"),
    ]);

    // Base rates for cost estimation
    const baseRates: Record<string, number> = {
      INR: 500,
      USD: 20,
      EUR: 18,
      GBP: 15,
      AUD: 25,
      CAD: 25,
      JPY: 2000,
      CNY: 100,
    };
    const base = baseRates[currency] || 20;

    // Track used places to avoid duplicates
    const usedRestaurants = new Set<string>();
    const usedAttractions = new Set<string>();
    let restaurantIndex = 0;
    let attractionIndex = 0;

    // Generic terms that should trigger replacement
    const genericRestaurantTerms = [
      "top rated",
      "local restaurant",
      "best cafe",
      "famous",
      "popular",
      "restaurant",
      "cafe",
      "lunch",
      "dinner",
      "breakfast",
      "eatery",
    ];
    const genericAttractionTerms = [
      "tourist spot",
      "famous place",
      "landmark",
      "attraction",
      "sightseeing",
      "top place",
      "city park",
      "local market",
    ];

    for (const day of plan.itinerary) {
      if (!day.activities) continue;

      for (const activity of day.activities) {
        try {
          const name = (activity.title || activity.placeName || "").toLowerCase();
          const activityType = (activity.type || "").toLowerCase();

          // Check if this is a restaurant/food activity
          const isFood =
            activityType === "restaurant" ||
            activityType === "cafe" ||
            activityType === "bar" ||
            name.includes("lunch") ||
            name.includes("dinner") ||
            name.includes("breakfast");

          // Check if this is a generic name that needs replacement
          const isGenericRestaurant =
            isFood && genericRestaurantTerms.some((term) => name.includes(term));
          const isGenericAttraction =
            !isFood && genericAttractionTerms.some((term) => name.includes(term));

          if (isGenericRestaurant && realRestaurants.length > 0) {
            // Pick next real restaurant
            const real = realRestaurants[restaurantIndex % realRestaurants.length];
            if (real && !usedRestaurants.has(real.name)) {
              activity.title = real.name;
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
              activity.title = real.name;
              activity.placeName = real.name;
              activity.address = real.address || `${plan.destination}`;
              usedAttractions.add(real.name);
              attractionIndex++;
            }
          } else if (isFood && !isGenericRestaurant && realRestaurants.length > 0) {
            // Even for non-generic food entries, verify it's a real place
            const matchingReal = realRestaurants.find(
              (r) =>
                r.name.toLowerCase().includes(name.split(" ")[0]) ||
                name.includes(r.name.toLowerCase().split(" ")[0]),
            );
            if (!matchingReal && !usedRestaurants.has(activity.title || activity.placeName)) {
              // If we can't verify it, replace with a real one
              const real = realRestaurants[restaurantIndex % realRestaurants.length];
              if (real && !usedRestaurants.has(real.name)) {
                activity.title = real.name;
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
      if (!day.activities) continue;
      for (const act of day.activities) {
        const cost = act.entryFee || act.cost || 0;
        const isFood =
          (act.type || "").toLowerCase() === "restaurant" ||
          (act.type || "").toLowerCase() === "cafe" ||
          (act.placeName || "").toLowerCase().includes("lunch") ||
          (act.placeName || "").toLowerCase().includes("dinner");
        if (isFood) {
          newFoodCost += cost * (plan.persons || 1);
        } else {
          newActivitiesCost += cost * (plan.persons || 1);
        }
      }
    }

    plan.costBreakdown = plan.costBreakdown || {};
    plan.costBreakdown.food = newFoodCost;
    plan.costBreakdown.foodINR = newFoodCost;
    plan.costBreakdown.activities = newActivitiesCost;
    plan.costBreakdown.activitiesINR = newActivitiesCost;

    const acc = plan.costBreakdown.accommodation || plan.costBreakdown.accommodationINR || 0;
    const trans = plan.costBreakdown.transport || plan.costBreakdown.transportINR || 0;
    const misc = plan.costBreakdown.misc || plan.costBreakdown.miscINR || 0;

    const calculatedTotal = acc + trans + newFoodCost + newActivitiesCost + misc;

    // BUDGET INTEGRITY FIREWALL: Scale down if grounding exceeded budget
    const targetBudget = plan.budget || 0;
    if (targetBudget > 0 && calculatedTotal > targetBudget) {
      const scaleFactor = targetBudget / calculatedTotal;

      const scale = (val: number) => Math.floor((val || 0) * scaleFactor);

      plan.costBreakdown.accommodation = scale(acc);
      plan.costBreakdown.accommodationINR = scale(acc);
      plan.costBreakdown.food = scale(newFoodCost);
      plan.costBreakdown.foodINR = scale(newFoodCost);
      plan.costBreakdown.transport = scale(trans);
      plan.costBreakdown.transportINR = scale(trans);
      plan.costBreakdown.activities = scale(newActivitiesCost);
      plan.costBreakdown.activitiesINR = scale(newActivitiesCost);
      plan.costBreakdown.misc = scale(misc);
      plan.costBreakdown.miscINR = scale(misc);

      // Also scale individual activity costs to keep UI consistent
      for (const day of plan.itinerary) {
        for (const act of day.activities) {
          if (act.cost) act.cost = scale(act.cost);
          if (act.entryFee) act.entryFee = scale(act.entryFee);
        }
      }
      plan.costBreakdown.total =
        plan.costBreakdown.accommodation +
        plan.costBreakdown.food +
        plan.costBreakdown.transport +
        plan.costBreakdown.activities +
        plan.costBreakdown.misc;
      plan.costBreakdown.totalINR = plan.costBreakdown.total;
    } else {
      plan.costBreakdown.total = calculatedTotal;
      plan.costBreakdown.totalINR = calculatedTotal;
    }

    plan.totalEstimatedCost = plan.costBreakdown.total;

    const restaurantsUsed = usedRestaurants.size;
    const attractionsUsed = usedAttractions.size;
    plan.notes =
      (plan.notes || "") +
      ` | Grounded (${restaurantsUsed} restaurants, ${attractionsUsed} attractions verified)`;

    return plan;
  }

  async getTravelHacks(
    destination: string,
    typeOfTrip: string = "relaxed",
  ): Promise<{ hacks: string[]; economicalAlternatives: string[] }> {
    const key = `hacks:${destination}:${typeOfTrip}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    // Validate destination
    if (!this.validateDestination(destination)) {
      console.warn(`[getTravelHacks] Invalid destination: "${destination}"`);
      return this.getRegionAwareFallbackHacks(destination);
    }

    const prompt = `Provide 6-8 SPECIFIC travel hacks and insider tips for ${destination}, focusing on practical money-saving and time-saving strategies that work specifically in this location.
    
    Also suggest 3-5 economical alternatives for famous tourist attractions, transport, or dining. BE SPECIFIC - mention actual local services, apps, or strategies used by locals.
    
    Examples:
    - Instead of \"Use public transport\" → \"Download the [City Metro App] for 30% discount on day passes\"
    - Instead of \"Eat local food\" → \"Visit [Specific Market Name] for authentic street food at 1/3 the price of tourist areas\"
    
    Return as JSON with:
    - 'hacks': array of strings (each string is a specific, actionable tip)
    - 'economicalAlternatives': array of strings (each string is a specific local alternative)
    
    Reply ONLY with valid JSON, no markdown.`;

    try {
      let content = "";
      if (this.openai) {
        const aiPromise = this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.7,
          messages: [
            { role: "system", content: "You are a travel expert. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
        });

        const completion: any = await this.withTimeout(
          aiPromise,
          15000,
          { choices: [{ message: { content: "{}" } }] } as any,
          `OpenAI Travel Hacks: ${destination}`,
        );

        content = completion.choices?.[0]?.message?.content?.trim() || "{}";
      } else {
        const geminiPromise = this.generateWithGemini(
          prompt,
          "You are a travel expert. Return only valid JSON.",
        );
        content = await this.withTimeout(
          geminiPromise,
          15000,
          "{}",
          `Gemini Travel Hacks: ${destination}`,
        );
      }

      const json = this.parseJson(content);

      const ensureStringArray = (arr: any): string[] => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item !== null) {
            // Handle {category, description} or {tip} etc.
            return (
              item.description || item.tip || item.text || item.content || JSON.stringify(item)
            );
          }
          return String(item);
        });
      };

      let result = {
        hacks: ensureStringArray(json.hacks),
        economicalAlternatives: ensureStringArray(json.economicalAlternatives),
      };

      // If AI failed, use region-aware fallback
      if (
        !result.hacks ||
        result.hacks.length === 0 ||
        !result.economicalAlternatives ||
        result.economicalAlternatives.length === 0
      ) {
        const fallback = this.getRegionAwareFallbackHacks(destination);
        result = {
          hacks: result.hacks && result.hacks.length > 0 ? result.hacks : fallback.hacks,
          economicalAlternatives:
            result.economicalAlternatives && result.economicalAlternatives.length > 0
              ? result.economicalAlternatives
              : fallback.economicalAlternatives,
        };
      }

      return this.setCached(key, result);
    } catch (e: any) {
      console.error(`[getTravelHacks] Failed for ${destination}:`, e.message);
      return this.getRegionAwareFallbackHacks(destination);
    }
  }

  /**
   * Returns region-specific fallback travel hacks based on destination
   */
  private getRegionAwareFallbackHacks(destination: string): {
    hacks: string[];
    economicalAlternatives: string[];
  } {
    const destLower = destination.toLowerCase();

    // Detect region
    const isAsian =
      /india|china|japan|thailand|vietnam|singapore|malaysia|indonesia|philippines|korea|bangladesh|nepal|sri lanka|cambodia/i.test(
        destLower,
      );
    const isEuropean =
      /europe|france|germany|italy|spain|uk|britain|england|portugal|greece|netherlands|belgium|austria|switzerland|poland|czech/i.test(
        destLower,
      );
    const isMiddleEast = /dubai|uae|qatar|saudi|egypt|turkey|jordan|israel/i.test(destLower);
    const isAmericas = /usa|america|canada|mexico|brazil|argentina|chile|peru|colombia/i.test(
      destLower,
    );

    if (isAsian) {
      return {
        hacks: [
          "Negotiate prices at markets - bargaining is expected and can save 30-50%",
          "Use local ride-sharing apps (Grab, Ola, etc.) instead of tourist taxis",
          "Eat at local food stalls and street vendors for authentic meals at 1/4 the price",
          "Visit temples and cultural sites early morning (6-8 AM) to avoid crowds and heat",
          "Download offline translation apps - Google Translate works offline",
          "Carry small bills - many vendors don't accept large denominations",
          "Book trains/buses directly from official apps, not tourist agencies",
        ],
        economicalAlternatives: [
          "Stay in homestays or guesthouses instead of hotels for authentic local experience",
          "Use sleeper trains/buses for overnight journeys to save on accommodation",
          "Visit free temples and parks instead of paid tourist monuments",
          "Eat at local 'thali' restaurants or food courts in malls",
        ],
      };
    } else if (isEuropean) {
      return {
        hacks: [
          "Get a city pass or museum pass for discounted entry to multiple attractions",
          "Use public transport day passes - usually cheaper than individual tickets",
          "Visit museums on free entry days (usually first Sunday of month)",
          "Book trains 2-3 months in advance for up to 70% discount",
          "Eat lunch instead of dinner at restaurants - lunch menus are cheaper",
          "Stay outside city center and use metro - accommodation is 40-60% cheaper",
        ],
        economicalAlternatives: [
          "Use BlaBlaCar for intercity travel instead of trains",
          "Shop at local supermarkets for picnic supplies instead of restaurants",
          "Walk or rent bikes instead of hop-on-hop-off buses",
          "Visit free walking tours (tip-based) instead of paid bus tours",
        ],
      };
    } else if (isMiddleEast) {
      return {
        hacks: [
          "Dress modestly to respect local culture and avoid unwanted attention",
          "Visit malls for free AC and affordable food courts",
          "Use metro/public transport - very modern and cheap in Gulf cities",
          "Book desert safaris through local operators, not hotel concierge",
          "Carry water bottle - staying hydrated is critical",
          "Shop at local souks (markets) and bargain for better prices",
        ],
        economicalAlternatives: [
          "Use Careem or local ride-sharing instead of hotel taxis",
          "Visit public beaches instead of hotel beach clubs",
          "Eat at local shawarma shops and cafeterias instead of restaurants",
          "Stay in neighboring emirates/areas for cheaper accommodation",
        ],
      };
    } else {
      // General fallback for other regions
      return {
        hacks: [
          "Carry a refillable water bottle to save on drinks",
          "Use public transport apps for the best routes and discounts",
          "Visit attractions early morning or late afternoon to avoid crowds",
          "Download offline maps before arriving",
          "Learn basic phrases in the local language for better prices",
          "Book accommodation with free cancellation for flexibility",
          "Check free walking tour options - great for orientation",
        ],
        economicalAlternatives: [
          "Use local buses instead of tourist taxis",
          "Eat at local markets instead of touristy restaurants",
          "Stay in neighborhoods where locals live for better prices",
          "Visit free attractions and parks instead of paid tourist spots",
        ],
      };
    }
  }

  async augmentJournalEntry(
    content: string,
    destination?: string,
  ): Promise<{ augmentedContent: string; suggestedLabels: string[]; sentiment: string }> {
    const prompt = `Augment this travel journal entry with a few AI-generated poetic sentences or fun facts related to the context ${destination ? `at ${destination}` : ""}. Also provide 3-5 keywords/labels and the sentiment of the entry. Return JSON with 'augmentedContent', 'suggestedLabels' (string array), and 'sentiment'.`;

    try {
      let rawContent = "";
      if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: "You are a creative travel journal assistant. Return only valid JSON.",
            },
            { role: "user", content: content + "\n\n" + prompt },
          ],
        });
        rawContent = completion.choices?.[0]?.message?.content?.trim() || "{}";
      } else {
        rawContent = await this.generateWithGemini(
          content + "\n\n" + prompt,
          "You are a creative travel journal assistant. Return only valid JSON.",
        );
      }

      const json = this.parseJson(rawContent);
      const labels = Array.isArray(json.suggestedLabels)
        ? json.suggestedLabels
        : ["Travel", "Memories"];
      const cleanLabels = labels.map((l: any) =>
        typeof l === "string" ? l : String(l.name || l.text || JSON.stringify(l)),
      );

      return {
        augmentedContent: String(json.augmentedContent || content),
        suggestedLabels: cleanLabels,
        sentiment: String(json.sentiment || "Positive"),
      };
    } catch (e) {
      console.error("[AiUtilities] Failed to augment journal:", e);
      // Previously returned the original content unchanged with a 200, which
      // the client read as a successful enhancement — "Entry Enhanced!" even
      // though nothing had changed. Throw so the caller surfaces a real error.
      throw new Error("AI enhancement is temporarily unavailable. Please try again.");
    }
  }

  /** Plain-text last-resort reply when the primary chat model(s) are unavailable — no tool-calling, no JSON parsing, just the best available provider's raw answer. */
  async generateFallbackReply(userMessage: string, systemPrompt: string): Promise<string | null> {
    try {
      if (this.openai) {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.4,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        });
        const text = completion.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch (e) {
      console.error("[AiUtilities] Fallback reply via OpenAI failed:", e);
    }

    try {
      const text = await this.generateWithGemini(userMessage, systemPrompt);
      if (text && text.trim()) return text.trim();
    } catch (e) {
      console.error("[AiUtilities] Fallback reply via Gemini failed:", e);
    }

    return null;
  }

  async getQuietPlaceSuggestions(destination: string): Promise<
    Array<{
      name: string;
      address: string;
      crowdLevel: string;
      type: string;
      bestTime: string;
      reason: string;
    }>
  > {
    const prompt = `Suggest 3 real, specific, lesser-known or low-crowd places to visit in ${destination} for someone who wants to avoid tourist crowds. Return JSON with a 'spots' array, each item having: 'name' (real place name in ${destination}), 'address' (real neighborhood/area in ${destination}), 'crowdLevel' ('Low' or 'Minimal'), 'type' (e.g. Nature, Heritage, Park, Cafe), 'bestTime' (time range), and 'reason' (one sentence, under 20 words).`;
    const system =
      "You are a local travel expert who knows real, specific places. Return only valid JSON, no markdown.";

    try {
      const rawContent = this.openai
        ? (
            await this.openai.chat.completions.create({
              model: "gpt-4o-mini",
              temperature: 0.6,
              messages: [
                { role: "system", content: system },
                { role: "user", content: prompt },
              ],
            })
          ).choices?.[0]?.message?.content?.trim() || "{}"
        : await this.generateWithGemini(prompt, system);

      const json = this.parseJson(rawContent);
      const spots = Array.isArray(json.spots) ? json.spots : [];
      if (!spots.length) throw new Error("empty spots");
      return spots.slice(0, 5).map((s: any) => ({
        name: String(s.name || "Quiet Spot"),
        address: String(s.address || destination),
        crowdLevel: String(s.crowdLevel || "Low"),
        type: String(s.type || "Outdoors"),
        bestTime: String(s.bestTime || "Morning"),
        reason: String(s.reason || "A calmer alternative away from the main tourist areas."),
      }));
    } catch (e) {
      console.error("[AiUtilities] Failed to generate quiet place suggestions:", e);
      return [
        {
          name: "Local Public Library",
          address: `${destination} — City Center`,
          crowdLevel: "Minimal",
          type: "Education",
          bestTime: "Morning",
          reason: "Ideal for remote work or reading in silence.",
        },
        {
          name: "Botanical Garden",
          address: `${destination} — Suburb Area`,
          crowdLevel: "Low",
          type: "Nature",
          bestTime: "Afternoon",
          reason: "Expansive green space with very few visitors during weekdays.",
        },
      ];
    }
  }

  private async resolveCoordinates(
    name: string,
    destination: string,
  ): Promise<{ lat: number; lon: number } | null> {
    const key = `resolveCoordinates:${name}:${destination}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    // 1. Static fallback for performance and reliability
    const nameLower = name.toLowerCase().trim();
    if (this.CITIES_COORD_MAP[nameLower]) {
      const base = this.CITIES_COORD_MAP[nameLower];
      // Add a micro-jitter (approx 100-200m) to avoid exact overlaps at city center
      const jitter = () => (Math.random() - 0.5) * 0.005;
      return this.setCached(key, {
        lat: base.lat + jitter(),
        lon: base.lon + jitter(),
      });
    }

    try {
      const places = await this.searchPlaces(`${name}, ${destination}`);
      if (places && places.length > 0 && places[0].geometry?.location) {
        const coords = {
          lat: places[0].geometry.location.lat,
          lon: places[0].geometry.location.lng,
        };
        return this.setCached(key, coords);
      }
    } catch (e) {
      console.warn(`[resolveCoordinates] Failed for ${name}:`, e);
    }
    return null;
  }

  /**
   * STAGE 2: Budget Breakdown Engine — Enhanced with Origin-to-Destination Transit
   */
  public async calculateBudgetBreakdown(
    totalBudget: number,
    travelStyle: string,
    origin?: string,
    destination?: string,
    travelMedium?: string,
  ): Promise<{
    accommodation: number;
    food: number;
    transport: number;
    activities: number;
    buffer: number;
    total: number;
    grandTransit: number;
  }> {
    let grandTransit = 0;

    // 1. Estimate Origin-to-Destination cost if possible
    if (origin && destination) {
      try {
        const originCoords = await this.resolveCoordinates(origin, "");
        const destCoords = await this.resolveCoordinates(destination, "");

        if (originCoords && destCoords) {
          const distance = this.calculateHaversineDistance(
            originCoords.lat,
            originCoords.lon,
            destCoords.lat,
            destCoords.lon,
          );

          // Heuristic costs per km in INR
          const costPerKm: Record<string, number> = {
            flight: 8,
            train: 3,
            bus: 2,
            car: 12,
            standard: 5,
          };

          const perPersonCost = distance * (costPerKm[travelMedium || "standard"] || 5) + 1000; // +1000 base
          grandTransit = Math.round(perPersonCost);

          // Cap transit at 60% of total budget to keep trip feasible
          grandTransit = Math.min(grandTransit, totalBudget * 0.6);
        }
      } catch (e) {
        console.warn("[calculateBudgetBreakdown] Transit estimation failed:", e);
      }
    }

    const buffer = totalBudget * 0.1; // 10% Mandatory Safety Buffer
    const allocatable = totalBudget - buffer - grandTransit;

    let ratios = { accommodation: 0.35, food: 0.25, transport: 0.2, activities: 0.2 };

    switch (travelStyle.toLowerCase()) {
      case "adventure":
        ratios = { accommodation: 0.25, food: 0.2, transport: 0.3, activities: 0.25 };
        break;
      case "luxury":
        ratios = { accommodation: 0.5, food: 0.2, transport: 0.15, activities: 0.15 };
        break;
      case "budget":
        ratios = { accommodation: 0.2, food: 0.3, transport: 0.3, activities: 0.2 };
        break;
      case "cultural":
        ratios = { accommodation: 0.3, food: 0.25, transport: 0.2, activities: 0.25 };
        break;
      case "relaxed":
        ratios = { accommodation: 0.45, food: 0.25, transport: 0.15, activities: 0.15 };
        break;
    }

    return {
      accommodation: Math.round(allocatable * ratios.accommodation),
      food: Math.round(allocatable * ratios.food),
      transport: Math.round(allocatable * ratios.transport),
      activities: Math.round(allocatable * ratios.activities),
      buffer: Math.round(buffer),
      grandTransit: Math.round(grandTransit),
      total: totalBudget,
    };
  }

  async getQuietAlternatives(destination: string): Promise<
    Array<{
      name: string;
      address: string;
      reason: string;
      crowdLevel?: string;
      bestTime?: string;
      type?: string;
    }>
  > {
    const key = `quiet:v2:${destination}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;

    // Validate destination
    if (!this.validateDestination(destination)) {
      console.warn(`[getQuietAlternatives] Invalid destination: "${destination}"`);
      return this.getGenericQuietSpots(destination);
    }

    const prompt = `Suggest 4-6 lesser-known, quiet, REAL tourist spots and hidden gems in ${destination} that locals love and tourists often miss. Each spot MUST be a real, specific, verifiable place.
    
    For each spot, provide:
    - 'name': EXACT name of the real place (verify it exists)
    - 'address': Specific real-world address or landmark
    - 'reason': Why it's perfect for avoiding crowds (2-3 sentences)
    - 'crowdLevel': 'Very Low' or 'Low'
    - 'bestTime': Best time to visit for quietness (e.g., \"Early morning weekdays\", \"Sunset\")
    - 'type': Type - Nature, Culture, Cafe, Park, Market, Temple, etc.
    
    CRITICAL: Each spot must be a REAL, named place. No generic entries like \"Local Cafe\" or \"Hidden Temple\". Research actual locations.
    
    Return as a JSON array of objects with these exact keys. Reply ONLY with valid JSON, no markdown.`;

    try {
      // Tier 1: AI Generation with timeout
      let content = "";
      if (this.openai) {
        const aiPromise = this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.5,
          messages: [
            {
              role: "system",
              content:
                "You are a travel expert specializing in hidden gems. Return only valid JSON.",
            },
            { role: "user", content: prompt },
          ],
        });

        const completion: any = await this.withTimeout(
          aiPromise,
          15000,
          { choices: [{ message: { content: "[]" } }] } as any,
          `OpenAI Quiet Spots: ${destination}`,
        );

        content = completion.choices?.[0]?.message?.content?.trim() || "[]";
      } else {
        const geminiPromise = this.generateWithGemini(
          prompt,
          "You are a travel expert specializing in hidden gems. Return only valid JSON.",
        );
        content = await this.withTimeout(
          geminiPromise,
          15000,
          "[]",
          `Gemini Quiet Spots: ${destination}`,
        );
      }

      const json = this.parseJson(content);
      let arr = Array.isArray(json) ? json : Array.isArray(json.spots) ? json.spots : [];

      // Tier 2: Google Places fallback if AI returned empty
      if (!arr || arr.length === 0) {
        try {
          const fallbackPlaces = await this.searchPlaces(
            `hidden gems local favorites ${destination}`,
          );
          if (fallbackPlaces.length > 0) {
            arr = fallbackPlaces.slice(0, 5).map((place: any) => ({
              name: place.name,
              address: place.formatted_address || destination,
              reason: `A local favorite known for its authentic atmosphere and fewer crowds.`,
              crowdLevel: "Low",
              bestTime: "Weekday mornings",
              type:
                place.types?.includes("restaurant") || place.types?.includes("cafe")
                  ? "Cafe"
                  : "Culture",
            }));
          }
        } catch (placesError) {
          console.warn(`[getQuietAlternatives] Google Places also failed:`, placesError);
        }
      }

      // Tier 3: Generic helpful suggestions if both failed
      if (!arr || arr.length === 0) {
        arr = this.getGenericQuietSpots(destination);
      }

      return this.setCached(key, arr);
    } catch (e: any) {
      console.error(`[getQuietAlternatives] Failed for ${destination}:`, e.message);
      return this.getGenericQuietSpots(destination);
    }
  }

  /**
   * Returns generic but helpful quiet spot suggestions
   */
  private getGenericQuietSpots(destination: string): Array<{
    name: string;
    address: string;
    reason: string;
    crowdLevel?: string;
    bestTime?: string;
    type?: string;
  }> {
    return [
      {
        name: "Local Neighborhood Parks",
        address: destination,
        reason:
          "Explore residential parks early in the morning for a peaceful atmosphere. These spots offer a glimpse into local life without tourist crowds.",
        crowdLevel: "Very Low",
        bestTime: "Early morning (6-8 AM)",
        type: "Nature",
      },
      {
        name: "Public Libraries or Cultural Centers",
        address: destination,
        reason:
          "Visit local libraries or community cultural centers for quiet reflection. Often overlooked by tourists, these spaces provide authentic local culture.",
        crowdLevel: "Very Low",
        bestTime: "Weekday afternoons",
        type: "Culture",
      },
      {
        name: "Residential Walking Streets",
        address: destination,
        reason:
          "Take leisurely walks through residential neighborhoods to discover local markets, cafes, and daily life away from tourist hotspots.",
        crowdLevel: "Low",
        bestTime: "Late afternoon",
        type: "Culture",
      },
      {
        name: "Local Markets (Non-Tourist)",
        address: destination,
        reason:
          "Visit neighborhood markets where locals shop for groceries. These authentic experiences offer cultural immersion without crowds.",
        crowdLevel: "Low",
        bestTime: "Early morning weekdays",
        type: "Market",
      },
    ];
  }

  private async getPointsOfInterest(destination: string, style: string): Promise<string[]> {
    const prompt = `List the top 8 real-world tourist attractions and must-visit landmarks for ${destination} that match a ${style} travel style. Return ONLY a JSON array of strings.`;
    try {
      const result = await this.generateWithGemini(
        prompt,
        'You are a professional travel researcher. Format: ["Spot 1", "Spot 2"]',
      );
      const parsed = JSON.parse(result);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn(`[getPointsOfInterest] Semantic grounding failed:`, e);
      return [];
    }
  }

  private async getWeatherForLocation(lat: number, lon: number): Promise<any> {
    const key = config.OPENWEATHER_API_KEY;
    if (!key) return null;
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric`,
      );
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      return null;
    }
  }

  /**
   * Parses a free-text travel schedule into a structured itinerary.
   * Used by the "Import My Plan" feature.
   */
  async parseSchedule(input: {
    scheduleText: string;
    startDate?: string;
    groupSize?: number;
    budget?: number;
    currency?: string;
  }): Promise<{
    destination: string;
    days: number;
    startDate?: string;
    itinerary: Array<{
      day: number;
      date?: string;
      theme: string;
      activities: Array<{
        id: string;
        time: string;
        title: string;
        type: string;
        from?: string;
        to?: string;
        notes?: string;
        address?: string;
        duration_minutes: number;
      }>;
    }>;
    costBreakdown?: Record<string, any>;
    notes?: string;
  }> {
    const { scheduleText, startDate, groupSize = 1, budget, currency = "INR" } = input;

    const prompt = `You are a travel itinerary parser. Parse the following travel schedule text into a structured JSON itinerary.

Schedule text:
"""
${scheduleText}
"""

Additional info:
- Start date: ${startDate || "Not specified"}
- Group size: ${groupSize} person(s)
- Budget: ${budget ? `${budget} ${currency}` : "Not specified"}
- Currency: ${currency}

Rules:
1. Extract each day as a separate itinerary entry. Lines like "27th ...", "28th ...", "1st June ...", "Day 3 ...", "May 31 ..." each represent one day.
2. For travel legs (flights, car drives, trains, treks), use type "travel" and include "from" and "to" fields.
3. For darshans/temple visits/sightseeing use type "sightseeing".
4. For stays/hotels use type "hotel".
5. Assign realistic times (flights in morning/evening, drives after breakfast, etc.).
6. Set a descriptive "theme" for each day (e.g., "Travel to Haridwar", "Badrinath Darshan").
7. Generate unique IDs for each activity using format "act-{dayNum}-{idx}".
8. If startDate is given, calculate the "date" for each day (YYYY-MM-DD format). If ordinal dates like "27th" are in the text, use the month/year from startDate to build the full date.
9. Identify the primary multi-city destination as a descriptive string (e.g., "Chardham Yatra - Uttarakhand & UP").
10. Assign duration_minutes: travel legs 120-480, sightseeing 60-120, hotel 0.
11. CRITICAL: Always return valid JSON. Never return empty itinerary — extract at minimum one day per line of the schedule.

Return ONLY valid JSON, no markdown, no explanation:
{
  "destination": "string",
  "days": number,
  "startDate": "YYYY-MM-DD or null",
  "itinerary": [
    {
      "day": 1,
      "date": "YYYY-MM-DD or null",
      "theme": "string",
      "activities": [
        {
          "id": "act-1-0",
          "time": "06:00 PM",
          "title": "string",
          "type": "travel|sightseeing|hotel|restaurant|other",
          "from": "string or null",
          "to": "string or null",
          "notes": "string or null",
          "address": "string or null",
          "duration_minutes": number
        }
      ]
    }
  ],
  "notes": "string or null"
}`;

    let raw = "";
    try {
      raw = await this.generateWithGemini(prompt);
    } catch (geminiError) {
      // Fallback to NVIDIA, then OpenAI, if Gemini fails
      try {
        raw = await this.generateWithNvidia(prompt);
      } catch (nvidiaError) {
        if (this.openai) {
          const res = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
          });
          raw = res.choices[0]?.message?.content || "{}";
        } else {
          throw new Error("No AI provider available");
        }
      }
    }

    const parsed = this.parseJson(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.itinerary) ||
      parsed.itinerary.length === 0
    ) {
      throw new Error("AI could not extract a valid itinerary from the schedule text");
    }

    // Ensure each activity has an id and duration
    for (const day of parsed.itinerary) {
      if (!Array.isArray(day.activities)) day.activities = [];
      for (let i = 0; i < day.activities.length; i++) {
        if (!day.activities[i].id) {
          day.activities[i].id = `act-${day.day ?? i + 1}-${i}`;
        }
        if (!day.activities[i].duration_minutes) {
          day.activities[i].duration_minutes = 60;
        }
      }
    }

    return parsed;
  }
}
