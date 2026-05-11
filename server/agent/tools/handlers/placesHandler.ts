// Places Handler — REUSES existing Google Places integration
// Does NOT duplicate Google Places API calls

import type { ToolResult } from '../../types';
import { cacheService, CACHE_TTL } from '../../../cache';

/**
 * Places handler that delegates to the existing AiUtilitiesService.searchPlaces().
 * Accepts the service instance at call time.
 */
export async function placesHandler(
    args: { query: string; category?: string; location?: string; maxResults?: number },
    deps: { aiService: { searchPlaces: (query: string, timeoutMs?: number) => Promise<any[]> } }
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const query = (args.query || '').trim();
        if (!query) {
            return { success: false, error: 'Search query is required', durationMs: Date.now() - start };
        }

        // Build enriched query with category + location context
        let enrichedQuery = query;
        if (args.category && args.category !== 'general' && !query.toLowerCase().includes(args.category)) {
            enrichedQuery = `${args.category} ${query}`;
        }
        if (args.location && !query.toLowerCase().includes(args.location.toLowerCase())) {
            enrichedQuery = `${enrichedQuery} in ${args.location}`;
        }

        const maxResults = Math.min(args.maxResults || 5, 10);
        const cacheKey = `places:${enrichedQuery.toLowerCase()}:${maxResults}`;
        const cachedResult = cacheService.get<{ query: string; resultCount: number; places: unknown[] }>(cacheKey);
        if (cachedResult) {
            return { success: true, data: cachedResult, durationMs: 0 };
        }

        // Delegate to existing AiUtilitiesService.searchPlaces() — no duplication
        const results = await deps.aiService.searchPlaces(enrichedQuery, 15000);
        const trimmed = (results || []).slice(0, maxResults);

        const responseData = {
            query: enrichedQuery,
            resultCount: trimmed.length,
            places: trimmed.map((place: { name?: string; formatted_address?: string; vicinity?: string; rating?: number; price_level?: number; geometry?: { location?: { lat?: number; lng?: number } }; types?: string[] }) => ({
                name: place.name || '',
                address: place.formatted_address || place.vicinity || '',
                rating: place.rating || null,
                priceLevel: place.price_level || null,
                lat: place.geometry?.location?.lat || null,
                lon: place.geometry?.location?.lng || null,
                types: (place.types || []).slice(0, 3),
            })),
        };
        cacheService.set(cacheKey, responseData, CACHE_TTL.PLACES);
        return { success: true, data: responseData, durationMs: Date.now() - start };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Place search failed', durationMs: Date.now() - start };
    }
}
