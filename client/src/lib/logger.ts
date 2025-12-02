type LogPayload = Record<string, any> | undefined;

async function send(url: string, body: any) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

