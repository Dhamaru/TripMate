// Atlas Agent — Tool Definitions (OpenAI & Gemini formats)
//
// Descriptions here are trimmed on purpose: they count against the model's
// prompt token budget on EVERY single request (19 tools x full descriptions
// was a meaningful contributor to a real Groq TPM rate-limit hit on
// 2026-08-11 — see server/agent/providerHealth.ts). Keep them short but
// unambiguous; don't restore verbose example-laden prose without checking
// the token cost.

import type { ChatCompletionTool } from "openai/resources/chat/completions";

/**
 * OpenAI format tool definitions
 */
export const TRIPMATE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Current conditions + 7-day forecast for a location.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City or location" },
          units: { type: "string", enum: ["metric", "imperial"], description: "Default: metric" },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_currency",
      description: "Convert an amount between currencies using live rates.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number" },
          from: { type: "string", description: "Source currency code" },
          to: { type: "string", description: "Target currency code" },
        },
        required: ["amount", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "translate_text",
      description:
        "Translate text between languages. ALWAYS call this for any translation request, even a simple phrase you already know — never translate from memory.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          sourceLang: { type: "string", description: "Language code or 'auto' (default)" },
          targetLang: { type: "string", description: "Language code, e.g. 'hi', 'ja', 'fr'" },
        },
        required: ["text", "targetLang"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_places",
      description: "Search hotels, restaurants, or attractions near a location.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: { type: "string", enum: ["hotels", "restaurants", "tourist-spots", "general"] },
          location: { type: "string", description: "City or coordinates" },
          maxResults: { type: "integer", description: "Default 5, max 10" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_emergency_info",
      description:
        "National emergency dial numbers (police/ambulance/fire) plus nearby hospitals, police, pharmacies, and embassies for a location. Use this for ANY question about emergency numbers or services — never answer from memory.",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string", description: "City or country" },
          infoType: {
            type: "string",
            enum: ["hospitals", "police", "pharmacies", "embassies", "all"],
            description: "Default: all",
          },
        },
        required: ["destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_travel_hacks",
      description: "Budget-saving tips and economical alternatives for a destination.",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string" },
          travelStyle: { type: "string", description: "e.g. 'budget', 'luxury'" },
        },
        required: ["destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_packing_list",
      description: "Generate a categorized packing list from destination, weather, and trip style.",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string" },
          days: { type: "integer" },
          travelStyle: { type: "string" },
          weatherContext: { type: "string", description: "Weather summary if known" },
          activities: { type: "array", items: { type: "string" } },
        },
        required: ["destination", "days", "travelStyle"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "augment_journal",
      description: "Enhance a journal entry with context, suggested tags, and sentiment.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Raw journal text" },
          destination: { type: "string" },
          dayOfTrip: { type: "integer" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget_breakdown",
      description:
        "Budget allocation by category (accommodation, food, transport, activities, buffer).",
      parameters: {
        type: "object",
        properties: {
          totalBudget: { type: "number" },
          travelStyle: {
            type: "string",
            enum: ["budget", "standard", "luxury", "adventure", "relaxed", "cultural"],
          },
          currency: { type: "string" },
          origin: { type: "string" },
          destination: { type: "string" },
          travelMedium: { type: "string", description: "flight, train, bus, car" },
        },
        required: ["totalBudget", "travelStyle", "origin", "destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_trips",
      description:
        "List the user's trips. Call when they say 'my trips'/'current trips' with no trip already open.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trip_details",
      description: "Fetch full trip details: itinerary, budget, status.",
      parameters: {
        type: "object",
        properties: {
          tripId: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize_trip_plan",
      description: "Save a proposed itinerary to the database once the user is satisfied.",
      parameters: {
        type: "object",
        properties: {
          tripId: { type: "string" },
          itinerary: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "integer" },
                activities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      time: { type: "string" },
                      title: { type: "string" },
                      location: { type: "string" },
                      notes: { type: "string" },
                      latitude: { type: "number" },
                      longitude: { type: "number" },
                    },
                    required: ["title"],
                  },
                },
              },
            },
          },
        },
        required: ["itinerary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "modify_itinerary",
      description:
        "Surgically modify an existing itinerary: replace a day, add/remove/swap an activity.",
      parameters: {
        type: "object",
        properties: {
          tripId: { type: "string" },
          action: {
            type: "string",
            enum: ["replace_day", "add_activity", "remove_activity", "swap_activities"],
          },
          dayIndex: { type: "integer", description: "0-based" },
          activityId: { type: "string", description: "For remove/swap" },
          activity: {
            type: "object",
            description: "New activity to add or replace with",
            properties: {
              time: { type: "string" },
              title: { type: "string" },
              address: { type: "string" },
              location: { type: "string" },
              type: { type: "string" },
              category: { type: "string" },
              duration_minutes: { type: "number" },
              notes: { type: "string" },
              description: { type: "string" },
              cost: { type: "number" },
              latitude: { type: "number" },
              longitude: { type: "number" },
              id: { type: "string" },
            },
            additionalProperties: true,
          },
          activities: {
            type: "array",
            description: "Full activity list, for replace_day",
            items: {
              type: "object",
              properties: {
                time: { type: "string" },
                title: { type: "string" },
                address: { type: "string" },
                location: { type: "string" },
                type: { type: "string" },
                category: { type: "string" },
                duration_minutes: { type: "number" },
                notes: { type: "string" },
                description: { type: "string" },
                cost: { type: "number" },
                latitude: { type: "number" },
                longitude: { type: "number" },
                id: { type: "string" },
              },
              additionalProperties: true,
            },
          },
        },
        required: ["action", "dayIndex"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_preferences",
      description: "Get traveler profile: home city, dietary needs, transport, interests.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_user_preferences",
      description: "Update traveler profile with new preferences.",
      parameters: {
        type: "object",
        properties: {
          homeCity: { type: "string" },
          dietaryPreferences: { type: "array", items: { type: "string" } },
          preferredTransport: { type: "string" },
          interests: { type: "array", items: { type: "string" } },
          name: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_packing_list",
      description: "Add/remove/toggle-packed an item, or list the trip's packing list.",
      parameters: {
        type: "object",
        properties: {
          tripId: { type: "string" },
          action: { type: "string", enum: ["add_item", "remove_item", "toggle_packed", "list"] },
          itemName: { type: "string", description: "Required for add_item" },
          itemId: { type: "string", description: "Alternative to itemName" },
          quantity: { type: "integer", description: "For add_item, default 1" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_journal_entry",
      description: "Save a new journal entry from conversation content.",
      parameters: {
        type: "object",
        properties: {
          tripId: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
          dayIndex: { type: "integer", description: "0-based" },
          location: { type: "string" },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_expense",
      description: "Add or remove a trip expense. Removal is destructive.",
      parameters: {
        type: "object",
        properties: {
          tripId: { type: "string" },
          action: { type: "string", enum: ["add", "remove"] },
          amount: { type: "number", description: "For add" },
          currency: { type: "string", description: "For add" },
          category: {
            type: "string",
            enum: ["Accommodation", "Food", "Transport", "Activities", "Shopping", "Other"],
          },
          description: { type: "string", description: "For add" },
          expenseId: { type: "string", description: "For remove" },
        },
        required: ["tripId", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_collaborator",
      description:
        "Add a collaborator by email, or remove one. Owner-only. Both actions need user confirmation first.",
      parameters: {
        type: "object",
        properties: {
          tripId: { type: "string" },
          action: { type: "string", enum: ["add", "remove"] },
          email: { type: "string", description: "For add" },
          role: {
            type: "string",
            enum: ["editor", "viewer"],
            description: "For add, default editor",
          },
          collaboratorId: { type: "string", description: "For remove" },
        },
        required: ["tripId", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "collaborate_with_agents",
      description:
        "Delegate a complex multi-part request (e.g. budget + weather + packing) to specialized agents.",
      parameters: {
        type: "object",
        properties: {
          request: { type: "string", description: "The specific request for the agents" },
        },
        required: ["request"],
      },
    },
  },
];
