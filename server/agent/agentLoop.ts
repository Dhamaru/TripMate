// Atlas Agent — Core Agent Loop (Groq Implementation)

import OpenAI from 'openai';
import type { AgentInput, AgentResponse, AgentStructuredData, Message, Mutation } from './types';
import { buildSystemPrompt } from './systemPrompt';
import { TRIPMATE_TOOLS } from './tools/definitions';
import { executeTool, type ExecutorDeps } from './tools/executor';
import { calculateFormalConfidence } from './confidence';
import { TripModel } from '../../shared/schema';
import { config } from '../config';

const MAX_ITERATIONS = 10;
// NVIDIA NIM models answer a trivial ping fine but have been observed timing
// out on the real request (full system prompt + tool schema) even when not
// quota-exhausted — Groq is a confirmed-reliable third tier for exactly that
// case, using the same OpenAI-compatible chat completions shape.
const MODELS = [
    'meta/llama-3.3-70b-instruct',
    'deepseek-ai/deepseek-v4-flash',
    'llama-3.3-70b-versatile',
];
const MODEL_BASE_URLS = [
    'https://integrate.api.nvidia.com/v1',
    'https://integrate.api.nvidia.com/v1',
    'https://api.groq.com/openai/v1',
];
// Each model has its own NVIDIA NIM key (free-tier keys are per-model scoped).
const MODEL_KEYS = [
    config.NVIDIA_API_KEY_2,
    config.NVIDIA_API_KEY_1,
    config.GROQ_API_KEY,
];

/** Summarizes conversation history when estimated tokens exceed 4000 to prevent context overflow. */
async function summarizeIfNeeded(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    openai: OpenAI
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const estimatedTokens = messages.reduce((sum, m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
        return sum + Math.ceil(content.length / 4)
    }, 0)

    if (estimatedTokens < 4000) return messages

    const systemMsg = messages.find(m => m.role === 'system')
    const recentMessages = messages.slice(-4)
    const toSummarize = messages.filter(m =>
        m.role !== 'system' && !recentMessages.includes(m)
    )

    if (toSummarize.length === 0) return messages

    const summaryResponse = await openai.chat.completions.create({
        model: 'meta/llama-3.3-70b-instruct',
        messages: [
            { role: 'system', content: 'Summarize this conversation in 3 sentences, preserving key decisions, trip details, and data.' },
            { role: 'user', content: toSummarize.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n') },
        ],
        max_tokens: 300,
    })

    const summary = summaryResponse.choices[0].message.content ?? ''
    const summaryMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        role: 'assistant',
        content: `[Previous conversation summary: ${summary}]`,
    }

    return [
        ...(systemMsg ? [systemMsg] : []),
        summaryMessage,
        ...recentMessages,
    ]
}

/**
 * Runs the Atlas agent loop using Groq.
 */
export async function runAgentLoop(
    input: AgentInput & { 
        onToken?: (token: string) => void;
        onTool?: (toolName: string) => void;
    },
    deps: ExecutorDeps
): Promise<AgentResponse> {
    if (!MODEL_KEYS[0] && !config.NVIDIA_API_KEY) {
        console.warn("[Agent] NVIDIA_API_KEY_1/NVIDIA_API_KEY_2 not set in env vars. Add them to Render environment variables.");
        throw new Error("AI service not configured. Please contact support.");
    }
    const clientsByModel = MODELS.map((_, i) => new OpenAI({
        apiKey: MODEL_KEYS[i] || config.NVIDIA_API_KEY || '',
        baseURL: MODEL_BASE_URLS[i],
        timeout: 25_000, // fail fast instead of hanging when the provider stalls under quota exhaustion
        maxRetries: 0, // we handle model fallback ourselves; the SDK's own retries would just multiply the hang
    }));
    const openai = clientsByModel[0];

    // FETCH PROACTIVE CONTEXT
    let proactiveBuffer = '';
    if (input.context.tripId) {
        try {
            const trip = await TripModel.findById(input.context.tripId);
            if (trip) {
                // Cap this at 3s — it's a nice-to-have context enrichment, not worth
                // stalling the entire chat response (and time-to-first-token) on a
                // slow weather API call.
                const insights = await Promise.race([
                    deps.aiService.getProactiveInsights(trip.destination, trip.itinerary || []),
                    new Promise<{ insights: string[]; suggestedPackingItems: string[] }>((resolve) =>
                        setTimeout(() => resolve({ insights: [], suggestedPackingItems: [] }), 3000)
                    ),
                ]);
                if (insights.insights.length > 0) {
                    proactiveBuffer = `\n\nPROACTIVE INTELLIGENCE:\n- Destination: ${trip.destination}\n- Insights: ${insights.insights.join(' | ')}\n- Suggested Packing: ${insights.suggestedPackingItems.join(', ')}`;
                }
            }
        } catch (e) {
            console.warn('[Atlas:Proactive] Failed to fetch insights', e);
        }
    }

    const systemPrompt = buildSystemPrompt(input.context) + proactiveBuffer;

    // Initial message history
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    if (input.conversationHistory) {
        for (const msg of input.conversationHistory) {
            // Map roles if necessary, though Groq uses standard OpenAI roles
            messages.push({
                role: msg.role as any,
                content: msg.content,
                ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
                ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
            });
        }
    }

    // Add current user message
    messages.push({ role: 'user', content: input.message })

    const toolsUsed: string[] = [];
    let totalToolCalls = 0;
    let successfulToolCalls = 0;
    let totalTokens = 0;
    let finalText = '';
    let currentFeasibilityScore: number | undefined = undefined;
    const mutations: Mutation[] = [];
    let groundingSignals = { mentions: 0, verified: 0 };
    let lastIteration = 0;

    let currentModelIndex = 0;

    try {
        // Summarize old messages if context window is getting too long
        const summarized = await summarizeIfNeeded([...messages], deps.openai ?? openai)
        messages.splice(0, messages.length, ...summarized)
        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            lastIteration = iteration;

            let stream;
            try {
                stream = await (deps.openai ?? clientsByModel[currentModelIndex]).chat.completions.create({
                    model: MODELS[currentModelIndex],
                    messages: messages,
                    tools: TRIPMATE_TOOLS as any,
                    max_tokens: 4096,
                    temperature: 0.20,
                    top_p: 0.70,
                    stream: true,
                    stream_options: { include_usage: true }
                });
            } catch (apiErr: any) {
                const msg = String(apiErr?.message || '');
                const isQuotaOrRateLimit = apiErr.status === 429
                    || /resourceexhausted|rate.?limit|quota|too many requests/i.test(msg);
                // NVIDIA has been observed answering a trivial ping fine but
                // timing out on the real request (full system prompt + tool
                // schema) without ever hitting a quota/429 — that's a
                // timeout/connection error, a different shape entirely, and
                // previously fell straight through to a hard failure instead
                // of trying the next model.
                const isTimeoutOrConnection = apiErr?.name === 'APIConnectionTimeoutError'
                    || apiErr?.name === 'APIConnectionError'
                    || /timeout|timed out|econnreset|econnrefused|etimedout|aborted/i.test(msg);
                if ((isQuotaOrRateLimit || isTimeoutOrConnection) && currentModelIndex < MODELS.length - 1) {
                    console.warn(`[Atlas:Loop] ${isQuotaOrRateLimit ? 'Quota/rate-limit' : 'Timeout'} hit for ${MODELS[currentModelIndex]} (${msg}). Falling back to ${MODELS[currentModelIndex + 1]}`);
                    currentModelIndex++;
                    iteration--; // Retry this iteration
                    continue;
                }
                throw apiErr;
            }

            let fullContent = '';
            let toolCalls: any[] = [];

            for await (const chunk of stream) {
                if ((chunk as any).usage) {
                    totalTokens += (chunk as any).usage.total_tokens;
                }
                const delta = chunk.choices[0]?.delta;
                if (delta?.content) {
                    fullContent += delta.content;
                    input.onToken?.(delta.content);
                }

                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (tc.index !== undefined) {
                            if (!toolCalls[tc.index]) {
                                toolCalls[tc.index] = {
                                    id: tc.id,
                                    type: 'function',
                                    function: { name: '', arguments: '' }
                                };
                            }
                            if (tc.id) toolCalls[tc.index].id = tc.id;
                            if (tc.function?.name) {
                                toolCalls[tc.index].function.name = tc.function.name;
                                input.onTool?.(tc.function.name);
                            }
                            if (tc.function?.arguments) {
                                toolCalls[tc.index].function.arguments += tc.function.arguments;
                            }
                        }
                    }
                }
            }

            const message = {
                role: 'assistant' as const,
                content: fullContent || null,
                tool_calls: toolCalls.length > 0 ? toolCalls.filter(Boolean) : undefined,
            };
            messages.push(message as any);

            if (message.tool_calls && message.tool_calls.length > 0) {
                // Execute tool calls
                const toolExecutionPromises = message.tool_calls.map(async (toolCall) => {
                    const toolName = toolCall.function.name;
                    if (!toolsUsed.includes(toolName)) {
                        toolsUsed.push(toolName);
                    }
                    totalToolCalls++;
                    input.onTool?.(toolName);

                    const toolResult = await executeTool(
                        toolName,
                        toolCall.function.arguments,
                        input.context,
                        deps
                    );

                    if (toolResult.success) {
                        successfulToolCalls++;
                        const data = toolResult.data as any;
                        if (data?.feasibilityScore !== undefined) {
                            currentFeasibilityScore = data.feasibilityScore;
                        }
                        if (data?.mutations && Array.isArray(data.mutations)) {
                            mutations.push(...data.mutations);
                        }
                        if (toolName === 'search_places' || toolName === 'get_weather') {
                            groundingSignals.verified++;
                        }
                    } else if (toolResult.error?.includes('infeasible')) {
                        // FEASIBILITY FAILURE: Provide a strong system hint for self-correction
                        const corrections = (toolResult.data as any)?.corrections || [];
                        messages.push({
                            role: 'tool' as const,
                            tool_call_id: toolCall.id,
                            content: JSON.stringify({
                                ...toolResult,
                                _system_correction_hint: `The user's request resulted in a logistical impossibility: ${corrections.join(' ')}. You MUST now either explain this conflict to the user OR call tools to find a more feasible alternative (e.g. closer locations or different times).`
                            }),
                        });
                        return null; // Handled specially
                    }

                    return {
                        role: 'tool' as const,
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(toolResult),
                    };
                });

                const toolMessages = (await Promise.all(toolExecutionPromises)).filter(m => m !== null) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];
                messages.push(...toolMessages);
                continue;
            }

            // No more tool calls, we have the final answer
            finalText = message.content || '';
            break;
        }
    } catch (err: any) {
        console.error('[Atlas:Loop] OpenAI API error:', err.message);

        // Last resort: both NVIDIA keys/models are down or exhausted. Rather than
        // hard-failing the whole conversation, try a single plain-text completion
        // on whichever other provider is actually configured (OpenAI, else Gemini —
        // separate quota from NVIDIA) so the user still gets an answer. No
        // tool-calling on this path, just a direct response.
        try {
            const fallbackText = await deps.aiService.generateFallbackReply(
                input.message,
                systemPrompt + '\n\nNote: live trip data/tools are temporarily unavailable — answer from general travel knowledge and say so if the question needs live data.'
            );
            if (fallbackText) {
                input.onToken?.(fallbackText);
                return {
                    message: fallbackText,
                    toolsUsed,
                    confidence: { score: 0.4, level: 'low' },
                    tokensUsed: totalTokens,
                };
            }
        } catch (fallbackErr: any) {
            console.error('[Atlas:Loop] Fallback reply also failed:', fallbackErr.message);
        }

        return {
            message: `I ran into an issue communicating with the AI service: ${err.message}. Please try again.`,
            toolsUsed,
            confidence: { score: 0.2, level: 'low' },
            tokensUsed: totalTokens,
        };
    }

    if (!finalText && totalToolCalls > 0) {
        finalText = "I've gathered some information but haven't formed a final response. Please try again or be more specific.";
    }

    // Extract structured data from JSON code blocks
    const structuredData = extractStructuredData(finalText);

    // FORMAL CONFIDENCE CALCULATION
    const toolSuccessRate = totalToolCalls > 0 ? successfulToolCalls / totalToolCalls : 1;
    const consistency = lastIteration === 0 ? 1.0 : lastIteration < 3 ? 0.7 : 0.4;
    const grounding = totalToolCalls === 0 ? 1.0 : Math.min(1, groundingSignals.verified / (totalToolCalls || 1));
    const coverage = finalText.length > 50 ? 1.0 : 0.5; // Heuristic for now

    // RECOVERY TRIGGER: If model hallucinated JSON instead of tool call
    if (structuredData.itineraryUpdate && !toolsUsed.includes('modify_itinerary')) {
        console.log('[Atlas:Recovery] Hallucinated itinerary update detected. Executing fallback...');
        const toolResult = await executeTool(
            'modify_itinerary',
            JSON.stringify(structuredData.itineraryUpdate),
            input.context,
            deps
        );
        if (toolResult.success) {
            toolsUsed.push('modify_itinerary (hallucinated-recovery)');
            const data = toolResult.data as any;
            if (data?.mutations) {
                mutations.push(...data.mutations);
            }
        } else {
            console.error('[Atlas:Recovery] Fallback execution failed:', toolResult.error);
        }
    }

    const formalConfidence = calculateFormalConfidence({
        tools: toolSuccessRate,
        grounding: grounding,
        consistency: consistency,
        coverage: coverage
    });

    return {
        message: finalText,
        toolsUsed,
        structuredData: Object.keys(structuredData).length > 0 ? structuredData : undefined,
        confidence: formalConfidence,
        feasibilityScore: currentFeasibilityScore,
        mutations: mutations.length > 0 ? mutations : undefined,
        tokensUsed: totalTokens,
    };
}

/**
 * Extracts structured JSON data from ```json code blocks in the response text.
 */
function extractStructuredData(text: string): AgentStructuredData {
    const result: AgentStructuredData = {};
    if (!text) return result;

    const jsonBlocks = text.match(/```json\s*([\s\S]*?)```/g);
    if (!jsonBlocks) return result;

    for (const block of jsonBlocks) {
        const jsonStr = block.replace(/```json\s*/, '').replace(/```$/, '').trim();
        try {
            const parsed = JSON.parse(jsonStr);

            // Detect what type of structured data this is
            if (parsed.categories && typeof parsed.categories === 'object') {
                result.packingList = { categories: parsed.categories };
            }
            if (parsed.convertedAmount !== undefined || parsed.rate !== undefined) {
                result.currencyConversion = parsed;
            }
            if (parsed.avgHighTemp !== undefined || parsed.packingFlag !== undefined) {
                result.weatherForecast = parsed;
            }
            if (parsed.accommodation !== undefined && parsed.buffer !== undefined) {
                result.budgetBreakdown = parsed;
            }
            if (parsed.activities && parsed.dayIndex !== undefined) {
                result.itineraryUpdate = {
                    ...parsed,
                    action: parsed.action || 'replace_day' // Default to replace_day for hallucinations
                };
            }
            if (parsed.summary && parsed.results && Array.isArray(parsed.results)) {
                result.agentCollaboration = parsed;
            }
        } catch {
            // Ignore malformed JSON blocks
        }
    }

    return result;
}
