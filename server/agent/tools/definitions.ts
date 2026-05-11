// Atlas Agent — Tool Definitions (OpenAI & Gemini formats)

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * OpenAI format tool definitions
 */
export const TRIPMATE_TOOLS: ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'get_weather',
            description:
                'Get current weather conditions and 7-day forecast for a location. Returns temperature, humidity, wind, precipitation chance, and packing recommendations.',
            parameters: {
                type: 'object',
                properties: {
                    location: {
                        type: 'string',
                        description: 'City name or location to get weather for',
                    },
                    units: {
                        type: 'string',
                        enum: ['metric', 'imperial'],
                        description: 'Temperature units (default: metric)',
                    },
                },
                required: ['location'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'convert_currency',
            description:
                'Convert an amount between currencies using real exchange rates (Frankfurter API).',
            parameters: {
                type: 'object',
                properties: {
                    amount: { type: 'number', description: 'Amount to convert' },
                    from: {
                        type: 'string',
                        description: 'Source currency code (e.g., USD)',
                    },
                    to: {
                        type: 'string',
                        description: 'Target currency code (e.g., INR)',
                    },
                },
                required: ['amount', 'from', 'to'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'translate_text',
            description:
                'Translate text between languages using MyMemory API. Returns translated text and source language detection.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Text to translate' },
                    sourceLang: {
                        type: 'string',
                        description:
                            "Source language code or 'auto' for detection (default: auto)",
                    },
                    targetLang: {
                        type: 'string',
                        description: "Target language code (e.g., 'hi', 'ja', 'fr')",
                    },
                },
                required: ['text', 'targetLang'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_places',
            description:
                'Search for places (hotels, restaurants, attractions) near a location using Google Places API. Returns name, rating, address, and coordinates.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: "Search query (e.g., 'best restaurants in Tokyo')",
                    },
                    category: {
                        type: 'string',
                        enum: ['hotels', 'restaurants', 'tourist-spots', 'general'],
                        description: 'Place category filter',
                    },
                    location: {
                        type: 'string',
                        description: 'Location context (city name or coordinates)',
                    },
                    maxResults: {
                        type: 'integer',
                        description: 'Max results to return (default: 5, max: 10)',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_emergency_info',
            description:
                'Get emergency services (hospitals, police, pharmacies, embassies) near a location with phone numbers and SOS contacts.',
            parameters: {
                type: 'object',
                properties: {
                    destination: {
                        type: 'string',
                        description: 'City or country name',
                    },
                    infoType: {
                        type: 'string',
                        enum: ['hospitals', 'police', 'pharmacies', 'embassies', 'all'],
                        description:
                            "Type of emergency info to retrieve (default: 'all')",
                    },
                },
                required: ['destination'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_travel_hacks',
            description:
                'Get budget-saving travel hacks and economical alternatives specific to a destination.',
            parameters: {
                type: 'object',
                properties: {
                    destination: { type: 'string', description: 'City or region' },
                    travelStyle: {
                        type: 'string',
                        description:
                            "Travel style for context (e.g., 'budget', 'luxury')",
                    },
                },
                required: ['destination'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'generate_packing_list',
            description:
                'Generate a smart packing list based on destination, weather, trip duration, and travel style. Returns categorized items.',
            parameters: {
                type: 'object',
                properties: {
                    destination: {
                        type: 'string',
                        description: 'Travel destination',
                    },
                    days: {
                        type: 'integer',
                        description: 'Trip duration in days',
                    },
                    travelStyle: {
                        type: 'string',
                        description:
                            "Travel style (e.g., 'adventure', 'luxury', 'cultural')",
                    },
                    weatherContext: {
                        type: 'string',
                        description:
                            "Weather summary (e.g., 'mostly sunny, 28-32°C, rain on day 3')",
                    },
                    activities: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                            "Planned activity types (e.g., ['hiking', 'temple visits'])",
                    },
                },
                required: ['destination', 'days', 'travelStyle'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'augment_journal',
            description:
                'Enhance a travel journal entry with contextual details, suggested labels/tags, and sentiment analysis.',
            parameters: {
                type: 'object',
                properties: {
                    content: {
                        type: 'string',
                        description: 'Raw journal text written by the traveler',
                    },
                    destination: {
                        type: 'string',
                        description: 'Trip destination for context',
                    },
                    dayOfTrip: {
                        type: 'integer',
                        description: 'Which day of the trip this entry is for',
                    },
                },
                required: ['content'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_budget_breakdown',
            description:
                'Calculate budget allocation breakdown by travel style. Returns how much to allocate for accommodation, food, transport, activities, and safety buffer.',
            parameters: {
                type: 'object',
                properties: {
                    totalBudget: {
                        type: 'number',
                        description: 'Total trip budget amount',
                    },
                    travelStyle: {
                        type: 'string',
                        enum: [
                            'budget',
                            'standard',
                            'luxury',
                            'adventure',
                            'relaxed',
                            'cultural',
                        ],
                        description: 'Travel style preference',
                    },
                    currency: {
                        type: 'string',
                        description: 'Budget currency code',
                    },
                    origin: {
                        type: 'string',
                        description: 'Travel starting location',
                    },
                    destination: {
                        type: 'string',
                        description: 'Trip destination',
                    },
                    travelMedium: {
                        type: 'string',
                        description: 'Mode of transport (flight, train, bus, car)',
                    },
                },
                required: ['totalBudget', 'travelStyle', 'origin', 'destination'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_trip_details',
            description:
                'Fetch full trip details including itinerary, budget, and status for a specific trip.',
            parameters: {
                type: 'object',
                properties: {
                    tripId: {
                        type: 'string',
                        description: 'ID of the trip to retrieve',
                    },
                    userId: {
                        type: 'string',
                        description: 'User ID for authorization',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'finalize_trip_plan',
            description:
                'Finalize a suggested trip plan by saving the full itinerary to the database. This should be called when the user is satisfied with the proposed plan.',
            parameters: {
                type: 'object',
                properties: {
                    tripId: {
                        type: 'string',
                        description: 'ID of the trip to finalize',
                    },
                    userId: {
                        type: 'string',
                        description: 'User ID for authorization',
                    },
                    itinerary: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                day: { type: 'integer' },
                                activities: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            time: { type: 'string' },
                                            title: { type: 'string' },
                                            location: { type: 'string' },
                                            notes: { type: 'string' },
                                            latitude: { type: 'number' },
                                            longitude: { type: 'number' },
                                        },
                                        required: ['title'],
                                    },
                                },
                            },
                        },
                    },
                },
                required: ['itinerary'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'modify_itinerary',
            description:
                'Surgically modify an existing trip itinerary. Can replace a whole day, add an activity, remove an activity, or swap activities.',
            parameters: {
                type: 'object',
                properties: {
                    tripId: {
                        type: 'string',
                        description: 'ID of the trip to modify',
                    },
                    action: {
                        type: 'string',
                        enum: [
                            'replace_day',
                            'add_activity',
                            'remove_activity',
                            'swap_activities',
                        ],
                        description: 'Type of modification to perform',
                    },
                    dayIndex: {
                        type: 'integer',
                        description: 'The day index (0-based) to modify',
                    },
                    activityId: {
                        type: 'string',
                        description:
                            'ID of the activity to remove or swap (if applicable)',
                    },
                    activity: {
                        type: 'object',
                        description: 'New activity to add or replace with',
                        properties: {
                            time: { type: 'string' },
                            title: { type: 'string' },
                            address: { type: 'string' },
                            location: { type: 'string' },
                            type: { type: 'string' },
                            category: { type: 'string' },
                            duration_minutes: { type: 'number' },
                            notes: { type: 'string' },
                            description: { type: 'string' },
                            cost: { type: 'number' },
                            latitude: { type: 'number' },
                            longitude: { type: 'number' },
                            id: { type: 'string' },
                        },
                        additionalProperties: true,
                    },
                    activities: {
                        type: 'array',
                        description: 'Full list of activities for replace_day',
                        items: {
                            type: 'object',
                            properties: {
                                time: { type: 'string' },
                                title: { type: 'string' },
                                address: { type: 'string' },
                                location: { type: 'string' },
                                type: { type: 'string' },
                                category: { type: 'string' },
                                duration_minutes: { type: 'number' },
                                notes: { type: 'string' },
                                description: { type: 'string' },
                                cost: { type: 'number' },
                                latitude: { type: 'number' },
                                longitude: { type: 'number' },
                                id: { type: 'string' },
                            },
                            additionalProperties: true,
                        },
                    },
                },
                required: ['action', 'dayIndex'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_user_preferences',
            description:
                'Get the traveler profile and preferences including home city, dietary needs, preferred transport, and interests.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'User ID for authorization' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'update_user_preferences',
            description:
                'Update the traveler profile with new preferences like home city, dietary needs, or interests.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'User ID for authorization' },
                    homeCity: { type: 'string', description: 'Users home city base' },
                    dietaryPreferences: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of dietary requirements (e.g., vegan, halal)',
                    },
                    preferredTransport: {
                        type: 'string',
                        description: 'Preferred mode of local transport',
                    },
                    interests: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Broad interests (e.g., history, scuba, nightlife)',
                    },
                    name: { type: 'string', description: 'Users full name' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'collaborate_with_agents',
            description:
                'Trigger a multi-agent collaboration pipeline for complex tasks (budget audits, weather-impacted packing, itinerary restructuring). Atlas will delegate to specialized agents.',
            parameters: {
                type: 'object',
                properties: {
                    request: { 
                        type: 'string', 
                        description: 'The specific request for the agents (e.g., "Check how the rain tomorrow affects my packing and budget")' 
                    }
                },
                required: ['request'],
            },
        },
    },
];

