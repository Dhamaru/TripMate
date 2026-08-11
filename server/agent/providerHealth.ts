// Atlas Provider Health — in-memory circuit breaker over the model fallback
// chain. Previously every single chat request retried every dead provider
// from scratch (25s timeout each) before reaching a working one — this was
// the actual cause of the ~30s reply latency during this week's "all 5
// creds dead" outage, and nothing surfaced that state until a user sent a
// screenshot. Tracking consecutive failures per model lets a known-dead
// provider be skipped for a cooldown window instead of burning its full
// timeout on every request, and exposes a snapshot for a health endpoint.

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

interface ProviderState {
    consecutiveFailures: number;
    openUntil: number | null; // circuit "open" (skip this provider) until this timestamp
    lastError: string | null;
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
}

const state = new Map<number, ProviderState>();

function getState(modelIndex: number): ProviderState {
    let s = state.get(modelIndex);
    if (!s) {
        s = { consecutiveFailures: 0, openUntil: null, lastError: null, lastCheckedAt: null, lastSuccessAt: null };
        state.set(modelIndex, s);
    }
    return s;
}

export function isProviderOpen(modelIndex: number): boolean {
    const s = getState(modelIndex);
    if (s.openUntil === null) return false;
    if (Date.now() >= s.openUntil) {
        // Cooldown elapsed — allow one probe attempt through (half-open).
        s.openUntil = null;
        return false;
    }
    return true;
}

export function recordSuccess(modelIndex: number): void {
    const s = getState(modelIndex);
    s.consecutiveFailures = 0;
    s.openUntil = null;
    s.lastCheckedAt = new Date().toISOString();
    s.lastSuccessAt = s.lastCheckedAt;
}

export function recordFailure(modelIndex: number, reason: string): void {
    const s = getState(modelIndex);
    s.consecutiveFailures++;
    s.lastError = reason;
    s.lastCheckedAt = new Date().toISOString();
    if (s.consecutiveFailures >= FAILURE_THRESHOLD) {
        s.openUntil = Date.now() + COOLDOWN_MS;
    }
}

export function getHealthSnapshot(models: string[], baseUrls: string[]) {
    return models.map((model, i) => {
        const s = getState(i);
        return {
            model,
            baseUrl: baseUrls[i],
            healthy: !isProviderOpen(i),
            consecutiveFailures: s.consecutiveFailures,
            lastError: s.lastError,
            lastCheckedAt: s.lastCheckedAt,
            lastSuccessAt: s.lastSuccessAt,
        };
    });
}
