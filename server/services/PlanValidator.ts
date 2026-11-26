export class PlanValidator {
    constructor(private feasibilityModeler: any) { }

    public async validate(generatedPlan: any, originalConstraints: any): Promise<{ isValid: boolean, issues: string[] }> {
        const issues: string[] = [];
        let isValid = true;

        // 1. Structure Check
        if (!generatedPlan || !generatedPlan.itinerary || !Array.isArray(generatedPlan.itinerary)) {
            return { isValid: false, issues: ["Invalid plan structure: missing itinerary array."] };
        }

        // 2. Schedule Density Check
        for (const day of generatedPlan.itinerary) {
            if (!day.activities || day.activities.length < 3) {
                issues.push(`Day ${day.day} lacks sufficient activities (found ${day.activities?.length || 0}). Need at least 3.`);
            }

            // Time overlap calculation
            // Assume time format HH:MM
            let previousEnd = 0;
            for (const act of day.activities) {
                if (!act.time || !act.duration_minutes) continue;
                const [hh, mm] = act.time.split(':').map(Number);
                const startTime = hh * 60 + mm;

                if (startTime < previousEnd) {
                    issues.push(`Time overlap detected on day ${day.day} at ${act.time} for activity: ${act.title}`);
                }
                previousEnd = startTime + act.duration_minutes;
            }
        }

        // 3. Feasibility / Constraints Check
        const feasibilityCheck = this.feasibilityModeler.evaluatePlan(generatedPlan, originalConstraints);
        if (!feasibilityCheck.isFeasible) {
            issues.push(...feasibilityCheck.corrections);
        }

        if (issues.length > 0) {
            isValid = false;
        }

        return { isValid, issues };
    }
}
