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
            // 1. Fetch Location Coordinates (Geocoding - Using FREE Nominatim/OSM)
            const geoResult = await this.geocodeDestination(destination);

            const contextFetchPromises = [];

            // 2. Fetch Ambient Context (Weather)
            if (this.weatherService && geoResult && geoResult.lat !== 0) {
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
            console.log(`[ResearchAgent] Context gathered in ${latency}ms for ${destination}`);

            return {
                geo: geoResult,
                weather: weatherContext,
                anchors: localAnchors,
                telemetry: { latencyMs: latency }
            };

        } catch (error) {
            console.error(`[ResearchAgent] Critical failure during research phase:`, error);
            // Fallback: If research fails completely, return minimal context so Orchestrator doesn't crash
            return { geo: { lat: 0, lon: 0 }, weather: null, anchors: [], error: 'Research degraded' };
        }
    }

    private async geocodeDestination(dest: string) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(dest)}&limit=1`;
            const response = await fetch(url, {
                headers: { "User-Agent": "TripMate/2.0.0 (kasivasl2005@gmail.com)" }
            });
            if (!response.ok) throw new Error("Geocoding failed");
            const data = await response.json();
            if (data && data.length > 0) {
                return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
            }
        } catch (e) {
            console.warn(`[ResearchAgent] Geocoding fallback:`, e);
        }
        return { lat: 0, lon: 0 };
    }

    private async fetchLocalAnchors(dest: string, style: string) {
        // If we have a dedicated places service (e.g. Google Places), use it
        if (this.placesService && typeof this.placesService.getPointsOfInterest === 'function') {
            return await this.placesService.getPointsOfInterest(dest, style);
        }

        // Fallback: Hardcoded anchors for major cities to prevent total hallucination
        const anchorMap: Record<string, string[]> = {
            'hyderabad': ['Charminar', 'Golconda Fort', 'Ramoji Film City', 'Birla Mandir'],
            'chennai': ['Marina Beach', 'Kapaleeshwarar Temple', 'Fort St. George', 'Santhome Cathedral'],
            'tokyo': ['Tokyo Tower', 'Shibuya Crossing', 'Senso-ji Temple', 'Meiji Jingu'],
            'paris': ['Eiffel Tower', 'Louvre Museum', 'Notre-Dame Cathedral', 'Arc de Triomphe'],
            'london': ['Big Ben', 'London Eye', 'Tower Bridge', 'British Museum'],
            'new york': ['Statue of Liberty', 'Central Park', 'Times Square', 'Empire State Building']
        };

        const normalizedDest = dest.toLowerCase();
        for (const city in anchorMap) {
            if (normalizedDest.includes(city)) return anchorMap[city];
        }

        return []; // Fallback empty
    }
}
