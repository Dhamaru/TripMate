import { z } from "zod";
import "dotenv/config";
import crypto from "crypto";

// A random-per-process default instead of a fixed string — the old default
// ("your-jwt-secret-key") is a known, public value (it's right here in the
// repo). Any dev/CI/staging environment that forgot to set a real secret
// was silently signing every JWT with a string anyone can find on GitHub;
// production is already guarded (throws below), but non-production
// environments deserve better than a guessable default too.
const randomSecret = () => crypto.randomBytes(32).toString("hex");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional().default(""),
  GROQ_API_KEY: z.string().optional().default(""),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  GOOGLE_API_KEY: z.string().optional(),
  SESSION_SECRET: z.string().default(randomSecret),
  JWT_SECRET: z.string().default(randomSecret),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NVIDIA_API_KEY_1: z.string().optional(),
  NVIDIA_API_KEY_2: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  BACKEND_URL: z.string().optional(),
  OPENWEATHER_API_KEY: z.string().optional(),
  WEATHER_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_FROM_EMAIL: z.string().optional(),
  ADMIN_EMAIL: z.string().optional().default("kasivasi2005@gmail.com"),
  // Service-to-service secret for the automated feedback-triage routine —
  // deliberately NOT a user login, so no account password ever has to sit
  // in a scheduled cloud-agent's stored config. Unset by default so the
  // admin feedback endpoints fail closed until this is explicitly set.
  ADMIN_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
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
  GOOGLE_API_KEY:
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY,
};

const _config = envSchema.parse(processEnv);

const derivedConfig = {
  CSRF_ENABLED: _config.CSRF_ENABLED ?? _config.NODE_ENV === "production",
  // NVIDIA_API_KEY_2 (Llama) is the primary model; NVIDIA_API_KEY_1 (Qwen) is the fallback model.
  NVIDIA_API_KEY: _config.NVIDIA_API_KEY_2 || _config.NVIDIA_API_KEY_1,
};

// Transition placeholders to mandatory for production. Checks the RAW env
// var, not _config's already-defaulted value — since the default is now a
// random-per-process string (not a fixed known one), checking _config here
// would never catch a genuinely-unset var in production, it'd just silently
// run on a secret that's regenerated (and every existing JWT invalidated)
// on every single restart.
if (_config.NODE_ENV === "production") {
  const missingSecrets = [];

  if (!process.env.SESSION_SECRET) {
    missingSecrets.push("SESSION_SECRET");
  }

  if (!process.env.JWT_SECRET) {
    missingSecrets.push("JWT_SECRET");
  }

  if (missingSecrets.length > 0) {
    throw new Error(
      `CRITICAL: Missing or insecure secrets in production: ${missingSecrets.join(", ")}. ` +
        `You MUST set these environment variables to unique, secure strings.`,
    );
  }
}

export const config = { ..._config, ...derivedConfig };
export default config;
