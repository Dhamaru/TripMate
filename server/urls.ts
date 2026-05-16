import type { Request } from "express";
import { config } from "./config";

const DEFAULT_PRODUCTION_URL = "https://tripmate-ylt6.onrender.com";
const DEFAULT_DEVELOPMENT_URL = "http://localhost:5000";

function trimTrailingSlash(url?: string) {
  return url?.replace(/\/+$/, "");
}

function getRequestOrigin(req?: Request) {
  if (!req) return undefined;

  const forwardedProto = req.get("x-forwarded-proto");
  const protocol = forwardedProto?.split(",")[0]?.trim() || req.protocol;
  const host = req.get("x-forwarded-host") || req.get("host");

  return host ? `${protocol}://${host}` : undefined;
}

function getDefaultOrigin() {
  return config.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_URL
    : DEFAULT_DEVELOPMENT_URL;
}

export function getFrontendBaseUrl(req?: Request) {
  return (
    trimTrailingSlash(config.FRONTEND_URL) ||
    getRequestOrigin(req) ||
    getDefaultOrigin()
  );
}

export function getBackendBaseUrl(req?: Request) {
  return (
    trimTrailingSlash(config.BACKEND_URL) ||
    getRequestOrigin(req) ||
    getFrontendBaseUrl(req)
  );
}
