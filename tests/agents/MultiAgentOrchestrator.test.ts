/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MultiAgentOrchestrator } from '../../server/services/MultiAgentOrchestrator'

describe('MultiAgentOrchestrator', () => {
    let orchestrator: MultiAgentOrchestrator
    const mockOpenAI = {
        chat: {
            completions: {
                create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: '{"rawDraft": "Mocked Plan", "valid": true, "itinerary": []}' } }]
                })
            }
        }
    }
    const mockGemini = {}
    const mockPlaces = { search: vi.fn().mockResolvedValue([]) }
    const mockWeather = { getForecast: vi.fn().mockResolvedValue({}) }

    beforeEach(() => {
        orchestrator = new MultiAgentOrchestrator({
            openai: mockOpenAI,
            geminiHelper: mockGemini,
            places: mockPlaces,
            weather: mockWeather
        })
    })

    it('should initialize all specialized agents', () => {
        expect(orchestrator).toBeDefined()
        // Agents are private but we check the execution loop
    })

    it('should execute reasoning loop and return a final payload', async () => {
        const params = {
            goal: 'Plan a trip to Tokyo',
            constraints: { destination: 'Tokyo', days: 3, travelStyle: 'Cultural' }
        }

        const result = await orchestrator.executeReasoningLoop(params)
        expect(result).toBeDefined()
        // The formatting agent would have processed it
    })
})
