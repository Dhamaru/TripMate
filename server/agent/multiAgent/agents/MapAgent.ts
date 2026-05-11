import { BaseAgent } from '../BaseAgent';
import { AgentName, AgentResult, OrchestratorInput } from '../types';

export interface MapResult {
    mapConfig: Record<string, any>;
    activityMarkers: any[];
    routes: any[];
    offlineTileBounds: Record<string, any>;
    emergencyInfo: Record<string, any>;
    offlineCacheStatus: string;
}

export class MapAgent extends BaseAgent<MapResult> {
    protected agentName: AgentName = 'MapAgent';

    async run(input: OrchestratorInput, priorResults?: Record<string, any>): Promise<AgentResult<MapResult>> {
        const startTime = Date.now();
        
        try {
            const skillContent = this.loadSkill('map-agent');
            const systemPrompt = this.buildSystemPrompt(skillContent, input, priorResults);

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: 'Generate the map configuration, routes, and offline tile bounds for this trip.' }
            ];

            // Tools used by MapAgent based on PRD
            const tools = ['search_places', 'get_emergency_info', 'get_weather'];

            const { text, tokensUsed, toolCallCount } = await this.groqCall(input, messages, tools);
            
            const data = this.parseJsonResponse<MapResult>(text) || {
                mapConfig: { center: { lat: 0, lng: 0 }, defaultZoom: 13, boundingBox: [] },
                activityMarkers: [],
                routes: [],
                offlineTileBounds: { north: 0, south: 0, east: 0, west: 0, minZoom: 10, maxZoom: 15, estimatedTileCount: 0, estimatedSizeMB: 0 },
                emergencyInfo: { policeNumber: '911', ambulanceNumber: '911', nearestHospital: '', embassyAddress: '' },
                offlineCacheStatus: 'pending'
            };

            const confidence = data.offlineTileBounds.estimatedTileCount > 0 ? 0.95 : 0.6;

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
            console.error(`[${this.agentName}] Failed to generate map config`, error);
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
