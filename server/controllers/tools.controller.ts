import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { BadRequestError } from "../errors";
import mongoose from "mongoose";
import os from "os";
import { AiUtilitiesService } from "../AiUtilitiesService";

const startTime = Date.now();

// ─── Public endpoints (no auth) ───────────────────────────────────────────────

export const health = async (_req: Request, res: Response) => {
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected";

    // We return 200 even if degraded to keep monitoring tools like UptimeRobot happy,
    // as long as the server process itself is healthy.
    res.status(200).json({
        status: dbState === 1 ? "ok" : "degraded",
        services: {
            database: dbStatus,
            api: "ok",
        },
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
    });
};

export const ping = (_req: Request, res: Response) => {
    res.status(200).send("pong");
};

export const atlasHealth = async (_req: Request, res: Response) => {
    const { getHealthSnapshot } = await import("../agent/providerHealth");
    const { MODELS, MODEL_BASE_URLS } = await import("../agent/agentLoop");
    const providers = getHealthSnapshot(MODELS, MODEL_BASE_URLS);
    const anyHealthy = providers.some((p) => p.healthy);
    res.status(200).json({
        status: anyHealthy ? "ok" : "degraded",
        providers,
        timestamp: new Date().toISOString(),
    });
};

export const liveness = (_req: Request, res: Response) => {
    res.status(200).json({ status: "alive" });
};

export const readiness = (_req: Request, res: Response) => {
    const dbReady = mongoose.connection.readyState === 1;
    // Readiness is stricter as it's used for load balancing
    res.status(dbReady ? 200 : 503).json({
        status: dbReady ? "ready" : "not_ready",
        database: dbReady ? "connected" : "disconnected",
    });
};

export const version = (_req: Request, res: Response) => {
    res.status(200).json({
        version: "2.0.0",
        env: config.NODE_ENV,
    });
};

// Nominatim (and occasionally Google Places) returns the same place twice
// for common queries — e.g. "Paris" comes back as "Paris, Île-de-France,
// France métropolitaine, France" two or three times with only whitespace/
// punctuation differences. Dedupe on a normalized display_name so the
// search-suggestion dropdown doesn't show visibly identical rows.
function dedupeByDisplayName<T extends { display_name?: string; lat?: string; lon?: string }>(results: T[]): T[] {
    const seen = new Set<string>();
    return results.filter((r) => {
        const key = String(r.display_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Haversine, in km — good enough for ranking nearby results, not for
// anything requiring geodesic precision.
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Sort by distance to a bias point when one's given, e.g. searching a chain
// name like "D-Mart" or "Domino's" otherwise returns branches from anywhere
// in the country in whatever order the geocoder felt like, no more useful
// than the nearest one. Nominatim's own viewbox param only nudges its
// ranking (soft preference), so an explicit sort is what actually guarantees
// nearest-first regardless of how it scored things internally.
function sortByDistanceIfBiased<T extends { lat?: string; lon?: string }>(results: T[], biasLat: number | null, biasLon: number | null): T[] {
    if (biasLat == null || biasLon == null) return results;
    return [...results].sort((a, b) => {
        const da = distanceKm(biasLat, biasLon, parseFloat(a.lat || '0'), parseFloat(a.lon || '0'));
        const db = distanceKm(biasLat, biasLon, parseFloat(b.lat || '0'), parseFloat(b.lon || '0'));
        return da - db;
    });
}

export const geocode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = req.query.q as string;
        if (!query) throw new BadRequestError("Missing query parameter 'q'");
        const biasLat = req.query.lat ? parseFloat(req.query.lat as string) : null;
        const biasLon = req.query.lon ? parseFloat(req.query.lon as string) : null;
        // Unbounded (no bounded=1) — a soft ranking preference toward this
        // box, not a hard filter, so a legitimately relevant distant result
        // still shows up if nothing local matches.
        const viewboxParam = (biasLat != null && biasLon != null)
            ? `&viewbox=${biasLon - 0.5},${biasLat + 0.5},${biasLon + 0.5},${biasLat - 0.5}`
            : '';

        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5${viewboxParam}`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "TripMate/2.0.0 (kasivasl2005@gmail.com)"
                }
            });

            if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                return res.status(200).json(sortByDistanceIfBiased(dedupeByDisplayName(data), biasLat, biasLon));
            }
            throw new Error("Nominatim returned no results");
        } catch (nominatimError: any) {
            console.warn(`[Geocode] Nominatim failed for "${query}", falling back to Google: ${nominatimError.message}`);

            const key = config.GOOGLE_API_KEY;
            if (!key) throw new Error("No geocoding fallback available");

            // Google's Geocoding API is a separate product from Places API and
            // isn't enabled on this GCP project (confirmed: REQUEST_DENIED /
            // "This API is not activated"). Places Text Search IS enabled and
            // already used successfully elsewhere in this codebase, and it
            // returns geometry.location for any query too — use that instead
            // of requiring a second API to be turned on.
            const gUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;
            const gRes = await fetch(gUrl);
            const gData = await gRes.json();

            if (gData.status !== "OK" || !Array.isArray(gData.results) || gData.results.length === 0) {
                console.warn(`[Geocode] Google fallback also failed for "${query}": ${gData.status} ${gData.error_message || ""}`);
                return res.status(200).json([]);
            }

            const mapped = gData.results.map((r: any) => ({
                lat: String(r.geometry.location.lat),
                lon: String(r.geometry.location.lng),
                display_name: r.formatted_address,
                name: r.name,
            }));
            return res.status(200).json(sortByDistanceIfBiased(dedupeByDisplayName(mapped), biasLat, biasLon));
        }
    } catch (error) {
        next(error);
    }
};

// ─── Protected endpoints (auth required) ──────────────────────────────────────

export const weatherProxy = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { layer, z, x, y } = req.params;
        const key = config.OPENWEATHER_API_KEY;
        if (!key) throw new BadRequestError("Weather API key missing");

        const url = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${key}`;
        const response = await fetch(url);
        if (!response.ok) throw new BadRequestError("Failed to fetch tile");

        const buffer = await response.arrayBuffer();
        res.setHeader("Content-Type", "image/png");
        res.send(Buffer.from(buffer));
    } catch (error) {
        next(error);
    }
};

// Hostnames this proxy will fetch on the user's behalf. Deliberately an
// allowlist, not a blocklist — the client only ever needs this for known
// OAuth-avatar CDNs (Google, GitHub), and an open proxy on an
// authenticated route is an SSRF vector into internal/cloud-metadata
// addresses otherwise.
const PROXY_IMAGE_ALLOWED_HOSTS = new Set([
    "lh3.googleusercontent.com",
    "avatars.githubusercontent.com",
]);

export const proxyImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const raw = String(req.query.url || "");
        if (!raw) throw new BadRequestError("url is required");

        let target: URL;
        try {
            target = new URL(raw);
        } catch {
            throw new BadRequestError("Invalid url");
        }

        if (target.protocol !== "https:") throw new BadRequestError("Only https URLs are allowed");
        if (!PROXY_IMAGE_ALLOWED_HOSTS.has(target.hostname)) throw new BadRequestError("Host not allowed");

        const response = await fetch(target.toString(), { redirect: "error" });
        if (!response.ok) throw new BadRequestError("Failed to fetch image");

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) throw new BadRequestError("Upstream did not return an image");

        const buffer = await response.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(Buffer.from(buffer));
    } catch (error) {
        next(error);
    }
};

export const getProactiveInsights = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const destination = String(req.query.destination || req.query.city || '');
        if (!destination) return res.json({ insights: [], suggestedPackingItems: [] });
        const aiUtils = new AiUtilitiesService();
        const result = await aiUtils.getProactiveInsights(destination, []);
        res.json(result);
    } catch (error) {
        next(error);
    }
};
export const latestCurrency = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const from = String(req.query.from || req.query.base || 'USD').toUpperCase();
        const to = req.query.to ? String(req.query.to).toUpperCase() : (req.query.symbols ? String(req.query.symbols).toUpperCase() : undefined);
        const amount = parseFloat(req.query.amount as string) || 1;

        if (to) {
            const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const response = await fetch(url, { headers: { 'User-Agent': 'TripMate/2.0.0' } });
            if (!response.ok) throw new Error("Currency service failed");
            const data = await response.json();
            const rate = (data.rates as Record<string, number>)?.[to] ?? 0;
            return res.status(200).json({
                rate,
                convertedAmount: Math.round(amount * rate * 100) / 100,
                currencyName: to,
                disclaimer: "Rates from European Central Bank via Frankfurter API"
            });
        }

        const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'TripMate/2.0.0' } });
        if (!response.ok) throw new Error("Currency service failed");
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
};

export const currencyHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const from = String(req.query.from || 'USD').toUpperCase();
        const to = String(req.query.to || 'EUR').toUpperCase();
        const days = Math.min(90, Math.max(7, parseInt(req.query.days as string) || 30));
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        const startStr = start.toISOString().split('T')[0];
        const url = `https://api.frankfurter.app/${startStr}..?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'TripMate/2.0.0' } });
        if (!response.ok) throw new Error("Currency history service failed");
        const data = await response.json();
        const entries = Object.entries((data.rates || {}) as Record<string, Record<string, number>>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, rates]) => ({
                date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                rate: rates[to] ?? 0,
            }));
        res.json(entries);
    } catch (error) {
        next(error);
    }
};

export const convertCurrency = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, from, to } = req.query;
        if (!amount || !from || !to) throw new BadRequestError("Missing required parameters");
        
        const aiUtils = new AiUtilitiesService();
        const result = await aiUtils.currency(
            Number(amount), 
            String(from), 
            String(to), 
            new Date().toISOString()
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
};

export const translateText = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { text, sourceLang, targetLang } = req.body;
        if (!text || !targetLang) throw new BadRequestError("Missing text or target language");

        const aiUtils = new AiUtilitiesService();
        const result = await aiUtils.translate(text, sourceLang || "auto", targetLang);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

export const getWeather = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { city, location, lat, lon } = req.query;
        // Accept city, location, or lat/lon
        const queryCity = (city || location) as string | undefined;
        let query: string;
        if (queryCity) {
            query = queryCity;
        } else if (lat && lon) {
            query = `${lat},${lon}`;
        } else {
            throw new BadRequestError("Missing city, location, or coordinates");
        }

        const aiUtils = new AiUtilitiesService();
        const result = await aiUtils.weather(query);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

const COUNTRY_SOS: Record<string, { police: string; medical: string; fire: string; common: string }> = {
    IN: { police: '100', medical: '108', fire: '101', common: '112' },
    US: { police: '911', medical: '911', fire: '911', common: '911' },
    GB: { police: '999', medical: '999', fire: '999', common: '999' },
    AU: { police: '000', medical: '000', fire: '000', common: '000' },
    CA: { police: '911', medical: '911', fire: '911', common: '911' },
    DE: { police: '110', medical: '112', fire: '112', common: '112' },
    FR: { police: '17', medical: '15', fire: '18', common: '112' },
    JP: { police: '110', medical: '119', fire: '119', common: '110' },
    CN: { police: '110', medical: '120', fire: '119', common: '110' },
    SG: { police: '999', medical: '995', fire: '995', common: '999' },
    AE: { police: '999', medical: '998', fire: '997', common: '999' },
    TH: { police: '191', medical: '1669', fire: '199', common: '191' },
    DEFAULT: { police: '112', medical: '112', fire: '112', common: '112' },
};

async function detectCountryCode(location: string): Promise<string> {
    try {
        const isCoords = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(location.trim());
        let url: string;
        if (isCoords) {
            const [lat, lon] = location.split(',');
            url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
        } else {
            url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1&addressdetails=1`;
        }
        const r = await fetch(url, { headers: { 'User-Agent': 'TripMate/2.0.0' } });
        if (!r.ok) return 'DEFAULT';
        const j = await r.json();
        const addr = isCoords ? j?.address : j?.[0]?.address;
        return (addr?.country_code || 'DEFAULT').toUpperCase();
    } catch {
        return 'DEFAULT';
    }
}

export const getEmergencyContacts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const location = (req.params.query && decodeURIComponent(req.params.query)) || String(req.query.location || req.query.q || '');
        if (!location) throw new BadRequestError("Missing location");

        const aiUtils = new AiUtilitiesService();
        const [services, countryCode] = await Promise.all([
            aiUtils.emergency(location),
            detectCountryCode(location),
        ]);

        const sos = COUNTRY_SOS[countryCode] || COUNTRY_SOS['DEFAULT'];
        res.json({
            services: services.map((s: any, i: number) => ({
                id: s.id || String(i),
                name: s.name,
                type: s.type,
                address: s.address || '',
                phone: s.phone || sos.police,
                distance: '—',
                latitude: s.coordinates?.lat || 0,
                longitude: s.coordinates?.lon || 0,
            })),
            countryCode,
            sosNumbers: { police: sos.police, medical: sos.medical, fire: sos.fire, common: sos.common },
        });
    } catch (error) {
        next(error);
    }
};

export const planTrip = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const aiUtils = new AiUtilitiesService();
        const result = await aiUtils.planTrip(req.body);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

export const reverseGeocode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) throw new BadRequestError("Missing lat or lon");

        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
            const response = await fetch(url, {
                headers: { "User-Agent": "TripMate/2.0.0 (kasivasl2005@gmail.com)" }
            });

            if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

            const data = await response.json();
            if (data && (data.display_name || data.address)) {
                return res.json(data);
            }
            throw new Error("Nominatim returned no result");
        } catch (nominatimError: any) {
            console.warn(`[ReverseGeocode] Nominatim failed for ${lat},${lon}, falling back to Google: ${nominatimError.message}`);

            const key = config.GOOGLE_API_KEY;
            if (!key) throw new Error("No reverse-geocoding fallback available");

            // Same reasoning as geocode(): the Geocoding API isn't enabled on
            // this GCP project. Nearby Search (Places API, enabled) works for
            // a rough reverse-geocode too — take the closest place's vicinity.
            const gUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=500&key=${key}`;
            const gRes = await fetch(gUrl);
            const gData = await gRes.json();

            if (gData.status !== "OK" || !Array.isArray(gData.results) || gData.results.length === 0) {
                console.warn(`[ReverseGeocode] Google fallback also failed for ${lat},${lon}: ${gData.status} ${gData.error_message || ""}`);
                return res.json({ display_name: "", lat, lon });
            }

            const top = gData.results[0];
            return res.json({
                lat: String(lat),
                lon: String(lon),
                display_name: top.vicinity || top.name || "",
            });
        }
    } catch (error) {
        next(error);
    }
};
