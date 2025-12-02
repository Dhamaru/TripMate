# TripMate

TripMate is an AI-powered travel companion application.

## Features
- **Smart Trip Planner**: Generate personalized itineraries.
- **Travel Journal**: Document your trips.
- **Weather Insights**: Get forecasts for your destinations.
- **Currency Converter**: Real-time exchange rates.
- **Emergency Services**: Locate help nearby.

### Trip Deletion Behavior
When deleting a trip, the application now handles authentication errors gracefully. If your session has expired:
1. An authentication modal will appear instead of redirecting you.
2. You can choose to sign in again or cancel.
3. The application attempts to refresh your token automatically before showing the error.
