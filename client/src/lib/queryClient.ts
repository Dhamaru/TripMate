import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { logError } from "@/lib/logger";

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
  const headers: Record<string, string> = {};

  let body: string | FormData | undefined;
  if (data instanceof FormData) {
    body = data;
  } else if (data) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
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
