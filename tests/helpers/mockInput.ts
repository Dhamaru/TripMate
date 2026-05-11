/**
 * Sample inputs for the TravelOrchestrator to test its branching logic.
 */
export const mockOrchestratorInputs = {
  // Scenario: New suggestion request
  suggestion: {
    userId: 'user-123',
    style: 'cultural',
    budget: 'medium',
    continent: 'Asia',
    previousDestinations: [],
  },

  // Scenario: Itinerary generation for a selected destination
  itinerary: {
    userId: 'user-123',
    destination: 'Tokyo',
    startDate: '2025-06-01',
    endDate: '2025-06-03',
    travelStyles: ['cultural'],
    budgetRange: { min: 800, max: 1500 },
  },

  // Scenario: Weather investigation
  weather: {
    location: 'Tokyo',
    lat: 35.6762,
    lon: 139.6503,
  },
}
