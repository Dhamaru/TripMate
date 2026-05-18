import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'TripMate API',
            version: '2.0.0',
            description: 'TripMate backend — trips, AI utilities, agent, auth',
        },
        servers: [{ url: '/api/v1', description: 'Current server' }],
        components: {
            securitySchemes: {
                cookieAuth: { type: 'apiKey', in: 'cookie', name: 'connect.sid' },
            },
            schemas: {
                Trip: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        destination: { type: 'string' },
                        startDate: { type: 'string', format: 'date' },
                        endDate: { type: 'string', format: 'date' },
                        budget: { type: 'number' },
                        travelers: { type: 'number' },
                        imageUrl: { type: 'string' },
                    },
                },
                WeatherResponse: {
                    type: 'object',
                    properties: {
                        current: {
                            type: 'object',
                            properties: {
                                temperature: { type: 'number' },
                                condition: { type: 'string' },
                                humidity: { type: 'number' },
                                windSpeed: { type: 'number' },
                            },
                        },
                        forecast: { type: 'array', items: { type: 'object' } },
                        recommendations: { type: 'array', items: { type: 'string' } },
                        source: { type: 'string', enum: ['openweather', 'ai', 'fallback-route', 'fallback'] },
                    },
                },
                EmergencyResponse: {
                    type: 'object',
                    properties: {
                        services: { type: 'array', items: { type: 'object' } },
                        countryCode: { type: 'string' },
                        sosNumbers: {
                            type: 'object',
                            properties: {
                                police: { type: 'string' },
                                medical: { type: 'string' },
                                fire: { type: 'string' },
                                common: { type: 'string' },
                            },
                        },
                    },
                },
                CurrencyResponse: {
                    type: 'object',
                    properties: {
                        rate: { type: 'number' },
                        convertedAmount: { type: 'number' },
                        currencyName: { type: 'string' },
                        disclaimer: { type: 'string' },
                    },
                },
                AgentMessage: {
                    type: 'object',
                    required: ['message'],
                    properties: {
                        message: { type: 'string' },
                        conversationId: { type: 'string' },
                        context: {
                            type: 'object',
                            properties: {
                                currentTripId: { type: 'string' },
                                currentPage: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
        tags: [
            { name: 'Auth', description: 'Authentication and session' },
            { name: 'Trips', description: 'Trip CRUD' },
            { name: 'AI Tools', description: 'Weather, currency, emergency, translation' },
            { name: 'Agent', description: 'Atlas AI chat agent' },
            { name: 'Health', description: 'Health and monitoring' },
        ],
    },
    apis: ['./server/routes/*.ts', './server/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
