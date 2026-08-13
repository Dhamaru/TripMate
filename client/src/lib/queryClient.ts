import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { logError } from "@/lib/logger";

export async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    if (res.status === 401) {
      try { logError("api_unauthorized", { url: res.url, status: res.status, body: text }); } catch { }
    } else {
      try { logError("api_error", { url: res.url, status: res.status, body: text }); } catch { }
    }
    throw new Error(`${res.status}: ${text}`);
  }
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
): Promise<Response> {
  const headers: Record<string, string> = {};

  let body: string | FormData | undefined;
  if (data instanceof FormData) {
    body = data;
  } else if (data) {
    headers['Content-Type'] = 'application/json';
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
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
    cache: "no-store",
  });

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const qk = Array.isArray(queryKey) ? queryKey : [String(queryKey)];
      const [base, ...parts] = qk as any[];
      const url = [String(base), ...parts.map((p: any) => encodeURIComponent(String(p)))].join("/");

      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });

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
