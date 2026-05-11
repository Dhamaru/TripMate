// Budget Handler — delegates to AiUtilitiesService.calculateBudgetBreakdown()
// Does NOT reimplement budget allocation logic

import type { ToolResult } from '../../types';

export async function budgetHandler(
    args: { totalBudget: number; travelStyle: string; currency?: string; tripId?: string; origin?: string; destination?: string; travelMedium?: string },
    deps: {
        aiService: {
            calculateBudgetBreakdown: (
                totalBudget: number,
                travelStyle: string,
                origin?: string,
                destination?: string,
                travelMedium?: string
            ) => {
                accommodation: number;
                food: number;
                transport: number;
                activities: number;
                buffer: number;
                total: number;
                grandTransit?: number;
            };
        };
    }
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const totalBudget = Number(args.totalBudget);
        const travelStyle = (args.travelStyle || 'standard').trim();
        const currency = (args.currency || 'INR').toUpperCase();
        const { tripId, origin, destination, travelMedium } = args;
        
        if (!Number.isFinite(totalBudget) || totalBudget <= 0) {
            return { success: false, error: 'totalBudget must be a positive number', durationMs: Date.now() - start };
        }

        // Delegate to existing AiUtilitiesService — no reimplementation
        const breakdown = deps.aiService.calculateBudgetBreakdown(totalBudget, travelStyle, origin, destination, travelMedium);

        return {
            success: true,
            data: {
                ...breakdown,
                currency,
                travelStyle,
                mutations: tripId ? [{ type: 'budget_updated', tripId }] : undefined,
            },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Budget calculation failed', durationMs: Date.now() - start };
    }
}
