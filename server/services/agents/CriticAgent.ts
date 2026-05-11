import { FeasibilityModeler } from "../FeasibilityModeler";
import { withRetries } from "./utils";

export class CriticAgent {
    private openai: any;
    private modeler: FeasibilityModeler;

    constructor(services: { openai: any, modeler: FeasibilityModeler }) {
        this.openai = services.openai;
        this.modeler = services.modeler;
    }

    /**
     * Critiques a draft itinerary based on real-world constraints.
     * Returns whether the draft is valid and a list of modifications needed.
     * Graceful degradation: if the LLM critique fails, we fall back to
     * the quantitative feasibility score alone rather than blocking the pipeline.
     */
    async critiqueDraft(draft: any, constraints: Record<string, any>): Promise<{
        valid: boolean;
        modificationsNeeded: string[];
        adjustedConstraints?: Record<string, any>;
        degraded?: boolean;
    }> {
        const results: string[] = [];

        // ── Stage 1: Quantitative feasibility via FeasibilityModeler matrix ──
        const feasibilityScore = this.modeler.evaluatePlan(
            { itinerary: [], currency: constraints.currency, costBreakdown: { total: 0 } },
            constraints
        );

        if (!feasibilityScore.isFeasible) {
            results.push(...feasibilityScore.corrections);
        }

        // ── Stage 2: Semantic / chronological critique via LLM ──
        if (!this.openai) {
            // No LLM available — rely solely on quantitative check
            return {
                valid: results.length === 0,
                modificationsNeeded: results,
                degraded: true,
            };
        }

        const estimatedDraftCost = draft.rawDraft?.costBreakdown?.total ?? 0;

        const critiquePrompt = `
Review this drafted itinerary for mathematical and logistical feasibility.

COLLABORATIVE SIGNALS (USER FEEDBACK):
${JSON.stringify(constraints.existingItinerary || "No existing feedback")}

Draft to Evaluate: ${JSON.stringify(draft.rawDraft)}

Constraints: ${JSON.stringify(constraints)}
Calculated Total Trip Cost in Draft: ${estimatedDraftCost} ${constraints.currency}

CRITICAL CHECKS:
1. BUDGET: The Total Trip Cost (${estimatedDraftCost}) MUST NOT exceed the strict numeric Budget constraint (${constraints.budget}).
2. COLLABORATIVE VIBE: If an activity in the COLLABORATIVE SIGNALS has negative 'votes' or 'Low Vibe' signals, the NEW draft MUST NOT include it. Replace with a higher-vibe alternative.
3. IMPOSSIBLE GAPS: Flag any travel segments that are logistically impossible within the allotted time.
4. FATIGUE: Flag if any single day has more than 3 major sightseeing activities.

Respond with ONLY a valid JSON object (no markdown): { "valid": boolean, "reasons": string[] }
`.trim();

        try {
            const gptRes: any = await withRetries(() => this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: [{ role: "system", content: critiquePrompt }]
            }), 3, 1000);

            const critiqueVal = JSON.parse(
                gptRes.choices[0].message.content || '{"valid": true, "reasons": []}'
            );

            if (!critiqueVal.valid && Array.isArray(critiqueVal.reasons)) {
                results.push(...critiqueVal.reasons);
            }

            const isValid = results.length === 0;

            // ── Graceful degradation: relax budget constraint slightly if it is
            //    the only blocker and the overage is under 10% ──
            let adjustedConstraints: Record<string, any> | undefined;
            const budgetIssues = results.filter(r => /budget|cost|exceed/i.test(r));
            if (!isValid && budgetIssues.length > 0 && results.length === budgetIssues.length) {
                const currentBudget = Number(constraints.budget) || 0;
                if (currentBudget > 0) {
                    const overage = estimatedDraftCost - currentBudget;
                    const overpct = overage / currentBudget;
                    if (overpct > 0 && overpct <= 0.1) {
                        // Allow a 10 % budget flex rather than fully re-drafting
                        adjustedConstraints = {
                            ...constraints,
                            budget: Math.ceil(estimatedDraftCost),
                            budgetRelaxed: true,
                        };
                    }
                }
            }

            return {
                valid: isValid,
                modificationsNeeded: results,
                ...(adjustedConstraints ? { adjustedConstraints } : {}),
            };

        } catch (e: any) {
            // LLM critique failed — degrade gracefully to quantitative result only
            console.error(`[CriticAgent] LLM critique failed, falling back to quantitative check:`, e?.message);
            return {
                valid: results.length === 0,
                modificationsNeeded: results.length > 0 ? results : [],
                degraded: true,
            };
        }
    }
}
