import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { logError } from "@/lib/logger";

/**
 * What to show a person for a failed request. Server errors carry a short
 * user-facing `error` message for 4xx (validation, conflicts, limits); 5xx,
 * empty or HTML bodies get a plain sentence instead of the raw
 * "500: {...}" text that used to reach toasts.
 */
export function friendlyMessage(status: number, body: string): string {
  let msg = "";
  try {
    const parsed = JSON.parse(body);
    msg = String(parsed?.error || parsed?.message || "");
  } catch {}
  const usable = msg && msg.length <= 200 && !/[{<]/.test(msg);
  if (status >= 500 || status === 0) return "Something went wrong on our side. Please try again.";
  if (status === 401) return usable ? msg : "Your session has expired. Please sign in again.";
  if (status === 429)
    return usable ? msg : "Too many requests. Please wait a moment and try again.";
  if (usable) return msg;
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That couldn't be found. It may have been deleted.";
  return "That didn't work. Please try again.";
}

export async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    if (res.status === 401) {
      try {
        logError("api_unauthorized", { url: res.url, status: res.status, body: text });
      } catch {}
    } else {
      try {
        logError("api_error", { url: res.url, status: res.status, body: text });
      } catch {}
    }
    throw new ApiRequestError(res.status, friendlyMessage(res.status, text));
  }
}

// A session that expires mid-use used to leave pages silently broken —
// the auth check only ran on app load. A 401 from any non-auth call now
// asks authStore to re-verify (an event, not an import: authStore already
// imports this module). Re-verification means a stray 401 never logs out
// a valid session.
let lastUnauthorizedPing = 0;
function noteUnauthorized(res: Response) {
  if (res.status !== 401 || res.url.includes("/api/v1/auth/")) return;
  const now = Date.now();
  if (now - lastUnauthorizedPing < 10_000) return;
  lastUnauthorizedPing = now;
  window.dispatchEvent(new Event("tripmate:unauthorized"));
}

const CSRF_COOKIE = "XSRF-TOKEN";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** The CSRF token the server expects echoed back as X-CSRF-Token on mutating requests. */
export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  timeoutMs = 150000,
): Promise<Response> {
  const headers: Record<string, string> = {};

  let body: string | FormData | undefined;
  if (data instanceof FormData) {
    body = data;
  } else if (data) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(data);
  }

  // The server's CSRF middleware uses the double-submit-cookie pattern: it
  // sets an XSRF-TOKEN cookie and requires that same value echoed back in an
  // X-CSRF-Token header on every mutating request. Axios does this
  // automatically for cookie-based auth; plain fetch (this function) does
  // not, so every non-GET call through apiRequest was silently 403ing with
  // "Invalid CSRF token" whenever CSRF protection is enabled (production by
  // default) — this was never caught locally because CSRF is off in dev.
  if (!SAFE_METHODS.has(method.toUpperCase())) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    noteUnauthorized(res);
    return res;
  } catch (e: any) {
    // "signal is aborted without reason" / "Failed to fetch" reached toasts.
    const err = new Error(
      e?.name === "AbortError"
        ? "This is taking too long. Check your connection and try again."
        : "Can't reach TripMate. Check your connection and try again.",
    );
    err.name = e?.name || "Error";
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** A failed apiRequestJson call -- carries the HTTP status so callers can
 * tell a 401 (not logged in) apart from a 404 (really doesn't exist) apart
 * from a network blip, the way `e instanceof Error` alone can't. */
export class ApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** apiRequest + ok-check + JSON parse, throwing ApiRequestError on failure. */
export async function apiRequestJson<T = any>(
  method: string,
  url: string,
  data?: unknown,
): Promise<T> {
  const res = await apiRequest(method, url, data);
  if (!res.ok) {
    const text = (await res.text().catch(() => "")) || res.statusText;
    throw new ApiRequestError(res.status, friendlyMessage(res.status, text));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const qk = Array.isArray(queryKey) ? queryKey : [String(queryKey)];
    const [base, ...parts] = qk as any[];
    const url = [String(base), ...parts.map((p: any) => encodeURIComponent(String(p)))].join("/");

    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      // A stalled connection otherwise spins forever (share page) — fail so
      // the page can show an error and a retry.
      signal: AbortSignal.timeout(30_000),
    });

    noteUnauthorized(res);
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/** Invalidate every trips query, including ones keyed on a full URL string like '/api/v1/trips?light=true' (prefix-array matching would miss those). */
export function invalidateTrips() {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/v1/trips"),
  });
}
