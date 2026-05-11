import { BaseAgent } from '../BaseAgent';
import { AgentName, AgentResult, OrchestratorInput } from '../types';

export interface JournalResult {
    assignedDayIndex?: number;
    suggestedTitle?: string;
    mood?: string;
    keyMoments?: string[];
    enhancedText?: string;
    changesSummary?: string;
    wordsAdded?: number;
    wordsChanged?: number;
    summary?: string;
    stats?: Record<string, any>;
}

export class JournalAgent extends BaseAgent<JournalResult> {
    protected agentName: AgentName = 'JournalAgent';

    async run(input: OrchestratorInput, priorResults?: Record<string, any>): Promise<AgentResult<JournalResult>> {
        const startTime = Date.now();
        
        try {
            const skillContent = this.loadSkill('journal-agent');
            const systemPrompt = this.buildSystemPrompt(skillContent, input, priorResults);

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: 'Process the provided journal entry (contextualize, enhance, or recap depending on inputs).' }
            ];

            // Tools used by JournalAgent based on PRD
            const tools = ['augment_journal', 'get_trip_details'];

            const { text, tokensUsed, toolCallCount } = await this.groqCall(input, messages, tools);
            
            const data = this.parseJsonResponse<JournalResult>(text) || {};

            const confidence = Object.keys(data).length > 0 ? 0.9 : 0.4;

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
            console.error(`[${this.agentName}] Failed to process journal`, error);
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
