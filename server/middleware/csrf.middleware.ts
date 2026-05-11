import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { ForbiddenError } from "../errors";

const CSRF_COOKIE = "XSRF-TOKEN";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function ensureCsrfCookie(req: Request, res: Response) {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (existing) return existing;

  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return token;
}

export const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!config.CSRF_ENABLED) return next();

  const csrfToken = ensureCsrfCookie(req, res);
  if (SAFE_METHODS.has(req.method)) return next();

  const hasAuthHeader = Boolean(req.headers.authorization);
  const hasCookieAuth = Boolean(req.cookies?.token || req.cookies?.sid);

  if (!hasCookieAuth || hasAuthHeader) return next();

  const headerToken = (req.headers["x-csrf-token"] || req.headers["x-xsrf-token"]) as string | undefined;
  if (!headerToken || headerToken !== csrfToken) {
    return next(new ForbiddenError("Invalid CSRF token"));
  }

  return next();
};

export const getCsrfToken = (req: Request, res: Response) => {
  const token = req.cookies?.[CSRF_COOKIE] || ensureCsrfCookie(req, res);
  res.status(200).json({ csrfToken: token });
};
