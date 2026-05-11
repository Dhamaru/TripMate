import helmet from 'helmet'
import cors from 'cors'
import mongoSanitize from 'express-mongo-sanitize'
import hpp from 'hpp'
import { config } from '../config'

const isProd = config.NODE_ENV === "production";

const devCsp = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://replit.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
    "img-src": ["'self'", "data:", "https:", "blob:", "https://*.tile.openstreetmap.org", "https://cdnjs.cloudflare.com"],
    "connect-src": [
        "'self'",
        "https://api.groq.com",
        "https://generativelanguage.googleapis.com",
        "https://maps.googleapis.com",
        "https://api.open-meteo.com",
        "https://api.frankfurter.app",
        "wss:",
        "ws:",
    ],
    "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
};

const prodCsp = {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
    "img-src": ["'self'", "data:", "https:", "blob:", "https://*.tile.openstreetmap.org", "https://cdnjs.cloudflare.com"],
    "connect-src": [
        "'self'",
        "https://api.groq.com",
        "https://generativelanguage.googleapis.com",
        "https://maps.googleapis.com",
        "https://api.open-meteo.com",
        "https://api.frankfurter.app",
        "wss:",
    ],
    "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
};

export const helmetMiddleware = helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: isProd ? prodCsp : devCsp,
    },
    crossOriginEmbedderPolicy: false,
})

const extraOrigins = (config.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = [
    'http://localhost:5000',
    'http://localhost:5001',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
    config.FRONTEND_URL,
    ...extraOrigins,
].filter(Boolean) as string[];

export const corsMiddleware = cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        if (allowedOrigins.includes(origin)) return callback(null, true)
        if (!isProd && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
            return callback(null, true)
        }
        callback(new Error(`CORS: Origin ${origin} not allowed`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token', 'X-XSRF-Token'],
    exposedHeaders: ['X-Request-ID', 'X-CSRF-Token'],
})

export const mongoSanitizeMiddleware = mongoSanitize({ replaceWith: '_' })

export const hppMiddleware = hpp({
    whitelist: ['travelStyle', 'status', 'sort'],
})
