// Task 4 — API type definitions matching backend schemas

// Auth
export interface SignInRequest {
  email: string;
  password: string;
}
export interface SignUpRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  profileImageUrl?: string;
  isGuest?: boolean;
  googleConnected?: boolean;
  googleId?: string;
}

// Trips
export type TravelStyle =
  | "Luxury"
  | "Adventure"
  | "Budget"
  | "Relaxed"
  | "Cultural"
  | "Family"
  | "adventure"
  | "relaxed"
  | "cultural"
  | "culinary"
  | "standard"
  | "budget"
  | "luxury"
  | "family";
export type TravelMedium =
  | "Flight"
  | "Train"
  | "RoadTrip"
  | "car"
  | "bus"
  | "flight"
  | "train"
  | "walk"
  | "transit"
  | "road";
export interface ICollaborator {
  userId: string | AuthUser;
  role: "editor" | "viewer";
  joinedAt: string | Date;
}
export interface CreateTripRequest {
  origin?: string;
  destination: string;
  startDate: string;
  endDate: string;
  totalBudget: number;
  travelStyle: TravelStyle;
  travelMedium: TravelMedium;
  companions: number;
}
export interface BudgetBreakdown {
  accommodation: number;
  food: number;
  transport: number;
  activities: number;
  safetyBuffer: number;
  grandTransit?: number;
}
export interface ItineraryActivity {
  id: string;
  time: string;
  placeName: string;
  address?: string;
  lat?: number;
  lon?: number;
  type?: string;
  entryFeeINR?: number;
  duration_minutes?: number;
  localFoodRecommendations?: string[];
  votes?: number;
  vibeSignals?: string[];
  routeFromPrevious?: {
    distance_km: number;
    travel_time_minutes: number;
    from: string;
  };
}
export type Activity = ItineraryActivity;

export interface ItineraryDay {
  dayIndex: number;
  day: number;
  date?: string | Date;
  activities: ItineraryActivity[];
  aiReasoning?: string;
  modelConfidence?: "High" | "Medium" | "Low";
}
export interface Trip {
  id?: string;
  _id?: string;
  userId: string;
  origin?: string;
  destination: string;
  startDate: string | Date;
  endDate: string | Date;
  totalBudget: number;
  budget?: number; // Backwards compatibility for TipDetail
  travelStyle: TravelStyle;
  travelMedium: TravelMedium;
  transportMode?: TravelMedium;
  companions: number;
  groupSize?: string | number;
  status: "planning" | "active" | "completed";
  notes?: string;
  imageUrl?: string;
  imageCaption?: string;
  destinationPhotoUrl?: string;
  currency?: string;
  days: number;
  budgetBreakdown: BudgetBreakdown;
  itinerary: ItineraryDay[];
  expenses?: any[]; // Added for BudgetTracker
  collaborators?: ICollaborator[];
  createdAt: string | Date;
}

// Agent
export interface PendingConfirmation {
  id: string;
  toolName: string;
  summary: string;
}
export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  timestamp: string;
  isStreaming?: boolean;
  pendingConfirmation?: PendingConfirmation;
}
export interface SuggestedAction {
  label: string;
  action: "navigate" | "applyChanges" | "openTool";
  payload: unknown;
}
export interface AgentStructuredData {
  type: "trip" | "itineraryDay" | "packingList" | "budgetBreakdown";
  data: unknown;
}
export interface AgentResponse {
  response?: string;
  message?: string; // Added for backend compatibility
  conversationId: string;
  toolsUsed: string[];
  suggestedActions?: SuggestedAction[];
  structuredData?: AgentStructuredData;
  pendingConfirmation?: PendingConfirmation;
}
export interface AgentChatRequest {
  message: string;
  conversationId?: string;
  context?: {
    currentTripId?: string;
    currentPage?: string;
  };
}

// Packing
export interface PackingItem {
  id: string;
  name: string;
  quantity: number;
  category: string;
  essential: boolean;
  note?: string;
  checked: boolean;
}
export interface PackingCategory {
  name: string;
  icon: string;
  items: PackingItem[];
}
export interface PackingList {
  id: string;
  tripId: string;
  categories: PackingCategory[];
  weatherNote?: string;
  totalItems: number;
}

// Journal
export interface JournalEntry {
  id: string;
  tripId: string;
  title?: string;
  text: string;
  content?: string; // Alias for text or specific content
  location?: string;
  images?: string[];
  entryDate: string;
  assignedDayIndex?: number;
  contextualizationConfidence?: "High" | "Medium" | "Low";
  // The server schema (shared/schema.ts IJournalEntry) only ever sets
  // `isRecap: boolean` — there is no `type` field in the real API
  // response. A `type: 'entry' | 'recap'` field was declared here but
  // never actually populated by the server, which made
  // `e.type === 'recap'` in TripDetail.tsx silently always false.
  isRecap?: boolean;
  createdAt: string;
}
