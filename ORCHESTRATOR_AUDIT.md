# ORCHESTRATOR_AUDIT.md — Multi-Agent Orchestrator Status & Recommendation

> Generated: 2026-03-04
> Status: DECISION DOCUMENT for Phase 1 (Atlas Integration)

---

## Classification: **ACTIVE**

The 8-agent Multi-Agent Orchestrator is **actively embedded in the core trip planning flow**. It is called every time a user generates or regenerates a trip itinerary.

---

## Evidence

### ✅ Active Integration Points
- **Called from**: `AiUtilitiesService.planTrip()` at line 500 of `AiUtilitiesService.ts`
- **Import**: Line 3 of `AiUtilitiesService.ts` — `import { MultiAgentOrchestrator } from "./services/MultiAgentOrchestrator"`
- **Triggered by**: `POST /api/tools/planTrip` (line 3065 of `routes.ts`) and `POST /api/v1/trips/generate-itinerary` (line 3107)
- **Also triggered by**: `PUT /api/v1/trips/:id` when critical fields (destination/days/budget) change (line 1257)

### ❌ No Direct Routes
- The orchestrator has NO direct API routes. It is only accessed indirectly through `AiUtilitiesService`.

### ❌ No Frontend References
- Grep of `client/` directory for `MultiAgentOrchestrator` returned **zero results**.
- The frontend calls `/api/tools/planTrip` or `/api/v1/trips/generate-itinerary`, which internally invokes the orchestrator.

### ⚠️ Debug Artifacts Present
- `console.log(`[Orchestrator] Commencing Multi-Agent planning...`)` — line 51
- `console.log(`[Orchestrator] Loop ${currentIteration}/${maxLoops} starting...`)` — line 63
- `console.warn(`[Orchestrator] Validation failed...`)` — line 91
- `console.warn(`[Orchestrator] Failed natively...`)` — line 96
- These are **operational logs**, not stub/test code. The orchestrator is production-grade but chatty.

### ❌ No Test Coverage
- No test files found for any files in `server/services/`.

---

## Architecture

```
AiUtilitiesService.planTrip()
  └─→ MultiAgentOrchestrator.executeReasoningLoop()
       ├── Phase 1: ResearchAgent.gatherContext()
       │     └── Parallel grounding (places, weather, context)
       ├── Phase 2: Deliberation Loop (max 3 iterations)
       │     ├── DraftingAgent.generateDraft()
       │     │     └── Uses OpenAI or Gemini for itinerary generation
       │     └── CriticAgent.critiqueDraft()
       │           └── FeasibilityModeler.validate()
       │                 └── Budget/time/constraint checking
       └── Phase 3: FormattingAgent.formatFinalPayload()
             └── Structural Firewall (prevents UI crash)
```

### Files Involved (10 total)

| File | Lines | Role |
|------|-------|------|
| `server/services/MultiAgentOrchestrator.ts` | 121 | Main orchestration loop (3-phase deliberation) |
| `server/services/agents/ResearchAgent.ts` | — | Parallel context gathering (places, weather) |
| `server/services/agents/DraftingAgent.ts` | — | Itinerary generation (OpenAI/Gemini) |
| `server/services/agents/CriticAgent.ts` | — | Draft validation + feasibility check |
| `server/services/agents/FormattingAgent.ts` | — | Structural firewall + final payload format |
| `server/services/agents/utils.ts` | — | Shared agent utilities |
| `server/services/FeasibilityModeler.ts` | — | Budget/time constraint validation engine |
| `server/services/PlanValidator.ts` | — | Plan structure validation |
| `server/services/ReasoningEngine.ts` | — | Intent/constraint reasoning |
| `server/services/UserMemoryService.ts` | — | User preference memory (likely unused) |

---

## Recommendation: **WRAP**

Atlas should **wrap** the existing orchestrator as a tool, not replace or delete it.

### Reasoning
1. **It works.** The orchestrator is production-active and handles every trip plan generation.
2. **It has sophisticated logic.** The 3-phase deliberation loop with graceful degradation (budget loosening, style relaxation) and structural firewall is non-trivial to reproduce.
3. **Atlas should orchestrate AT A HIGHER LEVEL.** Atlas decides WHAT to do (plan trip, modify itinerary, answer question). The existing orchestrator knows HOW to generate a trip plan.
4. **Clean integration point exists.** `MultiAgentOrchestrator.executeReasoningLoop()` takes a simple `{ goal, constraints, maxIterations }` interface and returns a formatted plan.

### Exact Integration Point

```typescript
// Atlas wraps the existing orchestrator as a tool:
interface AtlasTripPlanTool {
  name: 'trip_plan_generator';
  invoke: (params: {
    goal: string;           // e.g., "Plan a 5-day trip to Tokyo"
    constraints: {
      destination: string;
      days: number;
      budget?: number;
      travelStyle: string;
      groupSize: number;
      travelMedium: string;
    };
    maxIterations?: number; // default: 3
  }) => Promise<TripPlanPayload>;
}

// The actual call:
const orchestrator = new MultiAgentOrchestrator({
  openai: openaiClient,
  geminiHelper: geminiHelperInstance,
  places: placesService,    // optional
  weather: weatherService,  // optional
});

const result = await orchestrator.executeReasoningLoop({
  goal,
  constraints,
  maxIterations: 3,
});
```

### Phase 1 Actions
1. Keep all 10 files in `server/services/` intact
2. Create an Atlas tool adapter that calls `executeReasoningLoop()`
3. Remove debug `console.log` statements (replace with structured logger)
4. Add TypeScript types to replace `any` usage in constructor and return types
5. Add test coverage for the orchestrator

---

## Summary

| Attribute | Value |
|-----------|-------|
| Classification | **ACTIVE** — embedded in core trip planning flow |
| Routes hitting it | 3 (indirect via `AiUtilitiesService.planTrip()`) |
| Frontend calls | 0 direct, 3 indirect via API |
| Test coverage | None |
| Debug artifacts | 5 `console.log/warn` statements (operational, not stub) |
| Recommended action | **WRAP** — Atlas wraps it as a tool |
| Integration signature | `orchestrator.executeReasoningLoop({ goal, constraints, maxIterations })` |
