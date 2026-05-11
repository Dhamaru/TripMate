import { BaseAgent } from '../BaseAgent';
import { AgentName, AgentResult, OrchestratorInput } from '../types';

export interface HeroImageResult {
    heroImages: any[];
}

export class HeroImageAgent extends BaseAgent<HeroImageResult> {
    protected agentName: AgentName = 'HeroImageAgent';

    async run(input: OrchestratorInput, priorResults?: Record<string, any>): Promise<AgentResult<HeroImageResult>> {
        const startTime = Date.now();
        
        try {
            const skillContent = this.loadSkill('hero-image-agent');
            const systemPrompt = this.buildSystemPrompt(skillContent, input, priorResults);

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: 'Find the best hero images for these destinations.' }
            ];

            // Tools used by HeroImageAgent based on PRD
            const tools = ['search_places'];

            const { text, tokensUsed, toolCallCount } = await this.groqCall(input, messages, tools);
            
            const data = this.parseJsonResponse<HeroImageResult>(text) || {
                heroImages: []
            };

            const confidence = data.heroImages.length > 0 ? 0.95 : 0.4;

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
            console.error(`[${this.agentName}] Failed to generate hero images`, error);
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
