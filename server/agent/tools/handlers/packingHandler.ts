// Packing List Handler — Groq sub-call for structured categories

import type { ToolResult } from "../../types";
import OpenAI from "openai";
import { PackingListModel, TripModel } from "@shared/schema";
import { socketService } from "../../../services/SocketService";

export async function packingHandler(
  args: {
    destination: string;
    days: number;
    travelStyle: string;
    weatherContext?: string;
    activities?: string[];
    tripId?: string;
    userId?: string;
  },
  deps: { openai: OpenAI | null },
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const { tripId } = args;
    if (!deps.openai) {
      return {
        success: false,
        error: "OpenAI (NVIDIA NIM) not configured",
        durationMs: Date.now() - start,
      };
    }

    const packingPrompt = `Generate a packing list for a ${args.days}-day ${args.travelStyle} trip to ${args.destination}.
${args.weatherContext ? `Weather forecast: ${args.weatherContext}` : ""}
${args.activities?.length ? `Planned activities: ${args.activities.join(", ")}` : ""}

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
      model: "meta/llama-3.3-70b-instruct",
      messages: [
        {
          role: "system",
          content: "You are a packing expert. Output ONLY valid JSON. No prose, no markdown.",
        },
        { role: "user", content: packingPrompt },
      ],
      max_tokens: 2048,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content ?? "{}";

    // Clean markdown if present
    const jsonStr = content.replace(/```json\s*|```/g, "").trim();
    const categories = JSON.parse(jsonStr) as Record<string, string[]>;

    // Flatten categories -> items so the list actually lands on the trip's
    // packing page. Without this the tool only ever returned raw JSON and
    // the model dumped it into chat ("couldn't save this to your trip").
    const items = Object.entries(categories).flatMap(([category, names]) =>
      (Array.isArray(names) ? names : []).map((name) => ({
        name: String(name),
        quantity: 1,
        packed: false,
        category,
      })),
    );

    let saved = false;
    let addedCount = 0;
    if (tripId && args.userId && items.length > 0) {
      const trip = await TripModel.findOne({
        _id: tripId,
        $or: [
          { userId: args.userId },
          { collaborators: { $elemMatch: { userId: args.userId, role: "editor" } } },
        ],
      });
      if (trip) {
        let list = await PackingListModel.findOne({ tripId }).sort({ createdAt: -1 });
        if (!list) {
          list = new PackingListModel({
            userId: String(trip.userId),
            tripId,
            name: "Packing List",
            items: [],
          });
        }
        // Merge: keep items already on the list (and their packed state),
        // add only the newly suggested ones.
        const existing = new Set(list.items.map((it: any) => it.name?.toLowerCase()));
        const added = items.filter((it) => !existing.has(it.name.toLowerCase()));
        list.items.push(...(added as any));
        await list.save();
        saved = true;
        addedCount = added.length;
        socketService.broadcastMutation(String(tripId), {
          type: "packing-updated",
          data: list,
        });
      }
    }

    return {
      success: true,
      data: {
        categories,
        saved,
        message: saved
          ? addedCount > 0
            ? `Added ${addedCount} new item${addedCount === 1 ? "" : "s"} to this trip's packing list.`
            : "This trip's packing list already covers all the suggested items."
          : "Here's the packing list (not saved — open the trip's packing page to add items).",
        mutations: saved && tripId ? [{ type: "packing_list_updated", tripId }] : undefined,
      },
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Packing list generation failed",
      durationMs: Date.now() - start,
    };
  }
}
