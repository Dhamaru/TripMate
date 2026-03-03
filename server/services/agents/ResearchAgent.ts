import { z } from "zod";

export class ResearchAgent {
    private placesService: any;
    private weatherService: any;

    constructor(services: { places?: any, weather?: any }) {
        this.placesService = services.places;
        this.weatherService = services.weather;
    }

    /**
     * Concurrently fetches all necessary context to ground the LLM in reality.
     */
    async gatherContext(destination: string, days: number, travelStyle: string): Promise<any> {
        const startTime = Date.now();
        console.log(`[ResearchAgent] Initiating context gathering for: ${destination}`);

        try {
            // 1. Fetch Location Coordinates (Geocoding)
            const geoResult = await this.geocodeDestination(destination);

            const contextFetchPromises = [];

            // 2. Fetch Ambient Context (Weather)
            if (this.weatherService && geoResult) {
                contextFetchPromises.push(
                    this.weatherService.getWeatherForLocation(geoResult.lat, geoResult.lon)
                        .catch(() => null) // Graceful degradation
                );
            } else {
                contextFetchPromises.push(Promise.resolve(null));
            }

            // 3. Fetch Top Points of Interest (Grounding Anchors)
            contextFetchPromises.push(
                this.fetchLocalAnchors(destination, travelStyle)
            );

            const [weatherContext, localAnchors] = await Promise.all(contextFetchPromises);

            const latency = Date.now() - startTime;
            console.log(`[ResearchAgent] Context gathered in ${latency}ms`);

            return {
                geo: geoResult,
                weather: weatherContext,
                anchors: localAnchors,
                telemetry: { latencyMs: latency }
            };

        } catch (error) {
            console.error(`[ResearchAgent] Critical failure during research phase:`, error);
            // Fallback: If research fails completely, return minimal context so Orchestrator doesn't crash
            return { geo: null, weather: null, anchors: [], error: 'Research degraded' };
        }
    }

    private async geocodeDestination(dest: string) {
        // Mock simulation of geocoding for MVP, would use Google Maps API natively
        return { lat: 0, lon: 0 };
    }

    private async fetchLocalAnchors(dest: string, style: string) {
        // Return high-level anchors the generator MUST use, preventing hallucination
        if (dest.toLowerCase().includes('hyderabad')) {
            return ['Charminar', 'Golconda Fort', 'Ramoji Film City'];
        }
        return []; // Fallback empty
    }
}
