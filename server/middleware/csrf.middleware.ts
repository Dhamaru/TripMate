import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { ForbiddenError } from "../errors";
import { allowedOrigins } from "./security.middleware";

const isProd = config.NODE_ENV === "production";

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

  const headerToken = (req.headers["x-csrf-token"] || req.headers["x-xsrf-token"]) as
    string | undefined;
  if (!headerToken || headerToken !== csrfToken) {
    return next(new ForbiddenError("Invalid CSRF token"));
  }

  return next();
};

export const getCsrfToken = (req: Request, res: Response) => {
  const token = req.cookies?.[CSRF_COOKIE] || ensureCsrfCookie(req, res);
  res.status(200).json({ csrfToken: token });
};

// Atlas's chat/stream route (server/routes/agent.routes.ts) has to be a
// real GET — it's opened with the browser's native EventSource, which
// cannot send a request body, a custom header, or use any method but GET
// — so it can't carry the token-header CSRF check above (that check
// exists specifically because SAFE_METHODS always skips GET). That made
// it exploitable: the auth cookie is `sameSite: "lax"`, which IS sent on
// a top-level cross-site navigation, so a malicious page doing
// `window.location = ".../chat/stream?message=..."` runs Atlas — with
// unconfirmed destructive tools included — as the victim. A real GET
// EventSource request and a cross-site top-level navigation are
// distinguishable without touching the client at all: browsers attach
// Fetch Metadata headers (forbidden headers — a page's own JS cannot set
// or spoof them) to every request, and EventSource's is
// Sec-Fetch-Mode: cors / Sec-Fetch-Site: same-origin, while a navigation
// is Sec-Fetch-Mode: navigate / Sec-Fetch-Site: cross-site. Reject the
// navigation shape specifically. Fails open when the headers are absent
// (very old browsers, or non-browser API clients) rather than breaking a
// legitimate integration on a signal that only recent browsers send —
// those clients aren't exposed to this particular attack vector anyway,
// since it depends on modern SameSite=Lax cookie behavior in the first
// place.
export const requireSameOriginFetch = (req: Request, res: Response, next: NextFunction) => {
  const mode = req.headers["sec-fetch-mode"] as string | undefined;
  const site = req.headers["sec-fetch-site"] as string | undefined;
  if (mode === "navigate" || site === "cross-site") {
    return next(new ForbiddenError("This endpoint cannot be reached via cross-site navigation"));
  }
  // Code-review flagged a real residual gap on the first pass: this only
  // rejected "cross-site", but `Sec-Fetch-Site: same-site` is also
  // attacker-reachable — SameSite=Lax cookies ARE sent on same-site
  // requests, so any sibling subdomain of the same registrable domain
  // could still drive this endpoint with credentials. That's only
  // theoretical here because onrender.com is a public suffix (a real
  // sibling *.onrender.com computes as cross-site, not same-site) — but
  // it stops being theoretical the moment this app moves to a custom
  // apex domain with its own subdomains. Checking Origin against the
  // same allowlist corsMiddleware already trusts closes that gap without
  // breaking the legitimate case (a dev frontend on a different port,
  // which is same-site but a different origin) — only reject when an
  // Origin header is actually present and doesn't match; browsers don't
  // reliably send Origin on a plain same-origin GET, so absence isn't
  // itself a signal.
  const origin = req.headers.origin as string | undefined;
  if (origin && !allowedOrigins.includes(origin)) {
    const isDevLocal =
      !isProd && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"));
    if (!isDevLocal) {
      return next(new ForbiddenError("This endpoint cannot be reached from this origin"));
    }
  }
  return next();
};
