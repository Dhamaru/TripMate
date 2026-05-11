import { Groq } from 'groq-sdk';

/** Types of triggers that start the orchestrator pipeline */
export type OrchestratorTrigger = 
  | 'dashboard_load'
  | 'trip_create'
  | 'trip_view'
  | 'chat_message'
  | 'journal_entry'
  | 'preferences_change'
  | 'packing_request'
  | 'expense_audit';

/** Names of the 7 specialized agents */
export type AgentName = 
  | 'SuggestionAgent'
  | 'HeroImageAgent'
  | 'ItineraryAgent'
  | 'BudgetAgent'
  | 'MapAgent'
  | 'PackingAgent'
  | 'JournalAgent'
  | 'MasterOrchestrator';

/** Standardized output schema for all agents */
export interface AgentResult<T = any> {
  agent: AgentName;
  success: boolean;
  data: T | null;
  error?: string;
  confidence: number;
  tokensUsed: number;
  durationMs: number;
  toolCallCount: number;
}

export interface UserPreferences {
  travelStyles: string[];
  budgetTier: 'budget' | 'moderate' | 'luxury';
  currency: string;
  preferredTemperatures: string[];
  dietaryRestrictions: string[];
  interests: string[];
}

export interface TripContext {
  id?: string;
  destination: string;
  country?: string;
  startDate: string;
  endDate: string;
  budget: number;
  currency: string;
  travelStyle: string;
  travelMedium: string;
  companions: number;
  destinationPhotoUrl?: string;
  expenses?: Array<{
    amount: number;
    category: string;
    description: string;
    date: Date;
    currency: string;
  }>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OrchestratorContext {
  userPreferences?: UserPreferences;
  trip?: TripContext;
  currentPage?: string;
  chatHistory?: ChatMessage[];
  pastTripDestinations?: string[];
}

export interface OrchestratorInput {
  userId: string;
  tripId?: string;
  message?: string;
  trigger: OrchestratorTrigger;
  context: OrchestratorContext;
}

export interface OrchestratorResult {
  jobId: string;
  trigger: OrchestratorTrigger;
  results: AgentResult[];
  totalTokensUsed: number;
  totalDurationMs: number;
  successCount: number;
  failureCount: number;
}
