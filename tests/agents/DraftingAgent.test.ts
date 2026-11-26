/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftingAgent } from '../../server/services/agents/DraftingAgent'

describe('DraftingAgent', () => {
    let draftingAgent: DraftingAgent
    const mockOpenAI = {
        chat: {
            completions: {
                create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: '{"rawDraft": "Initial Draft Content"}', role: 'assistant' } }]
                })
            }
        }
    }

    beforeEach(() => {
        draftingAgent = new DraftingAgent({ openai: mockOpenAI, geminiHelper: {} })
    })

    it('should generate an initial draft based on context', async () => {
        const goal = 'Plan a trip to Tokyo'
        const context = { weather: 'Sunny', places: ['Senso-ji'] }
        const constraints = { destination: 'Tokyo', days: 3 }

        const result = await draftingAgent.generateDraft(goal, context, constraints)
        expect(result.rawDraft.rawDraft).toEqual('Initial Draft Content')
    })
})
