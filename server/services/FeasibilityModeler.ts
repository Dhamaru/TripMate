export interface FeasibilityMetrics {
    totalDistanceKm: number;
    totalTransitTimeMin: number;
    fatigueScore: number;
    budgetVariance: number;
}

export class FeasibilityModeler {
    private baseFatigueScores: Record<string, number> = {
        "sightseeing": 2,
        "museum": 1.5,
        "park": 1,
        "temple": 1.5,
        "restaurant": 0,
        "cafe": 0,
        "market": 2.5
    };

    // Phase 3: Geospatial Caching Layer
    // In production, this can map directly to Redis.
    private static distanceCache = new Map<string, number>();

    /**
     * Calculates the Haversine distance with in-memory caching
     */
    private getCachedDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const cacheKey = `${lat1},${lon1}|${lat2},${lon2}`;
        const reverseKey = `${lat2},${lon2}|${lat1},${lon1}`; // distance is symmetric

        if (FeasibilityModeler.distanceCache.has(cacheKey)) {
            return FeasibilityModeler.distanceCache.get(cacheKey)!;
        }
        if (FeasibilityModeler.distanceCache.has(reverseKey)) {
            return FeasibilityModeler.distanceCache.get(reverseKey)!;
        }

        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        FeasibilityModeler.distanceCache.set(cacheKey, distance);
        return distance;
    }

    public calculateFatigueScore(activities: any[], travelStyle: string): number {
        let score = 0;
        for (const act of activities) {
            score += this.baseFatigueScores[act.type] || 1;
        }

        // Adjusted by travelStyle
        if (travelStyle === "adventure") score *= 0.8;
        if (travelStyle === "relaxed") score *= 1.5;

        return score;
    }

    public async getDistanceMatrix(points: { lat: number, lon: number }[]): Promise<any> {
        // Utilize google distance matrix or haversine for realistic constraints
        return {};
    }

    public validateCostEnvelope(planCost: any, budgetParams: { budget?: number, currency: string, baselineCityCost: number }): boolean {
        if (!budgetParams.budget) return true;

        // Check if the plan physically meets the threshold envelope
        const delta = (planCost.total - budgetParams.budget) / budgetParams.budget;
        return delta <= 0.1; // Allows up to 10% buffer deviation
    }

    public evaluatePlan(plan: any, constraints: any): { isFeasible: boolean, corrections: string[] } {
        let corrections: string[] = [];
        let isFeasible = true;

        // Check budget
        if (constraints.budget && !this.validateCostEnvelope(plan.costBreakdown, { budget: constraints.budget, currency: plan.currency, baselineCityCost: 100 })) {
            isFeasible = false;
            corrections.push("Budget constraint violated. Shift to more budget-friendly activities.");
        }

        // Check fatigue and geographic impossibility
        for (const day of plan.itinerary) {
            // 1. Fatigue Score Validation
            if (this.calculateFatigueScore(day.activities, constraints.travelStyle) > 10) {
                isFeasible = false;
                corrections.push(`Fatigue threshold exceeded on day ${day.day}. Add rest periods or replace high-energy activities.`);
            }

            // 2. Geospatial Distance Validation (Cache-backed)
            for (let i = 1; i < day.activities.length; i++) {
                const prev = day.activities[i - 1];
                const curr = day.activities[i];

                if (prev.geoCoordinates && curr.geoCoordinates) {
                    const distanceKm = this.getCachedDistance(prev.geoCoordinates.lat, prev.geoCoordinates.lon, curr.geoCoordinates.lat, curr.geoCoordinates.lon);

                    if (distanceKm > 50) { // If two places on the same day are > 50km apart
                        isFeasible = false;
                        corrections.push(`Geographic Impossibility on Day ${day.day}: ${prev.name} and ${curr.name} are too far apart (${distanceKm.toFixed(1)}km). Remove one or cluster closer places.`);
                    }
                }
            }
        }

        return { isFeasible, corrections };
    }
}
