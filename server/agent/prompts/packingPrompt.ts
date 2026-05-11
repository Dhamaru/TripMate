// Task 10 — Packing prompt for the agentic packing list generator

export function buildPackingPrompt(tripContext: {
    destination: string
    startDate: string
    endDate: string
    travelStyle: string
    activities: string[]
    companions: number
}): string {
    const days = Math.ceil(
        (new Date(tripContext.endDate).getTime() - new Date(tripContext.startDate).getTime())
        / (1000 * 60 * 60 * 24)
    )
    return `
You are Atlas, a packing expert. Generate a smart packing list for this trip.

TRIP: ${tripContext.destination} for ${days} days
STYLE: ${tripContext.travelStyle}
GROUP: ${tripContext.companions} traveler(s)
ACTIVITIES: ${tripContext.activities.join(', ')}

INSTRUCTIONS:
1. FIRST call get_weather tool for ${tripContext.destination} between ${tripContext.startDate} and ${tripContext.endDate}
2. THEN generate the packing list using weather + activities + travel style

Output ONLY this exact JSON — no prose:
{
  "categories": [
    {
      "name": string,
      "icon": string,
      "items": [
        { "name": string, "quantity": number, "essential": boolean, "note": string | null }
      ]
    }
  ],
  "weatherNote": string,
  "totalItems": number
}

Category guidelines:
- Clothing: weather-appropriate, travelStyle-appropriate (Luxury=formal, Adventure=gear)
- Documents: passport, visa if needed, insurance — always mark essential: true
- Toiletries: basics + destination-specific items
- Electronics: chargers, adapters for destination country
- Activity gear: specific to activities listed
- mark essential: true for items that cannot be bought easily at destination
  `.trim()
}
