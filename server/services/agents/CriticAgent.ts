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
     */
    async critiqueDraft(draft: any, constraints: Record<string, any>): Promise<{ valid: boolean, modificationsNeeded: string[], adjustedConstraints?: any }> {
        console.log(`[CriticAgent] Running feasibility score...`);
        const results = [];

        // 1. Evaluate Quantitative Constraints (Fatigue, Distance, Budget) via Modeler matrix
        const feasibilityScore = this.modeler.evaluatePlan(
            { itinerary: [], currency: constraints.currency, costBreakdown: { total: 0 } }, // Pass stub plan
            constraints
        );

        if (!feasibilityScore.isFeasible) {
            results.push(...feasibilityScore.corrections);
        }

        // 2. Evaluate Semantic/Chronological Constraints via LLM
        const estimatedDraftCost = draft.rawDraft?.costBreakdown?.total || 0;

        const critiquePrompt = `
      Review this drafted itinerary for mathematical and logistical feasibility:
      Draft: ${JSON.stringify(draft.rawDraft)}

      Constraints: ${JSON.stringify(constraints)}
      Calculated Total Trip Cost in Draft: ${estimatedDraftCost} ${constraints.currency}

      CRITICAL CHECKS:
      1. BUDGET: The Total Trip Cost (${estimatedDraftCost}) MUST NOT exceed the strict numeric Budget constraint (${constraints.budget}). If it does even by 1 unit, "valid" must be false.
      2. Are there impossible travel gaps?
      3. Are there >3 major activities a day?
      
      Respond with ONLY a JSON object: { "valid": boolean, "reasons": ["...list of why it fails..."] }
    `;

        try {
            const gptRes: any = await withRetries(() => this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: [{ role: "system", content: critiquePrompt }]
            }), 3, 1000);

            const critiqueVal = JSON.parse(gptRes.choices[0].message.content || '{"valid": false, "reasons": ["Parse error"]}');

            if (!critiqueVal.valid) {
                results.push(...critiqueVal.reasons);
            }

            const isValid = results.length === 0;
            console.log(`[CriticAgent] Validation complete. Valid: ${isValid}`);

            return {
                valid: isValid,
                modificationsNeeded: results,
                // Graceful Degradation logic placeholder (e.g. relaxing budget slightly if rigid)
            };

        } catch (e) {
            console.error(`[CriticAgent] Failed to critique, assuming invalid to trigger re-draft or fallback.`, e);
            return { valid: false, modificationsNeeded: ["System failure during critique phase."] };
        }
    }
}
