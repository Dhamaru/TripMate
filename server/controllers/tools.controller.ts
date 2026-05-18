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
        const { city, lat, lon } = req.query;
        let queryCity = city as string;
        
        if (!queryCity && lat && lon) {
            // Reverse geocode if needed, or just search by lat/lon if service supports it
            // For now let's assume city is provided or we use a default
            queryCity = `${lat},${lon}`;
        }
        
        if (!queryCity) throw new BadRequestError("Missing city or coordinates");

        const aiUtils = new AiUtilitiesService();
        const result = await aiUtils.weather(queryCity);
        res.json(result);
    } catch (error) {
        next(error);
    }
};

export const getEmergencyContacts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const location = (req.params.query && decodeURIComponent(req.params.query)) || String(req.query.location || req.query.q || '');
        if (!location) throw new BadRequestError("Missing location");

        const aiUtils = new AiUtilitiesService();
        const result = await aiUtils.emergency(location);
        res.json(result);
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
