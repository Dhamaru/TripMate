import { isIP } from "node:net";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config";

/**
 * Production runs behind Cloudflare + Render's load balancer, so req.ip
 * (even with trust proxy) resolved to an internal 10.x address shared by
 * every visitor: all users fell into one rate-limit bucket and blocked each
 * other. Cloudflare sets CF-Connecting-IP itself (overwriting any client
 * value), so in production it is the real client address. Shadowing req.ip
 * fixes every consumer at once — rate limiters, session IP records, logs.
 */
export function clientIpMiddleware(req: Request, _res: Response, next: NextFunction) {
  const cf = req.headers["cf-connecting-ip"];
  if (config.NODE_ENV === "production" && typeof cf === "string" && isIP(cf)) {
    Object.defineProperty(req, "ip", { value: cf, configurable: true });
  }
  next();
}
