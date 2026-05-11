# Atlas Agent — Prompt Reference

## Overview
Atlas uses **Groq** (`llama-3.3-70b-versatile`) as the primary LLM.  
All prompts are in `/server/agent/prompts/`.

Context window management: if estimated tokens > 4000, `summarizeIfNeeded()` in  
`agentLoop.ts` compresses old history into a 3-sentence summary automatically.

---

## buildSystemPrompt(context)
**File**: `/server/agent/systemPrompt.ts`  
**Purpose**: Base Atlas persona injected as the `system` message every turn.  
**Inputs**: `AgentContext { userId, tripId, currentPage, tripData? }`  
**Token estimate**: ~400–600 tokens  
**Output**: Single string

**Tuning notes**:
- More concise: `"Be extremely brief. Max 2 sentences per response."`
- More proactive: `"Always suggest the next logical action at the end."`
- Destination expert: `"You are a local expert. Share insider tips first."`

---

## buildPlanningPrompt(input)
**File**: `/server/agent/prompts/planningPrompt.ts`  
**Purpose**: Constructs a full trip planning request for the Atlas agentic loop.  
**Inputs**:
```ts
{
  destination: string
  startDate: string
  endDate: string
  totalBudget: number
  currency: string
  travelStyle: string
  travelMedium: string
  companions: number
  interests: string[]
}
```
**Output JSON schema**:
```json
{
  "itinerary": [
    {
      "dayIndex": 0,
      "date": "2025-06-01",
      "activities": [
        { "time": "09:00 AM", "title": "...", "location": "...", "type": "cultural", "lat": 0.0, "lng": 0.0 }
      ],
      "reasoning": "Why this day was planned this way",
      "confidenceScore": "high | medium | low"
    }
  ],
  "budgetBreakdown": { "accommodation": 0, "food": 0, "transport": 0, "activities": 0, "safetyBuffer": 0 }
}
```
**Token estimate**: ~300 tokens (input) → ~2000 tokens (output)  
**Tuning notes**:
- More outdoor activities: add `"Prioritize outdoor and nature experiences."`
- Budget focus: `"Minimize costs without sacrificing key attractions."`

---

## buildPackingPrompt(input)
**File**: `/server/agent/prompts/packingPrompt.ts`  
**Purpose**: Generates a context-aware packing list based on destination, weather, and activities.  
**Inputs**:
```ts
{
  destination: string
  startDate: string
  endDate: string
  travelStyle: string
  activities: string[]
  companions: number
}
```
**Output JSON schema**:
```json
{
  "categories": [
    {
      "name": "Clothing",
      "icon": "👕",
      "items": [
        { "name": "Light t-shirts", "quantity": 3, "essential": true, "note": "For humid weather" }
      ]
    }
  ],
  "weatherNote": "June in Tokyo is warm and humid (24–30°C).",
  "totalItems": 18
}
```
**Token estimate**: ~250 tokens (input) → ~800 tokens (output)  
**Tuning notes**:
- Add minimalism constraint: `"Assume carry-on only. Minimize items."`
- Family-specific: `"Include children's items if companions > 2."`

---

## buildContextualizationPrompt(text, date, itinerary)
**File**: `/server/agent/prompts/journalPrompts.ts`  
**Purpose**: Maps a journal entry to its most likely itinerary day.  
**Inputs**:
- `text`: journal entry content
- `date`: ISO date string of when it was written
- `itinerary`: `Array<{ dayIndex, date, activities: [{title, location}] }>`

**Output JSON schema**:
```json
{
  "dayIndex": 1,
  "confidence": "high | medium | low",
  "reasoning": "The entry mentions teamLab which was on Day 2."
}
```
**Token estimate**: ~400 tokens  
**Tuning notes**:
- Be strict: `"Only return high confidence if a specific activity name matches."`

---

## buildEnhancementPrompt(text)
**File**: `/server/agent/prompts/journalPrompts.ts`  
**Purpose**: Rewrites a journal entry with richer prose while preserving meaning.  
**Inputs**: `text: string`  
**Output JSON schema**:
```json
{
  "enhanced": "Enhanced version of the text...",
  "changesSummary": "Added sensory detail, improved flow, fixed grammar."
}
```
**Token estimate**: ~200 tokens (input) → ~400 tokens (output)  
**Tuning notes**:
- Preserve voice: `"Never change the first-person narrative voice."`
- Minimal changes: `"Only fix grammar and clarity. Do not add new content."`

---

## buildRecapPrompt(entries, trip)
**File**: `/server/agent/prompts/journalPrompts.ts`  
**Purpose**: Synthesizes all journal entries into a cohesive trip recap story.  
**Inputs**:
- `entries`: `Array<{ text, entryDate, assignedDayIndex }>`
- `trip`: `{ destination, startDate, endDate }`

**Minimum entries required**: 3  
**Output JSON schema**:
```json
{
  "title": "Three Days in Tokyo: A Journey Through Tradition and Technology",
  "summary": "A narrative paragraph...",
  "highlights": ["Senso-ji Temple at dawn", "teamLab Borderless digital art"],
  "memorableMoment": "The moment in the digital waterfall room.",
  "travelTip": "Get a Suica IC card at the airport—saves so much time."
}
```
**Token estimate**: ~600 tokens (input) → ~500 tokens (output)  
**Tuning notes**:
- Shorter output: `"Limit summary to 150 words maximum."`
- Formal tone: `"Write in a formal travel journalist style."`
