// Emergency Handler — REUSES existing AiUtilitiesService.emergency()
// Does NOT duplicate Gemini API calls

import type { ToolResult } from '../../types';
import { cacheService, CACHE_TTL } from '../../../cache';

/**
 * Emergency handler that delegates to the existing AiUtilitiesService.
 * Accepts the service instance at call time to avoid circular dependency.
 */
export async function emergencyHandler(
    args: { destination: string; infoType?: string },
    deps: { aiService: { emergency: (location: string) => Promise<unknown> } }
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const destination = (args.destination || '').trim();
        const infoType = args.infoType || 'all';

        if (!destination) {
            return { success: false, error: 'Destination is required', durationMs: Date.now() - start };
        }

        const cacheKey = `emergency:${destination.toLowerCase()}:${infoType}`;
        const cached = cacheService.get<unknown>(cacheKey);
        if (cached !== undefined) {
            return { success: true, data: cached, durationMs: Date.now() - start };
        }

        // Delegate to existing AiUtilitiesService.emergency() — no duplication
        const result = await deps.aiService.emergency(destination);

        // Filter by infoType if not 'all'
        let filtered = result;
        if (infoType !== 'all' && Array.isArray(result)) {
            filtered = (result as Array<{ type?: string }>).filter(
                (item) => item.type?.toLowerCase() === infoType.toLowerCase()
            );
        }

        cacheService.set(cacheKey, filtered, CACHE_TTL.EMERGENCY);
        return { success: true, data: filtered, durationMs: Date.now() - start };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Emergency info fetch failed', durationMs: Date.now() - start };
    }
}
