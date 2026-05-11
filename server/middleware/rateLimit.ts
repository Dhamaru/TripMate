import rateLimit from "express-rate-limit";
import { config } from "../config";
import { BadRequestError } from "../errors";

export const rateLimitMiddleware = (limit = 100, windowMs = 15 * 60 * 1000) => {
    return rateLimit({
        windowMs,
        max: limit,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: "Too many requests, please try again later." },
        skip: (req) => config.NODE_ENV === "development",
    });
};

export const aiRateLimit = rateLimitMiddleware(20, 60 * 60 * 1000); // 20 requests per hour for AI tools
