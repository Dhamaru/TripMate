// Smoke test for Atlas Agent Loop (Mocked for Groq)
import { runAgentLoop } from './agent/agentLoop';
import { AgentInput } from './agent/types';

async function smokeTest() {
    console.log('--- Atlas Agent Loop Smoke Test (Groq) ---');

    const mockGroq: any = {
        chat: {
            completions: {
                create: async () => ({
                    choices: [{
                        message: {
                            content: 'Hello! I am Atlas, your travel friend (Groq Powered). I see you are on the home page.',
                            tool_calls: []
                        }
                    }],
                    usage: { total_tokens: 15 }
                })
            }
        }
    };

    const mockAiService: any = {
        emergency: async () => [],
        searchPlaces: async () => [],
        calculateBudgetBreakdown: () => ({}),
        augmentJournalEntry: async () => ({}),
        getTravelHacks: async () => ({}),
    };

    const input: AgentInput = {
        message: 'Hello',
        userId: 'test-user',
        context: {
            userId: 'test-user',
            userName: 'Test Traveler',
            currentPage: '/',
        },
    };

    try {
        const response = await runAgentLoop(input, {
            openai: mockGroq,
            aiService: mockAiService,
        });

        console.log('Response Message:', response.message);
        console.log('Tools Used:', response.toolsUsed);
        console.log('Confidence:', response.confidence);
        console.log('Tokens Used:', response.tokensUsed);

        if (response.message.includes('Atlas') && response.confidence.score === 1) {
            console.log('✅ Smoke Test PASSED');
        } else {
            console.error('❌ Smoke Test FAILED: Unexpected response shape');
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Smoke Test CRASHED:', err);
        process.exit(1);
    }
}

smokeTest();
