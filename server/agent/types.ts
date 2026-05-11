// Atlas Agent — Core Type Definitions

export type AppRoute =
    | '/'
    | '/auth'
    | '/plan-trip'
    | `/trip/${string}`
    | `/trip/${string}/maps`
    | `/trip/${string}/currency`
    | `/trip/${string}/translate`
    | `/trip/${string}/emergency`
    | `/trip/${string}/packing`
    | `/trip/${string}/journal`;

export interface AgentContext {
    userId: string;
    userName?: string;
    tripId?: string;
    tripDestination?: string;
    tripDays?: number;
    tripBudget?: number;
    tripCurrency?: string;
    tripStyle?: string;
    tripStatus?: string;
    collaborators?: Array<{ userId: string; role: string; name?: string }>;
    currentPage?: AppRoute | string;
    preferences?: Record<string, unknown>;
}

export interface AgentInput {
    message: string;
    userId: string;
    context: AgentContext;
    conversationHistory?: Message[];
    onToolCall?: (toolName: string) => void;
}

export interface Message {
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
    durationMs?: number;
}

export interface SuggestedAction {
    label: string;
    action: string;
    payload?: Record<string, unknown>;
}

export interface AgentStructuredData {
    itineraryUpdate?: {
        tripId: string;
        dayIndex: number;
        activities: unknown[];
    };
    budgetBreakdown?: {
        accommodation: number;
        food: number;
        transport: number;
        activities: number;
        buffer: number;
        total: number;
    };
    packingList?: {
        categories: Record<string, string[]>;
    };
    weatherForecast?: {
        avgHighTemp: number;
        avgLowTemp: number;
        precipitationChance: number;
        conditionsSummary: string;
        packingFlag: string;
    };
    currencyConversion?: {
        amount: number;
        from: string;
        to: string;
        convertedAmount: number;
        rate: number;
    };
    agentCollaboration?: {
        summary: string;
        results: Array<{
            agent: string;
            success: boolean;
            data: any;
            confidence: number;
        }>;
    };
}

export interface Mutation {
    type: 'itinerary_updated' | 'budget_updated' | 'packing_list_updated' | 'profile_updated';
    tripId?: string;
    dayIndex?: number;
    payload?: Record<string, any>;
}

export interface AgentResponse {
    message: string;
    toolsUsed: string[];
    structuredData?: AgentStructuredData;
    suggestedActions?: SuggestedAction[];
    confidence: {
        score: number;
        level: 'high' | 'medium' | 'low';
        signals?: {
            tools: number;
            grounding: number;
            consistency: number;
            coverage: number;
        };
    };
    feasibilityScore?: number;
    mutations?: Mutation[];
    tokensUsed?: number;
}
