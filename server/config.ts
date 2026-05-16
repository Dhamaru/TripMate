import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(5000),
    MONGODB_URI: z.string().min(1),
    OPENAI_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional().default(''),
    GROQ_API_KEY: z.string().optional().default(''),
    GOOGLE_API_KEY: z.string().optional(),
    SESSION_SECRET: z.string().default("your-session-secret-key"),
    JWT_SECRET: z.string().default("your-jwt-secret-key"),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    NVIDIA_API_KEY: z.string().optional(),
    FRONTEND_URL: z.string().optional(),
    BACKEND_URL: z.string().optional(),
    OPENWEATHER_API_KEY: z.string().optional(),
    WEATHER_API_KEY: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_FROM_EMAIL: z.string().optional(),
    TRANSLATE_API_URL: z.string().optional(),
    TRANSLATE_API_KEY: z.string().optional(),
    CLUSTER: z.coerce.number().optional(),
    CLUSTER_WORKERS: z.coerce.number().optional(),
    BODY_JSON_LIMIT: z.string().default("1mb"),
    BODY_URLENCODED_LIMIT: z.string().default("1mb"),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    RATE_LIMIT_MAX: z.coerce.number().optional(),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().optional(),
    AI_RATE_LIMIT_MAX: z.coerce.number().optional(),
    AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().optional(),
    GENERATION_RATE_LIMIT_MAX: z.coerce.number().optional(),
    GENERATION_RATE_LIMIT_WINDOW_MS: z.coerce.number().optional(),
    CSRF_ENABLED: z.coerce.boolean().optional(),
    ACCOUNT_LOCK_MAX_ATTEMPTS: z.coerce.number().default(5),
    ACCOUNT_LOCK_DURATION_MS: z.coerce.number().default(15 * 60 * 1000),
});

const processEnv = {
    ...process.env,
    // Standardize names
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.Google_Gemini_Key,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY,
};

const _config = envSchema.parse(processEnv);

const derivedConfig = {
    CSRF_ENABLED: _config.CSRF_ENABLED ?? _config.NODE_ENV === "production",
};

// Transition placeholders to mandatory for production
if (_config.NODE_ENV === "production") {
    const missingSecrets = [];

    if (!_config.SESSION_SECRET || _config.SESSION_SECRET === "your-session-secret-key") {
        missingSecrets.push("SESSION_SECRET");
    }

    if (!_config.JWT_SECRET || _config.JWT_SECRET === "your-jwt-secret-key") {
        missingSecrets.push("JWT_SECRET");
    }

    if (missingSecrets.length > 0) {
        throw new Error(
            `CRITICAL: Missing or insecure secrets in production: ${missingSecrets.join(", ")}. ` +
            `You MUST set these environment variables to unique, secure strings.`
        );
    }
}

export const config = { ..._config, ...derivedConfig };
export default config;
