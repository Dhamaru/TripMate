type LogPayload = Record<string, any> | undefined;

// Duplicated from queryClient.ts's readCookie/getCsrfToken rather than
// imported — queryClient.ts already imports logError from this file, and
// importing back from it here would create a circular module dependency.
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// After a 429 the server is telling us to back off; stop sending logs for a
// minute instead of filling the console with failed requests.
let pausedUntil = 0;

async function send(url: string, body: any) {
  if (Date.now() < pausedUntil) return;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const csrfToken = getCsrfToken();
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "include",
      keepalive: true,
    });
    if (res.status === 429) pausedUntil = Date.now() + 60_000;
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
