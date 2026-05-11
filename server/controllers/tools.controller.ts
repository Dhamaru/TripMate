import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { BadRequestError } from "../errors";
import mongoose from "mongoose";
import os from "os";

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
    console.log("[Debug] latestCurrency hit", req.url);
    try {
        const { base = 'USD', symbols } = req.query;
        let url = `https://api.frankfurter.app/latest?from=${base}`;
        if (symbols) url += `&to=${symbols}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error("Currency service failed");

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
};
