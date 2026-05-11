import { BaseAgent } from '../BaseAgent';
import { AgentName, AgentResult, OrchestratorInput } from '../types';

export interface ItineraryResult {
    itinerary: any[];
    totalActivities: number;
    estimatedTotalCost: number;
    weatherSummary: string;
    travelTips: string[];
}

export class ItineraryAgent extends BaseAgent<ItineraryResult> {
    protected agentName: AgentName = 'ItineraryAgent';

    async run(input: OrchestratorInput, priorResults?: Record<string, any>): Promise<AgentResult<ItineraryResult>> {
        const startTime = Date.now();
        
        try {
            const skillContent = this.loadSkill('itinerary-agent');
            const systemPrompt = this.buildSystemPrompt(skillContent, input, priorResults);

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: 'Generate a day-by-day itinerary for this trip.' }
            ];

            // Tools used by ItineraryAgent based on PRD
            const tools = ['search_places', 'get_weather', 'finalize_trip_plan', 'get_travel_hacks'];

            const { text, tokensUsed, toolCallCount } = await this.groqCall(input, messages, tools);
            
            const data = this.parseJsonResponse<ItineraryResult>(text) || {
                itinerary: [],
                totalActivities: 0,
                estimatedTotalCost: 0,
                weatherSummary: 'N/A',
                travelTips: []
            };

            const confidence = data.itinerary.length > 0 ? 0.9 : 0.3;

            return this.createResult(
                true,
                data,
                undefined,
                confidence,
                tokensUsed,
                Date.now() - startTime,
                toolCallCount
            );
        } catch (error: any) {
            console.error(`[${this.agentName}] Failed to generate itinerary`, error);
            return this.createResult(
                false,
                null,
                error.message,
                0,
                0,
                Date.now() - startTime,
                0
            );
        }
    }
}
