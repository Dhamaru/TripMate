import { ResearchAgent } from "./agents/ResearchAgent";
import { DraftingAgent } from "./agents/DraftingAgent";
import { CriticAgent } from "./agents/CriticAgent";
import { FormattingAgent } from "./agents/FormattingAgent";
import { FeasibilityModeler } from "./FeasibilityModeler";

export class MultiAgentOrchestrator {
    private researchAgent: ResearchAgent;
    private draftingAgent: DraftingAgent;
    private criticAgent: CriticAgent;
    private formattingAgent: FormattingAgent;
    private modeler: FeasibilityModeler;

    constructor(services: { openai: any, geminiHelper: any, places?: any, weather?: any }) {
        this.modeler = new FeasibilityModeler();

        // Initialize the Specialized Agent Team
        this.researchAgent = new ResearchAgent({ places: services.places, weather: services.weather });
        this.draftingAgent = new DraftingAgent({ openai: services.openai, geminiHelper: services.geminiHelper });
        this.criticAgent = new CriticAgent({ openai: services.openai, modeler: this.modeler });
        this.formattingAgent = new FormattingAgent({ openai: services.openai });
    }

    /**
     * Executes the full robust agentic loop.
     */
    async executeReasoningLoop(params: {
        goal: string,
        constraints: Record<string, any>,
        maxIterations?: number
    }): Promise<any> {
        const maxLoops = params.maxIterations || 3;
        let currentIteration = 1;
        let bestDraft = null;
        let degradedConstraints = [];
        const executionLogs: string[] = [];
        const telemetry = {
            startTime: Date.now(),
            totalLatencyMs: 0,
            iterations: 0,
            modelsUsed: new Set<string>(),
            degraded: false
        };

        console.log(`[Orchestrator] Commencing Multi-Agent planning for ${params.constraints.destination}`);
        executionLogs.push(`Execution triggered. Max loops: ${maxLoops}`);

        // Phase 1: Research (Parallel Grounding)
        const context = await this.researchAgent.gatherContext(
            params.constraints.destination,
            params.constraints.days,
            params.constraints.travelStyle
        );

        // Phase 2: Deliberation Loop (Draft -> Critique)
        while (currentIteration <= maxLoops) {
            console.log(`[Orchestrator] Loop ${currentIteration}/${maxLoops} starting...`);

            // Apply Graceful Degradation on the VERY LAST loop to force a successful generation
            if (currentIteration === maxLoops && maxLoops > 1 && !degradedConstraints.length) {
                console.log(`[Orchestrator] Max iterations reached. Forcing Graceful Degradation on final draft.`);
                params.constraints.budget = (params.constraints.budget || 1000) * 1.5; // Loosen budget mathematically by 50%
                params.constraints.travelStyle = "Relaxed"; // Force a less dense schedule
                degradedConstraints.push("Budget loosened by 50% and pace set to Relaxed to guarantee feasibility.");
                executionLogs.push("Forced graceful degradation on final loop.");
                params.goal += `\nCRITICAL SYSTEM OVERRIDE: Budget is now ${params.constraints.budget}. Travel style is Relaxed. You MUST generate a valid plan that fits these relaxed parameters.`;
            }

            // 2a. Drafting 
            const draftResult = await this.draftingAgent.generateDraft(params.goal, context, params.constraints);
            bestDraft = draftResult.rawDraft;
            telemetry.modelsUsed.add(draftResult.source);

            // 2b. Critique & Feasibility
            const critiqueResult = await this.criticAgent.critiqueDraft({ rawDraft: bestDraft }, params.constraints);

            if (critiqueResult.valid) {
                console.log(`[Orchestrator] Plan Validated on Loop ${currentIteration}. Proceeding to formatting.`);
                executionLogs.push(`Resolved on loop ${currentIteration} natively.`);
                break; // Exit loop, we have a valid plan
            }

            console.warn(`[Orchestrator] Validation failed. Reasons:`, critiqueResult.modificationsNeeded);
            executionLogs.push(`Loop ${currentIteration} failed: ${critiqueResult.modificationsNeeded[0]}`);

            if (currentIteration === maxLoops) {
                // FormattingAgent will process whatever the `bestDraft` is, preventing UI crash
                console.warn(`[Orchestrator] Failed natively even with degradation. Pushing remaining draft to Structural Firewall.`);
                break;
            }

            // Update goal to include critic feedback for the next drafter loop
            params.goal += `\nCRITIQUE FROM PREVIOUS LOOP TO FIX: ${critiqueResult.modificationsNeeded.join(', ')}`;
            currentIteration++;
        }

        telemetry.iterations = currentIteration;
        telemetry.totalLatencyMs = Date.now() - telemetry.startTime;
        telemetry.degraded = degradedConstraints.length > 0;

        // Phase 3: Structural Formatting Firewall
        const finalPayload = await this.formattingAgent.formatFinalPayload(
            bestDraft,
            params.constraints,
            {
                insight: executionLogs.join(' | '),
                confidence: currentIteration < maxLoops ? 0.95 : 0.75,
                degraded: degradedConstraints,
                telemetry: {
                    latencySeconds: parseFloat((telemetry.totalLatencyMs / 1000).toFixed(2)),
                    iterations: telemetry.iterations,
                    models: Array.from(telemetry.modelsUsed)
                }
            }
        );

        console.log(`[Orchestrator] Multi-Agent execution complete in ${telemetry.totalLatencyMs}ms.`);
        return finalPayload;
    }
}
