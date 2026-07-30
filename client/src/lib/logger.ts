type LogPayload = Record<string, any> | undefined;

// Duplicated from queryClient.ts's readCookie/getCsrfToken rather than
// imported — queryClient.ts already imports logError from this file, and
// importing back from it here would create a circular module dependency.
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function send(url: string, body: any) {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const csrfToken = getCsrfToken();
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "include",
      keepalive: true,
    });
  } catch {}
}

export function logInfo(event: string, payload?: LogPayload) {
  if (import.meta.env.DEV) console.info(`[info] ${event}`, payload || {});
  send("/api/v1/logs/info", { event, payload, ts: Date.now() });
}

export function logError(event: string, payload?: LogPayload) {
  if (import.meta.env.DEV) console.error(`[error] ${event}`, payload || {});
  send("/api/v1/logs/error", { event, payload, ts: Date.now() });
}

