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
            ...tokenBudgetSnapshot(i),
        };
    });
}

// ── Token-budget admission control ──────────────────────────────────────
// The circuit breaker above only reacts AFTER a provider fails — for Groq
// specifically, measured live against its real rate-limit headers, that
// failure is a hard 12,000-tokens/minute ceiling, and a single multi-tool
// conversation turn can burn most of that in one request (system prompt +
// tool schemas alone were ~2,800 tokens before any reply). Waiting for a
// 429 to happen wastes a full round-trip on a request that was never going
// to succeed. This tracks our own estimate of recent usage per provider so
// a request can be routed to a provider with real headroom BEFORE calling
// it, not after it fails.
const TPM_LIMITS: Record<number, number> = {
    0: 12_000, // Groq free tier — confirmed via x-ratelimit-limit-tokens header
    // NVIDIA slots (1, 2) have no confirmed token ceiling — their failures
    // observed so far are timeouts, not quota, so they're left untracked
    // (unlimited) here; the circuit breaker still protects against those.
};
const WINDOW_MS = 60_000;
const usageLog = new Map<number, { at: number; tokens: number }[]>();

/** Rough chars/4 estimate — good enough for admission control, doesn't
 * need to be exact since it's only deciding which provider to try first. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export function recordTokenUsage(modelIndex: number, tokens: number): void {
    if (!tokens || !(modelIndex in TPM_LIMITS)) return; // don't bother tracking untracked providers
    const now = Date.now();
    const log = usageLog.get(modelIndex) ?? [];
    log.push({ at: now, tokens });
    usageLog.set(modelIndex, log.filter((e) => now - e.at < WINDOW_MS));
}

function usedInWindow(modelIndex: number): number {
    const log = usageLog.get(modelIndex);
    if (!log) return 0;
    const now = Date.now();
    return log.filter((e) => now - e.at < WINDOW_MS).reduce((sum, e) => sum + e.tokens, 0);
}

/** True if this provider has no tracked limit, or has enough headroom left
 * in the current rolling window for a request of this estimated size. */
export function hasTokenBudget(modelIndex: number, estimatedTokens: number): boolean {
    const limit = TPM_LIMITS[modelIndex];
    if (limit === undefined) return true;
    return usedInWindow(modelIndex) + estimatedTokens <= limit;
}

function tokenBudgetSnapshot(modelIndex: number) {
    const limit = TPM_LIMITS[modelIndex];
    if (limit === undefined) return { tpmLimit: null, tpmUsed: null, tpmRemaining: null };
    const used = usedInWindow(modelIndex);
    return { tpmLimit: limit, tpmUsed: used, tpmRemaining: Math.max(0, limit - used) };
}
