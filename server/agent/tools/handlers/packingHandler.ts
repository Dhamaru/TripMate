// Packing List Handler — Groq sub-call for structured categories

import type { ToolResult } from '../../types';
import OpenAI from 'openai';

export async function packingHandler(
    args: { destination: string; days: number; travelStyle: string; weatherContext?: string; activities?: string[]; tripId?: string },
    deps: { openai: OpenAI | null }
): Promise<ToolResult> {
    const start = Date.now();
    try {
        const { tripId } = args;
        if (!deps.openai) {
            return { success: false, error: 'OpenAI (NVIDIA NIM) not configured', durationMs: Date.now() - start };
        }

        const packingPrompt = `Generate a packing list for a ${args.days}-day ${args.travelStyle} trip to ${args.destination}.
${args.weatherContext ? `Weather forecast: ${args.weatherContext}` : ''}
${args.activities?.length ? `Planned activities: ${args.activities.join(', ')}` : ''}

Return ONLY a JSON object with category keys and string array values. Categories must include: "clothing", "toiletries", "electronics", "documents", "miscellaneous". Add extra categories if the trip type demands it (e.g., "hiking_gear", "beach_essentials").

Example format:
{
  "clothing": ["2 t-shirts", "1 jacket"],
  "toiletries": ["toothbrush", "sunscreen"],
  "electronics": ["phone charger"],
  "documents": ["passport", "travel insurance"],
  "miscellaneous": ["day backpack"]
}`;

        const response = await deps.openai.chat.completions.create({
            model: 'meta/llama-3.3-70b-instruct',
            messages: [
                { role: 'system', content: 'You are a packing expert. Output ONLY valid JSON. No prose, no markdown.' },
                { role: 'user', content: packingPrompt }
            ],
            max_tokens: 2048,
            temperature: 0.3,
        });

        const content = response.choices[0].message.content ?? '{}';

        // Clean markdown if present
        const jsonStr = content.replace(/```json\s*|```/g, '').trim();
        const categories = JSON.parse(jsonStr);

        return {
            success: true,
            data: { 
                categories,
                mutations: tripId ? [{ type: 'packing_list_updated', tripId }] : undefined,
            },
            durationMs: Date.now() - start,
        };
    } catch (err: any) {
        return { success: false, error: err.message || 'Packing list generation failed', durationMs: Date.now() - start };
    }
}
