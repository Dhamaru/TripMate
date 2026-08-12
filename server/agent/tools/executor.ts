// Atlas Agent — Tool Executor (switch dispatch with logging)

import type { ToolResult, AgentContext } from '../types';
import {
    weatherHandler,
    currencyHandler,
    emergencyHandler,
    placesHandler,
    tripHandler,
    tripsListHandler,
    packingHandler,
    translateHandler,
    budgetHandler,
    tripPlannerHandler,
    modifyItineraryHandler,
    userPreferencesHandler,
    updateUserPreferencesHandler,
    packingListToolHandler,
    journalToolHandler,
    expenseToolHandler,
    collaboratorToolHandler,
} from './handlers';

// Actions that mutate or revoke access/data in a way that's hard to undo.
// A confirmed:true arg used to be enough to skip this gate — but that flag
// lives in the LLM's own generated tool-call JSON, not anything a real user
// produced. A prompt injection (text embedded in trip notes, journal
// content, anything that ends up in the model's context) could instruct
// the model to set confirmed:true on its first attempt and nothing would
// stop it. Gated tools now ALWAYS short-circuit into a pending action
// (see pendingActions.ts) instead of executing here, regardless of what
// the model put in args — the only path to actually running them is a
// separate authenticated HTTP request from a real button click.
const CONFIRM_REQUIRED: Record<string, (args: Record<string, unknown>) => boolean> = {
    manage_expense: (args) => args.action === 'remove',
    manage_collaborator: () => true,
};

function summarizeGatedAction(name: string, args: Record<string, unknown>): string {
    if (name === 'manage_expense') {
        return `Remove the expense (id: ${args.expenseId ?? 'unknown'}) from this trip?`;
    }
    if (name === 'manage_collaborator') {
        if (args.action === 'add') {
            return `Add ${args.email ?? 'this person'} as a${args.role === 'viewer' ? ' viewer' : 'n editor'} on this trip?`;
        }
        return `Remove this collaborator from the trip?`;
    }
    return `Confirm this action: ${name}`;
}
import OpenAI from 'openai';
import { masterOrchestrator } from '../multiAgent/MasterOrchestrator';
import { createPendingAction } from '../pendingActions';

export interface ExecutorDeps {
    openai: OpenAI | null;
    TripModel?: any;
    aiService: {
        emergency: (location: string) => Promise<unknown>;
        searchPlaces: (query: string, timeoutMs?: number) => Promise<any[]>;
        calculateBudgetBreakdown: (
            totalBudget: number,
            travelStyle: string
        ) => {
            accommodation: number;
            food: number;
            transport: number;
            activities: number;
            buffer: number;
            total: number;
        };
        augmentJournalEntry: (
            content: string,
            destination?: string
        ) => Promise<{
            augmentedContent: string;
            suggestedLabels: string[];
            sentiment: string;
        }>;
        getTravelHacks: (
            destination: string,
            typeOfTrip?: string
        ) => Promise<{ hacks: string[]; economicalAlternatives: string[] }>;
        getProactiveInsights: (
            destination: string,
            itinerary: any[]
        ) => Promise<{ insights: string[]; suggestedPackingItems: string[] }>;
        resolveCoordinates: (address: string) => Promise<{ lat: number; lon: number } | null>;
        generateFallbackReply: (userMessage: string, systemPrompt: string) => Promise<string | null>;
    };
}

export async function executeTool(
    name: string,
    argsJson: string,
    context: AgentContext,
    deps: ExecutorDeps
): Promise<ToolResult> {
    const start = Date.now();
    let args: Record<string, unknown>;

    try {
        args = JSON.parse(argsJson);
    } catch {
        return { success: false, error: `Invalid JSON arguments for tool ${name}`, durationMs: Date.now() - start };
    }

    console.log(`[Atlas:Tool] ${name} called`, JSON.stringify(args).slice(0, 200));

    const needsConfirm = CONFIRM_REQUIRED[name];
    if (needsConfirm && needsConfirm(args) && context.userId) {
        const summary = summarizeGatedAction(name, args);
        const pending = createPendingAction(context.userId, name, argsJson, summary);
        return {
            success: false,
            error: 'Confirmation required: tell the user exactly what this action will do and that they need to confirm it themselves using the button shown — you cannot confirm it for them.',
            data: { requiresConfirmation: true, pendingActionId: pending.id, summary },
            durationMs: Date.now() - start,
        };
    }

    return dispatchTool(name, args, context, deps, start);
}

/** The actual per-tool dispatch, separated from executeTool so the
 * confirm-action endpoint can invoke a previously-gated tool directly once
 * a real authenticated request (not an LLM tool call) confirms it — that
 * path must skip the CONFIRM_REQUIRED gate above (it already passed an
 * equivalent, stronger check) without re-implementing every case here. */
export async function dispatchTool(
    name: string,
    args: Record<string, unknown>,
    context: AgentContext,
    deps: ExecutorDeps,
    start: number = Date.now(),
): Promise<ToolResult> {
    let result: ToolResult;

    try {
        switch (name) {
            case 'get_weather':
                result = await weatherHandler(args as { location: string; units?: string });
                break;

            case 'convert_currency':
                result = await currencyHandler(args as { amount: number; from: string; to: string });
                break;

            case 'translate_text':
                result = await translateHandler(args as { text: string; sourceLang?: string; targetLang: string });
                break;

            case 'search_places':
                result = await placesHandler(
                    args as { query: string; category?: string; location?: string; maxResults?: number },
                    { aiService: deps.aiService }
                );
                break;

            case 'get_emergency_info':
                result = await emergencyHandler(
                    args as { destination: string; infoType?: string },
                    { aiService: deps.aiService }
                );
                break;

            case 'get_travel_hacks': {
                const hackStart = Date.now();
                try {
                    const hacks = await deps.aiService.getTravelHacks(
                        (args as { destination: string }).destination,
                        (args as { travelStyle?: string }).travelStyle
                    );
                    result = { success: true, data: hacks, durationMs: Date.now() - hackStart };
                } catch (err: any) {
                    result = { success: false, error: err.message || 'Travel hacks failed', durationMs: Date.now() - hackStart };
                }
                break;
            }

            case 'generate_packing_list':
                result = await packingHandler(
                    {
                        ...(args as { destination: string; days: number; travelStyle: string; weatherContext?: string; activities?: string[] }),
                        tripId: (args as { tripId?: string }).tripId || context.tripId,
                    },
                    { openai: deps.openai }
                );
                break;

            case 'augment_journal': {
                const augStart = Date.now();
                try {
                    const augmented = await deps.aiService.augmentJournalEntry(
                        (args as { content: string }).content,
                        (args as { destination?: string }).destination
                    );
                    result = { success: true, data: augmented, durationMs: Date.now() - augStart };
                } catch (err: any) {
                    result = { success: false, error: err.message || 'Journal augmentation failed', durationMs: Date.now() - augStart };
                }
                break;
            }

            case 'get_budget_breakdown':
                result = await budgetHandler(
                    {
                        ...(args as { totalBudget: number; travelStyle: string; currency?: string }),
                        tripId: (args as { tripId?: string }).tripId || context.tripId,
                    },
                    { aiService: deps.aiService }
                );
                break;

            case 'list_trips':
                result = await tripsListHandler({
                    userId: context.userId || '',
                });
                break;

            case 'get_trip_details':
                result = await tripHandler({
                    tripId: (args as { tripId?: string }).tripId || context.tripId || '',
                    userId: context.userId || '',
                    action: 'get',
                });
                break;

            case 'finalize_trip_plan':
                result = await tripPlannerHandler({
                    ...args as any,
                    tripId: (args as { tripId?: string }).tripId || context.tripId || '',
                    userId: context.userId || '',
                });
                break;

            case 'modify_itinerary':
                result = await modifyItineraryHandler(
                    {
                        tripId: (args as { tripId?: string }).tripId || context.tripId || '',
                        userId: context.userId || '',
                        action: (args as { action: any }).action,
                        dayIndex: (args as { dayIndex: number }).dayIndex,
                        activityId: (args as { activityId?: string }).activityId,
                        activity: (args as { activity?: any }).activity,
                        activities: (args as { activities?: any[] }).activities,
                    },
                    { aiService: deps.aiService, TripModel: deps.TripModel }
                );
                break;
            
            case 'get_user_preferences':
                result = await userPreferencesHandler({ 
                    userId: context.userId 
                });
                break; // Added missing break
            case 'update_user_preferences': // Corrected case placement
                result = await updateUserPreferencesHandler({
                    ...(args as any),
                    userId: context.userId,
                });
                break;
            
            case 'manage_packing_list':
                result = await packingListToolHandler({
                    userId: context.userId || '',
                    tripId: (args as { tripId?: string }).tripId || context.tripId,
                    action: (args as { action: any }).action,
                    itemName: (args as { itemName?: string }).itemName,
                    itemId: (args as { itemId?: string }).itemId,
                    quantity: (args as { quantity?: number }).quantity,
                });
                break;

            case 'create_journal_entry':
                result = await journalToolHandler({
                    userId: context.userId || '',
                    tripId: (args as { tripId?: string }).tripId || context.tripId,
                    title: (args as { title: string }).title,
                    content: (args as { content: string }).content,
                    dayIndex: (args as { dayIndex?: number }).dayIndex,
                    location: (args as { location?: string }).location,
                });
                break;

            case 'manage_expense':
                result = await expenseToolHandler({
                    userId: context.userId || '',
                    tripId: (args as { tripId?: string }).tripId || context.tripId || '',
                    action: (args as { action: any }).action,
                    amount: (args as { amount?: number }).amount,
                    currency: (args as { currency?: string }).currency,
                    category: (args as { category?: string }).category,
                    description: (args as { description?: string }).description,
                    expenseId: (args as { expenseId?: string }).expenseId,
                });
                break;

            case 'manage_collaborator':
                result = await collaboratorToolHandler({
                    userId: context.userId || '',
                    tripId: (args as { tripId?: string }).tripId || context.tripId || '',
                    action: (args as { action: any }).action,
                    email: (args as { email?: string }).email,
                    role: (args as { role?: any }).role,
                    collaboratorId: (args as { collaboratorId?: string }).collaboratorId,
                });
                break;

            case 'collaborate_with_agents': {
                const collStart = Date.now();
                try {
                    const orchestratorResult = await masterOrchestrator.run({
                        trigger: 'chat_message',
                        userId: context.userId,
                        tripId: context.tripId,
                        message: (args as { request: string }).request,
                        context: {
                            // Map existing context to OrchestratorContext
                            currentPage: (context as any).currentPage
                        }
                    });
                    result = { 
                        success: true, 
                        data: { 
                            summary: `Collaboration complete. Involved ${orchestratorResult.results.length} agents.`,
                            results: orchestratorResult.results 
                        }, 
                        durationMs: Date.now() - collStart 
                    };
                } catch (err: any) {
                    result = { success: false, error: err.message || 'Collaboration failed', durationMs: Date.now() - collStart };
                }
                break;
            }

            default:
                result = { success: false, error: `Unknown tool: ${name}`, durationMs: Date.now() - start };
        }
    } catch (err: any) {
        result = { success: false, error: `Tool ${name} threw: ${err.message}`, durationMs: Date.now() - start };
    }

    const elapsed = Date.now() - start;
    result.durationMs = elapsed;
    console.log(`[Atlas:Tool] ${name} ${result.success ? 'OK' : 'FAIL'} (${elapsed}ms)`);

    return result;
}
