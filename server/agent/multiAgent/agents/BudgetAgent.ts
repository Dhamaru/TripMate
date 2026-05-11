import { BaseAgent } from '../BaseAgent';
import { AgentName, AgentResult, OrchestratorInput } from '../types';

export interface BudgetCategory {
    allocated: number;
    perDay?: number;
    perNight?: number;
    tip?: string;
    note?: string;
}

export interface BudgetResult {
    totalBudget: number;
    currency: string;
    breakdown: {
        accommodation: BudgetCategory;
        transport: BudgetCategory;
        food: BudgetCategory;
        activities: BudgetCategory;
        buffer: BudgetCategory;
    };
    dailyBudget: number;
    costOfLivingIndex: string;
    savingTips: string[];
    currencyConversions: Record<string, number>;
    warningFlags: string[];
}

export class BudgetAgent extends BaseAgent<BudgetResult> {
    protected agentName: AgentName = 'BudgetAgent';

    async run(input: OrchestratorInput, priorResults?: Record<string, any>): Promise<AgentResult<BudgetResult>> {
        const startTime = Date.now();
        
        try {
            const skillContent = this.loadSkill('budget-agent');
            const systemPrompt = this.buildSystemPrompt(skillContent, input, priorResults);

            const hasExpenses = input.context.trip?.expenses && input.context.trip.expenses.length > 0;
            const userPrompt = hasExpenses 
                ? 'Review my current expenses against the budget. Calculate totals, identify anomalies, and provide specific warning flags if I am overspending in any category.'
                : 'Calculate the budget breakdown for this trip based on the destination and preferences.';

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: userPrompt }
            ];

            // Tools used by BudgetAgent based on PRD
            const tools = ['get_budget_breakdown', 'convert_currency', 'get_travel_hacks'];

            const { text, tokensUsed, toolCallCount } = await this.groqCall(input, messages, tools);
            
            const data = this.parseJsonResponse<BudgetResult>(text) || {
                totalBudget: input.context.trip?.budget || 0,
                currency: input.context.trip?.currency || 'INR',
                breakdown: {
                    accommodation: { allocated: 0 },
                    transport: { allocated: 0 },
                    food: { allocated: 0 },
                    activities: { allocated: 0 },
                    buffer: { allocated: 0 }
                },
                dailyBudget: 0,
                costOfLivingIndex: 'moderate',
                savingTips: [],
                currencyConversions: {},
                warningFlags: []
            };

            const confidence = Object.keys(data.breakdown).length > 0 ? 0.95 : 0.5;

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
            console.error(`[${this.agentName}] Failed to calculate budget`, error);
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
