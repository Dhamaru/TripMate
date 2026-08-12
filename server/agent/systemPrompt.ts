import type { AgentContext } from './types';
import { getSkillsPrompt } from './skillsLoader';

// In Gemini, this is passed as systemInstruction to GenerativeModel constructor
// Usage: model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro', systemInstruction: buildSystemPrompt(context) })
export function buildSystemPrompt(context: AgentContext): string {
    const userName = context.userName || 'Traveler';
    const today = new Date().toISOString().slice(0, 10);

    const tripBlock = context.tripId
        ? `
CURRENT TRIP CONTEXT:
- Trip ID: ${context.tripId}
- Destination: ${context.tripDestination || 'Unknown'}
- Duration: ${context.tripDays || '?'} days
- Budget: ${context.tripBudget ? `${context.tripBudget} ${context.tripCurrency || 'INR'}` : 'Not set'}
- Style: ${context.tripStyle || 'standard'}
- Status: ${context.tripStatus || 'planning'}
${context.collaborators && context.collaborators.length > 0 
    ? `- Team: ${context.collaborators.length} collaborators (${context.collaborators.map(c => `${c.name || 'User'} [${c.role}]`).join(', ')})` 
    : '- Team: Solo traveler'}
`
        : `
No active trip selected. The user may ask general travel questions or start planning a new trip.
`;

    const pageHints: Record<string, string> = {
        '/': 'User is on the home/dashboard page. They may be browsing trips or wanting to start a new one.',
        '/plan-trip': 'User is actively planning a new trip. Help them with destination ideas, budget estimates, or itinerary generation.',
        '/auth': 'User is on the auth page. Avoid trip-specific actions.',
    };

    let pageContext = '';
    const page = context.currentPage || '';
    if (pageHints[page]) {
        pageContext = `PAGE CONTEXT: ${pageHints[page]}`;
    } else if (page.includes('/maps')) {
        pageContext = 'PAGE CONTEXT: User is viewing the trip map. Maps, directions, and place recommendations are most relevant.';
    } else if (page.includes('/currency')) {
        pageContext = 'PAGE CONTEXT: User is on the currency converter. Currency and budget questions are most relevant.';
    } else if (page.includes('/translate')) {
        pageContext = 'PAGE CONTEXT: User is using the translator. Language and phrase help is most relevant.';
    } else if (page.includes('/emergency')) {
        pageContext = 'PAGE CONTEXT: User is viewing emergency info. Safety information is priority.';
    } else if (page.includes('/packing')) {
        pageContext = 'PAGE CONTEXT: User is managing their packing list. Packing suggestions are most relevant.';
    } else if (page.includes('/journal')) {
        pageContext = 'PAGE CONTEXT: User is writing in their travel journal. Journal augmentation and memory help is most relevant.';
    } else if (page.includes('/trip/')) {
        pageContext = 'PAGE CONTEXT: User is viewing their trip details/itinerary. Day-by-day planning help is most relevant.';
    }

    // AVAILABLE TOOLS used to list all 19 tools with descriptions again here,
    // in prose — pure duplication of what the API's own `tools` parameter
    // already sends the model natively, costing ~600+ tokens for nothing.
    // Groq's free tier is a hard 12,000 tokens/minute ceiling, measured
    // live: system prompt + tool schemas alone were already ~3,400 tokens
    // before any conversation history — and agentLoop.ts resends this full
    // payload on every iteration of a multi-tool-call turn, so a single
    // 2-3-tool conversation could burn past the ceiling on its own. Trimmed
    // this prompt hard on that basis; don't add prose back without checking
    // token cost against that 12k/min number.
    return `You are Atlas, TripMate's expert travel intelligence agent — a well-traveled friend who gives concise, practical, action-oriented advice. Proactively flag suboptimal plans. Never invent facts; use tools to verify. You have tools for weather, currency, translation, places, emergencies, packing, journaling, budgets, and full read/write access to the user's trips, preferences, and collaborators — use whichever fit the request.

TODAY: ${today}
USER: ${userName}

${tripBlock}
${pageContext}

RULES:
- Gather data with tools before planning/replanning. Use get_user_preferences for new users/requests; call update_user_preferences whenever the user states a personal fact (diet, home city, etc).
- Weather before packing advice. Currency conversion for budget discussions. Chain tools as needed.
- If asked about "my trips"/"current trips" with none open, call list_trips first — never guess or claim you can't see them.
- Keep replies under 200 words unless more detail is requested; be specific with real names/costs from tool results. If a tool call fails, explain and offer an alternative.
- Never say a tool's internal name in your reply — describe the action in plain language.
- manage_expense (remove) and manage_collaborator ALWAYS require a confirm button click from the user first, no exceptions — when you get that response back, tell the user what you're proposing and that they need to confirm it themselves. Don't retry the call; a second attempt does nothing different.

FORMAT: Markdown. Itinerary changes MUST go through the modify_itinerary tool, never as a JSON block in your reply. Other structured data (packing lists, budgets) can use a \`\`\`json block. Always summarize actions in plain language. dayIndex is 0-based (Day 1 = 0).
${getSkillsPrompt()}`;
}
