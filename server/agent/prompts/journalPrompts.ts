// Task 13 — Journal AI prompts: contextualization, enhancement, and recap

export function buildContextualizationPrompt(
    entryText: string,
    entryDate: string,
    itinerary: Array<{ dayIndex: number; date: string; activities: Array<{ title: string; location: string }> }>
): string {
    const days = itinerary.map(day =>
        `Day ${day.dayIndex + 1} (${day.date}): ${day.activities.map(a => `${a.title} at ${a.location}`).join(', ')}`
    ).join('\n')

    return `
Analyze this journal entry and determine which itinerary day it most likely belongs to.

JOURNAL ENTRY (written on ${entryDate}):
"${entryText}"

ITINERARY:
${days}

Consider: place names mentioned, activities described, emotional context, date proximity.

Output ONLY this JSON:
{
  "dayIndex": number,
  "confidence": "High" | "Medium" | "Low",
  "reasoning": string
}
  `.trim()
}

export function buildEnhancementPrompt(originalText: string): string {
    return `
Enhance this travel journal entry. Rules:
- Improve grammar and add vivid, descriptive language
- Preserve the writer's voice and all factual details exactly
- Never invent events, people, or places not in the original
- Keep the same perspective and tense

ORIGINAL:
"${originalText}"

Output ONLY this JSON:
{
  "enhanced": string,
  "changesSummary": string
}

changesSummary: one sentence describing what was improved.
  `.trim()
}

export function buildRecapPrompt(
    entries: Array<{ text: string; entryDate: string; assignedDayIndex?: number }>,
    tripMeta: { destination: string; startDate: string; endDate: string }
): string {
    const entriesSummary = entries
        .map((e, i) => `Entry ${i + 1} (${e.entryDate}): ${e.text.slice(0, 300)}`)
        .join('\n\n')

    return `
Write a travel recap for a trip to ${tripMeta.destination} 
(${tripMeta.startDate} to ${tripMeta.endDate}).

JOURNAL ENTRIES:
${entriesSummary}

Write in first person, past tense, travel-magazine style.

Output ONLY this JSON:
{
  "title": string,
  "summary": string,
  "highlights": string[],
  "memorableMoment": string,
  "travelTip": string,
  "awards": Array<{ "title": string, "icon": string, "description": string }>,
  "visualVibe": string
}
  `.trim()
}
