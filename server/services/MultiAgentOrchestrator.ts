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

  constructor(services: { openai: any; geminiHelper: any; places?: any; weather?: any }) {
    this.modeler = new FeasibilityModeler();

    // Initialize the Specialized Agent Team
    this.researchAgent = new ResearchAgent({
      places: services.places,
      weather: services.weather,
      geminiHelper: services.geminiHelper,
    });
    this.draftingAgent = new DraftingAgent({
      openai: services.openai,
      geminiHelper: services.geminiHelper,
    });
    this.criticAgent = new CriticAgent({ openai: services.openai, modeler: this.modeler });
    this.formattingAgent = new FormattingAgent({
      openai: services.openai,
      geminiHelper: services.geminiHelper,
    });
  }

  /**
   * Executes the full robust agentic loop.
   */
  async executeReasoningLoop(params: {
    goal: string;
    constraints: Record<string, any>;
    maxIterations?: number;
  }): Promise<any> {
    const maxLoops = params.maxIterations || 3;
    let currentIteration = 1;
    let bestDraft = null;
    const degradedConstraints = [];
    const executionLogs: string[] = [];
    const telemetry = {
      startTime: Date.now(),
      totalLatencyMs: 0,
      iterations: 0,
      modelsUsed: new Set<string>(),
      degraded: false,
    };

    console.log(
      `[Orchestrator] Commencing Multi-Agent planning for ${params.constraints.destination}`,
    );
    executionLogs.push(`Execution triggered. Max loops: ${maxLoops}`);

    // Graceful Degradation below mutates params.constraints in place to
    // give the model an easier target on the last loop -- but that same
    // object is read again by formatFinalPayload for the SAVED trip's
    // travelStyle. Without saving the real values first, a user who
    // picked "Cultural" could get a trip silently saved as "Relaxed"
    // with no indication anything was overridden. Restored right
    // before formatting, below.
    const originalTravelStyle = params.constraints.travelStyle;
    const originalBudget = params.constraints.budget;

    // Phase 1: Research (Parallel Grounding)
    const context = await this.researchAgent.gatherContext(
      params.constraints.destination,
      params.constraints.days,
      params.constraints.travelStyle,
    );

    // Phase 2: Deliberation Loop (Draft -> Critique)
    while (currentIteration <= maxLoops) {
      console.log(`[Orchestrator] Loop ${currentIteration}/${maxLoops} starting...`);

      // Apply Graceful Degradation on the VERY LAST loop to force a successful generation
      if (currentIteration === maxLoops && maxLoops > 1 && !degradedConstraints.length) {
        console.log(
          `[Orchestrator] Max iterations reached. Forcing Graceful Degradation on final draft.`,
        );
        params.constraints.budget = (params.constraints.budget || 1000) * 1.5; // Loosen budget mathematically by 50%
        params.constraints.travelStyle = "Relaxed"; // Force a less dense schedule
        degradedConstraints.push(
          "Budget loosened by 50% and pace set to Relaxed to guarantee feasibility.",
        );
        executionLogs.push("Forced graceful degradation on final loop.");
        params.goal += `\nCRITICAL SYSTEM OVERRIDE: Budget is now ${params.constraints.budget}. Travel style is Relaxed. You MUST generate a valid plan that fits these relaxed parameters.`;
      }

      // 2a. Drafting
      const draftResult = await this.draftingAgent.generateDraft(
        params.goal,
        context,
        params.constraints,
      );
      bestDraft = draftResult.rawDraft;
      telemetry.modelsUsed.add(draftResult.source);

      // 2b. Critique & Feasibility
      const critiqueResult = await this.criticAgent.critiqueDraft(
        { rawDraft: bestDraft },
        params.constraints,
      );

      if (critiqueResult.valid) {
        console.log(
          `[Orchestrator] Plan Validated on Loop ${currentIteration}. Proceeding to formatting.`,
        );
        executionLogs.push(`Resolved on loop ${currentIteration} natively.`);
        break; // Exit loop, we have a valid plan
      }

      console.warn(
        `[Orchestrator] Validation failed. Reasons:`,
        critiqueResult.modificationsNeeded,
      );
      executionLogs.push(
        `Loop ${currentIteration} failed: ${critiqueResult.modificationsNeeded[0]}`,
      );

      if (currentIteration === maxLoops) {
        // FormattingAgent will process whatever the `bestDraft` is, preventing UI crash
        console.warn(
          `[Orchestrator] Failed natively even with degradation. Pushing remaining draft to Structural Firewall.`,
        );
        break;
      }

      // Update goal to include critic feedback for the next drafter loop
      params.goal += `\nCRITIQUE FROM PREVIOUS LOOP TO FIX: ${critiqueResult.modificationsNeeded.join(", ")}`;
      currentIteration++;
    }

    telemetry.iterations = currentIteration;
    telemetry.totalLatencyMs = Date.now() - telemetry.startTime;
    telemetry.degraded = degradedConstraints.length > 0;

    // Restore what the user actually picked -- formatFinalPayload reads
    // constraints.travelStyle straight into the saved trip. Without
    // this, a user who chose "Cultural" could have their trip silently
    // saved as "Relaxed" just because the model needed an easier target
    // on the last loop; the degradation was meant to help generation
    // succeed, not to overwrite what the user asked for.
    params.constraints.travelStyle = originalTravelStyle;
    params.constraints.budget = originalBudget;

    // Phase 3: Structural Formatting Firewall
    const finalPayload = await this.formattingAgent.formatFinalPayload(
      bestDraft,
      params.constraints,
      {
        insight: executionLogs.join(" | "),
        confidence: currentIteration < maxLoops ? 0.95 : 0.75,
        degraded: degradedConstraints,
        telemetry: {
          latencySeconds: parseFloat((telemetry.totalLatencyMs / 1000).toFixed(2)),
          iterations: telemetry.iterations,
          models: Array.from(telemetry.modelsUsed),
        },
      },
    );

    console.log(`[Orchestrator] Multi-Agent execution complete in ${telemetry.totalLatencyMs}ms.`);
    return finalPayload;
  }
}
