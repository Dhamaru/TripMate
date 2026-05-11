import { BaseAgent } from '../BaseAgent';
import { AgentName, AgentResult, OrchestratorInput } from '../types';

export interface PackingItem {
    id: string;
    label: string;
    essential: boolean;
    weatherDriven: boolean;
    activityDriven: boolean;
    checked: boolean;
    quantity: number;
    notes?: string;
}

export interface PackingCategory {
    name: string;
    icon: string;
    items: PackingItem[];
}

export interface PackingResult {
    categories: PackingCategory[];
    weatherNote: string;
    totalItems: number;
    essentialCount: number;
    generatedFrom: {
        weatherSummary: string;
        activitiesConsidered: string[];
        travelStyle: string;
    };
}

export class PackingAgent extends BaseAgent<PackingResult> {
    protected agentName: AgentName = 'PackingAgent';

    async run(input: OrchestratorInput, priorResults?: Record<string, any>): Promise<AgentResult<PackingResult>> {
        const startTime = Date.now();
        
        try {
            const skillContent = this.loadSkill('packing-agent');
            const systemPrompt = this.buildSystemPrompt(skillContent, input, priorResults);

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: 'Generate a weather and activity aware packing list for this trip.' }
            ];

            // Tools used by PackingAgent based on PRD
            const tools = ['get_weather', 'generate_packing_list'];

            const { text, tokensUsed, toolCallCount } = await this.groqCall(input, messages, tools);
            
            const data = this.parseJsonResponse<PackingResult>(text) || {
                categories: [],
                weatherNote: '',
                totalItems: 0,
                essentialCount: 0,
                generatedFrom: { 
                    weatherSummary: '', 
                    activitiesConsidered: [], 
                    travelStyle: input.context.trip?.travelStyle || 'standard' 
                }
            };

            const confidence = data.categories.length > 0 ? 0.95 : 0.5;

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
            console.error(`[${this.agentName}] Failed to generate packing list`, error);
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
