import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { logError } from "@/lib/logger";
// Helper to attempt token refresh
export async function tryRefreshToken(): Promise<boolean> {
  try {
    const refreshRes = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      const newToken = data?.token;
      if (newToken) {
        (window as any).__authToken = newToken;
        return true;
      }
    }
  } catch (e) {
    console.error("Token refresh failed", e);
  }
  return false;
}

async function throwIfResNotOk(res: Response) {
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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = typeof window !== 'undefined' ? (window as any).__authToken || null : null;
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let body: string | FormData | undefined;
  if (data instanceof FormData) {
    body = data;
  } else if (data) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }

  // Initial request
  let res = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
    cache: "no-store",
  });

  // If unauthorized, attempt a single token refresh and retry
  if (res.status === 401) {
    console.debug("apiRequest received 401, attempting token refresh");
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = (window as any).__authToken;
      if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, {
        method,
        headers,
        body,
        credentials: "include",
        cache: "no-store",
      });
    }
  }

  // Return raw response; callers can inspect status.
  return res;
}


type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const getToken = () => typeof window !== 'undefined' ? (window as any).__authToken || null : null;
      let token = getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const qk = Array.isArray(queryKey) ? queryKey : [String(queryKey)];
      const [base, ...parts] = qk as any[];
      const url = [String(base), ...parts.map((p: any) => encodeURIComponent(String(p)))].join("/");

      let res = await fetch(url, {
        credentials: "include",
        headers,
        cache: "no-store",
      });

      if (res.status === 401) {
        try {
          const refreshRes = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            const newToken = refreshData?.token;
            if (newToken) {
              (window as any).__authToken = newToken;
              headers['Authorization'] = `Bearer ${newToken}`;
              res = await fetch(url, {
                credentials: "include",
                headers,
                cache: "no-store",
              });
            }
          }
        } catch (e) {
          console.error("Token refresh failed during query", e);
        }
      }

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
