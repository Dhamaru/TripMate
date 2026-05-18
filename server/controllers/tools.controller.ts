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

export const geocode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = req.query.q as string;
        if (!query) throw new BadRequestError("Missing query parameter 'q'");

        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": "TripMate/2.0.0 (kasivasl2005@gmail.com)"
            }
        });
        
        if (!response.ok) throw new Error("External geocoding service failed");

        const data = await response.json();
        res.status(200).json(data);
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

export const getProactiveInsights = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        res.json({ insights: ["Pack sunscreen!", "Check for flight delays"] });
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
            .map(([date, rates]) => ({
                date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                rate: rates[to] ?? 0,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
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
        const { text, from, to } = req.body;
        if (!text || !to) throw new BadRequestError("Missing text or target language");
        
        const aiUtils = new AiUtilitiesService();
        const result = await aiUtils.translate(text, from || "auto", to);
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

        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
        const response = await fetch(url, {
            headers: { "User-Agent": "TripMate/2.0.0" }
        });
        
        if (!response.ok) throw new Error("Reverse geocoding failed");

        const data = await response.json();
        res.json(data);
    } catch (error) {
        next(error);
    }
};
