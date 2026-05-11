import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { AgentName, AgentResult, OrchestratorInput } from './types';
import { config } from '../../config';
import { TRIPMATE_TOOLS } from '../tools/definitions';
import { executeTool } from '../tools/executor';

export abstract class BaseAgent<T = any> {
  protected abstract agentName: AgentName;
  private openai: OpenAI;
  private skillPath: string;

  constructor() {
    this.openai = new OpenAI({
        apiKey: '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',
        baseURL: 'https://integrate.api.nvidia.com/v1',
    });
    this.skillPath = path.resolve(process.cwd(), 'skills');
  }

  /**
   * The core method every agent must implement.
   */
  abstract run(
    input: OrchestratorInput, 
    priorResults?: Record<string, any>
  ): Promise<AgentResult<T>>;

  /**
   * Loads the agent-specific SKILL.md file for the system prompt.
   */
  protected loadSkill(folderName: string): string {
    try {
      const fullPath = path.join(this.skillPath, folderName, 'SKILL.md');
      return fs.readFileSync(fullPath, 'utf8');
    } catch (err) {
      console.warn(`[${this.agentName}] Failed to load skill from ${folderName}/SKILL.md`, err);
      return `You are ${this.agentName}.`;
    }
  }

  /**
   * Formats the context into a system prompt.
   */
  protected buildSystemPrompt(skillContent: string, input: OrchestratorInput, priorResults?: Record<string, any>): string {
    let prompt = skillContent + '\n\n# Context\n';
    prompt += `User ID: ${input.userId}\n`;
    if (input.tripId) prompt += `Trip ID: ${input.tripId}\n`;
    if (input.trigger) prompt += `Trigger: ${input.trigger}\n`;
    
    if (input.context.userPreferences) {
      prompt += `\n## User Preferences\n${JSON.stringify(input.context.userPreferences, null, 2)}`;
    }
    if (input.context.trip) {
      prompt += `\n## Trip Details\n${JSON.stringify(input.context.trip, null, 2)}`;
    }
    if (priorResults && Object.keys(priorResults).length > 0) {
      prompt += `\n## Prior Agent Results\n${JSON.stringify(priorResults, null, 2)}`;
    }
    return prompt;
  }

  /**
   * Retries an async function given number of attempts before propagating the error.
   */
  protected async retry<R>(fn: () => Promise<R>, attempts: number = 2): Promise<R> {
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === attempts - 1) throw err;
            console.warn(`[${this.agentName}] Attempt ${i + 1} failed, retrying...`, err);
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); // exponential backoff
        }
    }
    throw new Error('Unreachable');
  }

  /**
   * Core execution loop making the Groq call and handling tool usage.
   */
  protected async groqCall(
    input: OrchestratorInput,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    toolsToUse?: string[]
  ): Promise<{ text: string, tokensUsed: number, toolCallCount: number }> {
    let totalTokens = 0;
    let toolCallCount = 0;
    let finalText = '';

    const availableTools = toolsToUse 
        ? TRIPMATE_TOOLS.filter(t => toolsToUse.includes(t.function.name))
        : TRIPMATE_TOOLS;

    const maxIterations = availableTools.length > 0 ? 5 : 1;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.openai.chat.completions.create({
          model: 'meta/llama-3.3-70b-instruct',
          messages: messages,
          ...(availableTools.length > 0 && { tools: availableTools as any }),
          max_tokens: 4096,
      });

      totalTokens += response.usage?.total_tokens ?? 0;
      const message = response.choices[0].message;
      messages.push(message);

      if (message.tool_calls && message.tool_calls.length > 0) {
          toolCallCount += message.tool_calls.length;
          const toolExecutionPromises = message.tool_calls.map(async (toolCall) => {
              const toolName = toolCall.function.name;
              // Pass context to executeTool
              const toolResult = await executeTool(toolName, toolCall.function.arguments, { userId: input.userId, tripId: input.tripId }, { openai: this.openai, aiService: (this as any).orchestrator?.deps?.aiService });
              return {
                  role: 'tool' as const,
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(toolResult),
              };
          });

          const toolMessages = await Promise.all(toolExecutionPromises);
          messages.push(...toolMessages);
          continue;
      }

      finalText = message.content || '';
      break;
    }

    return { text: finalText, tokensUsed: totalTokens, toolCallCount };
  }

  /**
   * Helper to parse JSON from the final text
   */
  protected parseJsonResponse<R>(text: string): R | null {
    const jsonBlocks = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlocks && jsonBlocks[1]) {
        try {
            return JSON.parse(jsonBlocks[1]) as R;
        } catch (e) {
            console.error(`[${this.agentName}] Failed to parse JSON block`, e);
            return null;
        }
    }
    
    // Fallback try raw parse in case it didn't use markdown blocks
    try {
        return JSON.parse(text) as R;
    } catch {
        return null;
    }
  }

  /**
   * Helper to structure the final AgentResult
   */
  protected createResult(
      success: boolean, 
      data: T | null, 
      error: string | undefined, 
      confidence: number, 
      tokensUsed: number, 
      durationMs: number, 
      toolCallCount: number
  ): AgentResult<T> {
      return {
          agent: this.agentName,
          success,
          data,
          error,
          confidence,
          tokensUsed,
          durationMs,
          toolCallCount
      };
  }
}
