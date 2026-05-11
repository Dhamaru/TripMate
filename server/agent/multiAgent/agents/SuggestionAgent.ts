import { BaseAgent } from '../BaseAgent';
import { AgentName, AgentResult, OrchestratorInput } from '../types';
import { TripSuggestion } from '../../../models/TripSuggestion';

export interface SuggestionResult {
    suggestions: any[];
    totalSuggestions: number;
    generatedAt: string;
}

export class SuggestionAgent extends BaseAgent<SuggestionResult> {
    protected agentName: AgentName = 'SuggestionAgent';

    async run(input: OrchestratorInput, priorResults?: Record<string, any>): Promise<AgentResult<SuggestionResult>> {
        const startTime = Date.now();
        
        try {
            // Fetch user feedback context
            const pastFeedback = await TripSuggestion.find({ 
                userId: input.userId,
                'userFeedback.score': { $exists: true }
            })
            .sort({ updatedAt: -1 })
            .limit(10)
            .select('destination userFeedback');

            const feedbackPrompt = pastFeedback.length > 0 
                ? `\nUser Preferences from Past Suggestions:\n${pastFeedback.map(f => `- ${f.destination}: ${f.userFeedback?.score === 1 ? 'LIKED' : 'DISLIKED'}`).join('\n')}`
                : '';

            const skillContent = this.loadSkill('suggestion-agent');
            let systemPrompt = this.buildSystemPrompt(skillContent, input, priorResults);
            
            if (feedbackPrompt) {
                systemPrompt += `\n\nCRITICAL CONTEXT: ${feedbackPrompt}\nAlways prioritize destinations similar to the LIKED ones and avoid those similar to DISLIKED ones.`;
            }

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: 'Generate personalized trip suggestions based on my preferences.' }
            ];

            // Tools used by SuggestionAgent based on PRD
            const tools = ['search_places', 'get_travel_hacks', 'get_weather'];

            const { text, tokensUsed, toolCallCount } = await this.groqCall(input, messages, tools);
            
            const data = this.parseJsonResponse<SuggestionResult>(text) || {
                suggestions: [],
                totalSuggestions: 0,
                generatedAt: new Date().toISOString()
            };

            // Calculate a pseudo-confidence score for now
            const confidence = data.suggestions.length > 0 ? 0.9 : 0.5;

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
            console.error(`[${this.agentName}] Failed to generate suggestions`, error);
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
