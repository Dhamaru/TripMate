/**
 * Atlas Agent — Confidence Scorer
 * Implements the 4-signal formula from ATLAS_ARCHITECTURE.md
 */

export interface ConfidenceSignals {
    tools: number;      // (successful_tool_calls / total_tool_calls)
    grounding: number;  // (places_verified_by_api / total_places_mentioned)
    consistency: number;// Iteration efficiency (1.0 = first loop, 0.6 = retry, 0.3 = poor)
    coverage: number;   // (constraints_met / total_constraints)
}

export interface ConfidenceResult {
    score: number;
    level: 'high' | 'medium' | 'low';
    signals: ConfidenceSignals;
}

export function calculateFormalConfidence(signals: ConfidenceSignals): ConfidenceResult {
    const w1 = 0.30; // Tool Success
    const w2 = 0.30; // Grounding
    const w3 = 0.20; // Consistency
    const w4 = 0.20; // Coverage

    const score = (
        (signals.tools * w1) +
        (signals.grounding * w2) +
        (signals.consistency * w3) +
        (signals.coverage * w4)
    );

    const roundedScore = Math.round(score * 100) / 100;

    let level: 'high' | 'medium' | 'low' = 'low';
    if (roundedScore >= 0.85) level = 'high';
    else if (roundedScore >= 0.60) level = 'medium';

    return {
        score: roundedScore,
        level,
        signals
    };
}
