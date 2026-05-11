import winston from "winston";
import { config } from "../config";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, requestId }) => {
    return `${timestamp} [${level}] ${requestId ? `(ID: ${requestId})` : ""}: ${stack || message}`;
});

const isProd = config.NODE_ENV === "production";

const logger = winston.createLogger({
    level: isProd ? "info" : "debug",
    format: isProd
        ? combine(timestamp(), errors({ stack: true }), json())
        : combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), errors({ stack: true }), logFormat),
    transports: [
        new winston.transports.Console({
            format: isProd ? combine(timestamp(), errors({ stack: true }), json()) : combine(colorize(), logFormat),
        }),
    ],
});

export default logger;
