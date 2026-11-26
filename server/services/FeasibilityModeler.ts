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
            const type = (act.type || 'sightseeing').toLowerCase();
            score += this.baseFatigueScores[type] || 1;
            
            // Add penalty for late activities
            if (act.time) {
                const hour = parseInt(act.time.split(':')[0], 10);
                const isPM = act.time.toLowerCase().includes('pm');
                const militaryHour = isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour);
                if (militaryHour >= 21 || militaryHour <= 6) score += 1; // Late night/Early morning penalty
            }
        }

        // Adjusted by travelStyle
        if (travelStyle === "adventure") score *= 0.7; // Hardier
        if (travelStyle === "relaxed") score *= 1.8; // Tires easily
        if (travelStyle === "luxury") score *= 1.2;

        return score;
    }

    public validateCostEnvelope(planCost: any, budgetParams: { budget?: number, currency: string, baselineCityCost: number }): boolean {
        if (!budgetParams.budget) return true;
        const total = planCost.total || 0;
        const delta = (total - budgetParams.budget) / budgetParams.budget;
        return delta <= 0.1;
    }

    public async getDistanceMatrix(points: { lat: number, lon: number }[]): Promise<number[][]> {
        const matrix: number[][] = [];
        for (let i = 0; i < points.length; i++) {
            matrix[i] = [];
            for (let j = 0; j < points.length; j++) {
                if (i === j) {
                    matrix[i][j] = 0;
                } else {
                    matrix[i][j] = this.getCachedDistance(points[i].lat, points[i].lon, points[j].lat, points[j].lon);
                }
            }
        }
        return matrix;
    }

    private hasTimeOverlap(act1: any, act2: any): boolean {
        if (!act1.time || !act2.time) return false;
        
        const parse = (t: string) => {
            const match = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (!match) return 0;
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            if (match[3]?.toUpperCase() === 'PM' && h !== 12) h += 12;
            if (match[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
            return h * 60 + m;
        };

        const start1 = parse(act1.time);
        const duration1 = act1.duration_minutes || 60;
        const end1 = start1 + duration1;

        const start2 = parse(act2.time);
        const duration2 = act2.duration_minutes || 60;
        const end2 = start2 + duration2;

        return (start1 < end2 && end1 > start2);
    }

    public evaluatePlan(plan: any, constraints: any): { isFeasible: boolean, corrections: string[], feasibilityScore: number } {
        let corrections: string[] = [];
        let isFeasible = true;
        let penaltyPoints = 0;

        // Check budget
        if (constraints.budget && !this.validateCostEnvelope(plan.costBreakdown || { total: constraints.budget }, { budget: constraints.budget, currency: plan.currency || 'INR', baselineCityCost: 100 })) {
            penaltyPoints += 2;
            corrections.push("Budget constraint likely exceeded. Consider lower-cost activities.");
        }

        for (const day of plan.itinerary || []) {
            const activities = day.activities || [];
            
            // 1. Fatigue Score Validation
            const fatigue = this.calculateFatigueScore(activities, constraints.travelStyle);
            if (fatigue > 12) {
                penaltyPoints += (fatigue - 10);
                corrections.push(`Day ${day.day || day.dayIndex + 1} is extremely fatiguing (${fatigue.toFixed(1)}). Suggest reducing activity count.`);
            }

            // 2. Time Overlap Check
            for (let i = 0; i < activities.length; i++) {
                for (let j = i + 1; j < activities.length; j++) {
                    if (this.hasTimeOverlap(activities[i], activities[j])) {
                        penaltyPoints += 3;
                        isFeasible = false;
                        corrections.push(`Time Conflict on Day ${day.day || day.dayIndex + 1}: "${activities[i].title}" and "${activities[j].title}" overlap.`);
                    }
                }
            }

            // 3. Geospatial Distance Validation
            for (let i = 1; i < activities.length; i++) {
                const prev = activities[i - 1];
                const curr = activities[i];
                
                const coords1 = prev.geoCoordinates || (prev.latitude ? { lat: prev.latitude, lon: prev.longitude } : null);
                const coords2 = curr.geoCoordinates || (curr.latitude ? { lat: curr.latitude, lon: curr.longitude } : null);

                if (coords1 && coords2) {
                    const dist = this.getCachedDistance(coords1.lat, coords1.lon, coords2.lat, coords2.lon);
                    if (dist > 100) {
                        penaltyPoints += 5;
                        isFeasible = false;
                        corrections.push(`Extreme Distance on Day ${day.day || day.dayIndex + 1}: ${prev.title} and ${curr.title} are ${dist.toFixed(1)}km apart.`);
                    } else if (dist > 30) {
                        penaltyPoints += 1;
                        corrections.push(`Significant travel time needed between ${prev.title} and ${curr.title} (${dist.toFixed(1)}km).`);
                    }
                }
            }
        }

        const feasibilityScore = Math.max(0, 1 - (penaltyPoints / 20));
        return { isFeasible: isFeasible && feasibilityScore > 0.4, corrections, feasibilityScore };
    }
}
