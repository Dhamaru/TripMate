import { Request, Response, NextFunction } from "express";
import { CrowdDensityModel } from "@shared/schema";
import { BadRequestError } from "../errors";

export const getDensity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Return latest reports within the last 7 days (managed by TTL index but good to filter here too)
        const reports = await CrowdDensityModel.find({
            timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }).sort({ timestamp: -1 });
        
        res.json({ reports });
    } catch (error) {
        next(error);
    }
};

export const reportDensity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { latitude, longitude, density, placeId } = req.body;
        
        if (latitude === undefined || longitude === undefined || density === undefined) {
            throw new BadRequestError("Latitude, longitude and density are required");
        }

        const report = await CrowdDensityModel.create({
            latitude,
            longitude,
            density,
            placeId,
            source: "user-report",
            timestamp: new Date()
        });

        res.status(201).json(report);
    } catch (error) {
        next(error);
    }
};

export const seedCrowd = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { lat, lon, radius = 0.05, count = 10 } = req.body;
        
        if (lat === undefined || lon === undefined) {
            throw new BadRequestError("Base lat and lon are required for seeding");
        }

        const reports = [];
        for (let i = 0; i < count; i++) {
            reports.push({
                latitude: lat + (Math.random() - 0.5) * radius * 2,
                longitude: lon + (Math.random() - 0.5) * radius * 2,
                density: Math.floor(Math.random() * 8) + 2, // 2-10
                source: "external-api",
                timestamp: new Date()
            });
        }

        await CrowdDensityModel.insertMany(reports);
        res.json({ success: true, message: `Seeded ${count} reports` });
    } catch (error) {
        next(error);
    }
};
