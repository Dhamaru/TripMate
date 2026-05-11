import { vi } from 'vitest'

// Default mock response — valid JSON that all agents can parse
export const mockGroqSuggestionResponse = {
  id: 'chatcmpl-test',
  choices: [{
    message: {
      role: 'assistant',
      content: JSON.stringify({
        suggestions: [
          {
            id: 'sug-1', destination: 'Tokyo', country: 'Japan',
            continent: 'Asia', tagline: 'A city of endless discovery',
            highlights: ['Senso-ji Temple', 'Shibuya Crossing', 'Ramen'],
            estimatedBudget: { min: 800, max: 1400, currency: 'USD', basis: 'per person, 7 days' },
            bestTimeToVisit: 'March–May or September–November',
            travelStyles: ['cultural', 'adventure'],
            confidence: 0.87,
            reasoning: 'Matches user interest in culture and food',
            imageQuery: 'tokyo aerial cityscape',
          },
          {
            id: 'sug-2', destination: 'Lisbon', country: 'Portugal',
            continent: 'Europe', tagline: 'Sun-soaked streets and seafood',
            highlights: ['Alfama district', 'Pastéis de Belém', 'Tram 28'],
            estimatedBudget: { min: 600, max: 1100, currency: 'USD', basis: 'per person, 7 days' },
            bestTimeToVisit: 'April–October',
            travelStyles: ['relaxed', 'cultural'],
            confidence: 0.79,
            reasoning: 'Budget-friendly European city matching user preferences',
            imageQuery: 'lisbon tram street golden hour',
          },
          {
            id: 'sug-3', destination: 'Bali', country: 'Indonesia',
            continent: 'Asia', tagline: 'Spiritual landscapes and surf',
            highlights: ['Ubud rice terraces', 'Tanah Lot', 'Seminyak beach'],
            estimatedBudget: { min: 500, max: 900, currency: 'USD', basis: 'per person, 7 days' },
            bestTimeToVisit: 'April–October',
            travelStyles: ['relaxed', 'adventure'],
            confidence: 0.83,
            reasoning: 'Under minimum budget, new continent for user',
            imageQuery: 'bali rice terraces aerial',
          },
          {
            id: 'sug-4', destination: 'Medellín', country: 'Colombia',
            continent: 'South America', tagline: 'Eternal spring city',
            highlights: ['Pablo Escobar tour', 'Cable car', 'Nightlife'],
            estimatedBudget: { min: 400, max: 800, currency: 'USD', basis: 'per person, 7 days' },
            bestTimeToVisit: 'Year-round',
            travelStyles: ['adventure', 'budget'],
            confidence: 0.71,
            reasoning: 'Different continent, within budget range',
            imageQuery: 'medellin cable car city night',
          },
        ],
        totalSuggestions: 4,
        generatedAt: '2025-06-01T10:00:00.000Z',
      }),
      tool_calls: null,
    },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 500, completion_tokens: 400, total_tokens: 900 },
}

export const mockGroqItineraryResponse = {
  id: 'chatcmpl-test-2',
  choices: [{
    message: {
      role: 'assistant',
      content: JSON.stringify({
        itinerary: [
          {
            dayIndex: 1,
            date: '2025-06-01',
            theme: 'Culture & History',
            confidence: 0.88,
            reasoning: 'Clustered attractions in central Tokyo',
            activities: [
              {
                id: 'act-1', time: '09:00', endTime: '11:30',
                title: 'Senso-ji Temple', location: 'Asakusa, Tokyo',
                coordinates: { lat: 35.7148, lng: 139.7967 },
                durationMinutes: 150, category: 'attraction',
                estimatedCost: 0, currency: 'USD',
                notes: 'Free entry. Arrive early to avoid crowds.',
                bookingRequired: false,
              },
              {
                id: 'act-2', time: '12:30', endTime: '13:30',
                title: 'Ramen lunch at Ichiran', location: 'Shibuya, Tokyo',
                coordinates: { lat: 35.6595, lng: 139.7004 },
                durationMinutes: 60, category: 'food',
                estimatedCost: 15, currency: 'USD',
                notes: 'Solo booth ramen experience',
                bookingRequired: false,
              },
              {
                id: 'act-3', time: '14:30', endTime: '17:00',
                title: 'Shibuya Crossing & surrounds', location: 'Shibuya, Tokyo',
                coordinates: { lat: 35.6586, lng: 139.7010 },
                durationMinutes: 150, category: 'attraction',
                estimatedCost: 0, currency: 'USD',
                notes: 'Watch the famous scramble crossing',
                bookingRequired: false,
              },
            ],
          },
        ],
        totalActivities: 3,
        estimatedTotalCost: 15,
        weatherSummary: 'Clear skies, 28°C. Light layers recommended.',
        travelTips: [
          'Get a Suica card for transit', 'Carry cash — many places are cash only',
          'Book popular restaurants in advance',
        ],
        validationWarnings: [],
      }),
    },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 800, completion_tokens: 600, total_tokens: 1400 },
}

// Factory for Groq mock — call this in beforeEach
export function createGroqMock(overrides?: any) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(
          overrides?.response ?? mockGroqSuggestionResponse
        ),
      },
    },
  }
}
