// Atlas Agent — Core Agent Loop (Groq Implementation)

import OpenAI from 'openai';
import type { AgentInput, AgentResponse, AgentStructuredData, Message, Mutation } from './types';
import { buildSystemPrompt } from './systemPrompt';
import { TRIPMATE_TOOLS } from './tools/definitions';
import { executeTool, type ExecutorDeps } from './tools/executor';
import { calculateFormalConfidence } from './confidence';
import { isProviderOpen, recordSuccess, recordFailure, hasTokenBudget, recordTokenUsage, estimateTokens } from './providerHealth';
import { TripModel } from '../../shared/schema';
import { config } from '../config';

const MAX_ITERATIONS = 10;
// Verified live against NVIDIA's actual /v1/chat/completions (2026-08-12)
// under both a realistic full-size prompt AND a real tool-calling request,
// not just a trivial ping — two rounds of model swaps needed correcting:
//   - 'meta/llama-3.3-70b-instruct': hangs to timeout under real load on
//     BOTH NVIDIA keys, not just one — it's the model, not the key.
//   - 'meta/llama-3.1-70b-instruct': answers fast but is unreliable for
//     tool-calling — confirmed hallucinating an unprompted get_weather call
//     on a plain "Hi", and separately observed leaking raw tool-routing
//     text ("No function call is needed for this prompt.") as its reply.
//     Fast is worthless if the answers are wrong; pulled from the chain.
//   - 'deepseek-ai/deepseek-v4-flash' (no suffix) 410s — NVIDIA renamed it
//     to 'deepseek-ai/deepseek-v4-flash-0731'; it was never actually
//     retired, our config just had a stale id.
// deepseek-v4-flash-0731 is the only NVIDIA model confirmed both fast
// (9-11s under load) AND correct (clean greeting, no hallucinated tool
// calls) on either key, so it fills both NVIDIA slots. No billing change —
// this only corrects which models our own config points at.
// Groq removed every Llama model from their catalog (confirmed live via
// GET /v1/models — llama-3.3-70b-versatile now 404s "does not exist").
// openai/gpt-oss-120b verified live with the real system prompt + full
// tool schema before swapping in: correctly calls tools when needed
// (weather, currency, list_trips with the "my trips" rule present) and
// correctly does NOT call a tool for plain questions/greetings.
export const MODELS = [
    'openai/gpt-oss-120b',
    'deepseek-ai/deepseek-v4-flash-0731',
    'deepseek-ai/deepseek-v4-flash-0731',
];
export const MODEL_BASE_URLS = [
    'https://api.groq.com/openai/v1',
    'https://integrate.api.nvidia.com/v1',
    'https://integrate.api.nvidia.com/v1',
];
const MODEL_KEYS = [
    config.GROQ_API_KEY,
    config.NVIDIA_API_KEY_1,
    config.NVIDIA_API_KEY_2,
];

// Computed once — TRIPMATE_TOOLS is static, no need to re-stringify it on
// every single iteration of every request just to estimate its token cost.
const toolsTokenEstimate = estimateTokens(JSON.stringify(TRIPMATE_TOOLS));

/**
 * Classifies whether a provider error is worth falling back to the next
 * model for (quota/rate-limit, timeout/connection, or a stale-resource 410),
 * versus a genuine hard failure that should just surface to the user.
 * Shared by both the initial completion-request error handler and the
 * mid-stream error handler below — a 410 or timeout can happen either before
 * the stream starts or partway through it, and previously only the former
 * was caught, so a mid-stream failure skipped fallback entirely and went
 * straight to a hard user-facing error with working models still available.
 */
function classifyFallbackError(err: any): { shouldFallback: boolean; reason: string } {
    const msg = String(err?.message || '');
    const isQuotaOrRateLimit = err?.status === 429
        || /resourceexhausted|rate.?limit|quota|too many requests/i.test(msg);
    const isTimeoutOrConnection = err?.name === 'APIConnectionTimeoutError'
        || err?.name === 'APIConnectionError'
        || /timeout|timed out|econnreset|econnrefused|etimedout|aborted/i.test(msg);
    const isGone = err?.status === 410;
    if (isQuotaOrRateLimit) return { shouldFallback: true, reason: 'Quota/rate-limit' };
    if (isGone) return { shouldFallback: true, reason: '410 Gone' };
    if (isTimeoutOrConnection) return { shouldFallback: true, reason: 'Timeout' };
    return { shouldFallback: false, reason: '' };
}

/** Summarizes conversation history when estimated tokens exceed 4000 to prevent context overflow. */
async function summarizeIfNeeded(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    openai: OpenAI,
    model: string
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const estimatedTokens = messages.reduce((sum, m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
        return sum + Math.ceil(content.length / 4)
    }, 0)

    // Was 4000 — lowered so long conversations get compressed sooner,
    // directly cutting the resent-history cost on every subsequent turn
    // against Groq's measured 12k-tokens/minute ceiling. The summarization
    // call itself costs tokens too (though a small, fixed amount — 300
    // max_tokens, short prompt), so this isn't free, but summarizing a bit
    // earlier is cheaper than resending an ever-growing raw history on
    // every single turn of a long conversation.
    if (estimatedTokens < 2500) return messages

    const systemMsg = messages.find(m => m.role === 'system')
    const recentMessages = messages.slice(-4)
    const toSummarize = messages.filter(m =>
        m.role !== 'system' && !recentMessages.includes(m)
    )

    if (toSummarize.length === 0) return messages

    const summaryResponse = await openai.chat.completions.create({
        model,
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
    let pendingConfirmation: { id: string; toolName: string; summary: string } | undefined = undefined;
    const mutations: Mutation[] = [];
    let groundingSignals = { mentions: 0, verified: 0 };
    let lastIteration = 0;

    let currentModelIndex = 0;

    // Fail fast instead of fail slow: if every provider is simultaneously
    // circuit-open (recent failures) or out of tracked token budget, the
    // request is going to fail no matter what — the only question is
    // whether the user waits ~25s to find that out or gets told
    // immediately. Checked once, up front, before spending anything
    // (including the summarization call below) on a doomed request.
    const preflightEstimate = estimateTokens(JSON.stringify(messages)) + toolsTokenEstimate + 1024;
    const allProvidersExhausted = MODELS.every((_, i) => isProviderOpen(i) || !hasTokenBudget(i, preflightEstimate));
    if (allProvidersExhausted) {
        console.warn('[Atlas:Loop] All providers circuit-open or over token budget — failing fast instead of a doomed attempt.');
        return {
            message: "Atlas is handling a lot of requests right now and needs a moment to catch up — please try again in about a minute.",
            toolsUsed: [],
            confidence: { score: 0.1, level: 'low' },
            tokensUsed: 0,
        };
    }

    try {
        // Summarize old messages if context window is getting too long. This
        // always calls NVIDIA directly (hardcoded model, no fallback chain)
        // and sat outside any error handling — if that one call failed, the
        // whole request died right here without ever reaching the real
        // fallback loop below, even though Groq and a second NVIDIA key were
        // still available for the actual conversation. Summarization is
        // strictly an optimization; failing it should degrade to the
        // unsummarized (longer) message list, not the whole response.
        try {
            const summarized = await summarizeIfNeeded([...messages], deps.openai ?? openai, MODELS[0])
            messages.splice(0, messages.length, ...summarized)
        } catch (summarizeErr) {
            console.warn('[Atlas:Loop] Context summarization failed, proceeding with full history:', summarizeErr);
        }
        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            lastIteration = iteration;

            // Circuit breaker: skip a provider that's failed 3+ requests in a
            // row without spending its 25s timeout on a request it's very
            // likely to fail again — this is what actually caused the ~30s
            // reply latency during an outage where every provider was down.
            //
            // Token-budget admission control: skip a provider that DOESN'T
            // have a hard failure yet but almost certainly will — Groq's
            // real 12k-tokens/minute ceiling (measured via its own
            // x-ratelimit headers) means a request can be predictably over
            // budget before it's even sent. Checking this ourselves turns a
            // guaranteed-slow 429 round-trip into an immediate correct
            // routing decision instead.
            //
            // If every remaining provider is open/over-budget, fall through
            // and try the current one anyway — best effort beats a hard
            // refusal.
            const estimatedRequestTokens = estimateTokens(JSON.stringify(messages)) + toolsTokenEstimate + 1024;
            while (
                currentModelIndex < MODELS.length - 1 &&
                (isProviderOpen(currentModelIndex) || !hasTokenBudget(currentModelIndex, estimatedRequestTokens))
            ) {
                const why = isProviderOpen(currentModelIndex) ? 'circuit open (repeated recent failures)' : 'insufficient token budget in current window';
                console.warn(`[Atlas:Loop] Skipping ${MODELS[currentModelIndex]} — ${why}`);
                currentModelIndex++;
            }

            let stream;
            let iterationTokens = 0;
            try {
                stream = await (deps.openai ?? clientsByModel[currentModelIndex]).chat.completions.create({
                    model: MODELS[currentModelIndex],
                    messages: messages,
                    tools: TRIPMATE_TOOLS as any,
                    // Was 4096 — the system prompt itself asks for replies
                    // under 200 words (~270 tokens), so 4096 was purely
                    // worst-case exposure against Groq's 12k-tokens/minute
                    // ceiling with no upside. 1024 comfortably covers a
                    // real reply + tool-call arguments while cutting the
                    // worst-case per-request token cost by 75%.
                    max_tokens: 1024,
                    temperature: 0.20,
                    top_p: 0.70,
                    stream: true,
                    stream_options: { include_usage: true }
                });
            } catch (apiErr: any) {
                const { shouldFallback, reason } = classifyFallbackError(apiErr);
                if (shouldFallback) {
                    recordFailure(currentModelIndex, reason);
                    if (currentModelIndex < MODELS.length - 1) {
                        console.warn(`[Atlas:Loop] ${reason} hit for ${MODELS[currentModelIndex]} (${apiErr?.message}). Falling back to ${MODELS[currentModelIndex + 1]}`);
                        currentModelIndex++;
                        iteration--; // Retry this iteration
                        continue;
                    }
                }
                throw apiErr;
            }

            let fullContent = '';
            let toolCalls: any[] = [];

            try {
                for await (const chunk of stream) {
                    if ((chunk as any).usage) {
                        totalTokens += (chunk as any).usage.total_tokens;
                        iterationTokens += (chunk as any).usage.total_tokens;
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
                                }
                                if (tc.function?.arguments) {
                                    toolCalls[tc.index].function.arguments += tc.function.arguments;
                                }
                            }
                        }
                    }
                }
            } catch (streamErr: any) {
                // The completion call above can succeed and start streaming,
                // then the connection itself 410s/times out partway through
                // (observed live, right after a tool-call round-trip) — that
                // previously escaped uncaught here, skipped model fallback
                // entirely, and surfaced a raw provider error to the user
                // even with working models left in the chain. Any partial
                // content/tool-call state from this attempt is discarded;
                // the whole iteration retries fresh against the next model.
                const { shouldFallback, reason } = classifyFallbackError(streamErr);
                if (shouldFallback) {
                    recordFailure(currentModelIndex, reason);
                    if (currentModelIndex < MODELS.length - 1) {
                        console.warn(`[Atlas:Loop] ${reason} hit mid-stream for ${MODELS[currentModelIndex]} (${streamErr?.message}). Falling back to ${MODELS[currentModelIndex + 1]}`);
                        currentModelIndex++;
                        iteration--;
                        continue;
                    }
                }
                throw streamErr;
            }

            recordSuccess(currentModelIndex);
            recordTokenUsage(currentModelIndex, iterationTokens);

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
                    } else if ((toolResult.data as any)?.requiresConfirmation) {
                        // Surfaced to the client so it can render a real
                        // confirm button — see server/agent/pendingActions.ts.
                        const d = toolResult.data as any;
                        pendingConfirmation = { id: d.pendingActionId, toolName, summary: d.summary };
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
        pendingConfirmation,
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
