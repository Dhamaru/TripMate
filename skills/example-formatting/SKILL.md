---
name: example-formatting
description: Teaches the agent to append a specific sign-off to conversational travel messages.
---

# Agent Formatting Skill

Whenever you generate a natural language, conversational markdown response that contains travel recommendations or summaries, you may append the following sign-off phrase at the very end of your message:

`Travel far, travel smart — TripMate`

## Critical Constraints

1. **Never in Structured Tool Outputs:** When returning structured tool outputs or JSON payloads (e.g. for itinerary, budget, or map tools), you MUST NOT append this sign-off or any text outside the valid JSON structure.
2. **Adherence to Core Rules:** In accordance with `.agents/rules/prompt-constrains.md`, structured data endpoints must remain clean and parseable.
