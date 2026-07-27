# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Solo and group travelers planning multi-day trips who want a fast, AI-assisted path from idea to a concrete day-by-day itinerary, without juggling separate apps for budget, packing, and logistics.

## Product Purpose
TripMate turns a destination and a few constraints (dates, budget, group size, travel style) into a full trip plan — itinerary, budget breakdown, packing list, and real place suggestions — and keeps helping during the trip via an AI chat assistant (Atlas) and live navigation.

## Positioning
An all-in-one travel toolkit: itinerary generation, budget tracking, packing lists, a trip journal, offline maps with live navigation, a language translator, weather insights, and an AI chat assistant are all in one connected app, instead of spread across five single-purpose apps.

## Operating Context
- Trip planning flow: destination + dates + budget + group size + travel style + transport mode → AI-generated day-by-day itinerary with real places (hotels, restaurants, tourist spots via Google Places), cost breakdown, and packing list.
- Also supports importing an existing hand-written schedule (pasted text) and having it parsed into the same structured itinerary.
- In-trip tools: Atlas AI chat assistant (trip Q&A, itinerary adjustments), offline/live-navigation maps, weather insights, currency-aware budget display, language translator, emergency/SOS info, journal for trip memories.
- Multi-currency (INR/USD/EUR/GBP/AUD/CAD/JPY/CNY); INR is the default/most-used currency given the primary user base skews Indian.

## Capabilities and Constraints
- React 18 client, Express 4 + MongoDB + Socket.io backend, deployed on Render.
- AI itinerary/chat generation runs through NVIDIA NIM (Llama primary, DeepSeek fallback) and Gemini/OpenAI as secondary providers depending on feature.
- Real place data (hotels, restaurants, tourist spots, photos) comes from Google Places API; geocoding falls back Nominatim → Google Geocoding.
- Existing design system is documented in DESIGN.md but has drifted from the actual implementation (index.css) — this redesign will replace DESIGN.md rather than reconcile the drift.

## Brand Commitments
Name ("TripMate") and current logo mark are not confirmed as binding — user explicitly authorized a full visual redesign with nothing preserved except product name. No other locked brand assets.

## Evidence on Hand
No user testimonials, press, or case studies exist — none should be fabricated. Real functioning features (itinerary generation, budget engine, packing, journal, maps, translator, weather, Atlas chat) are the only "proof" — the redesign should showcase real app screens/flows, not invented marketing claims.

## Product Principles
1. Planning should feel fast and concrete — from a blank form to a real day-by-day plan in one flow, not a wizard maze.
2. In-trip tools (chat, maps, weather, translator) are utilities — clarity and speed beat decoration once a trip is underway.
3. Multi-currency and Indian-first defaults are a real constraint, not an afterthought — currency/locale correctness is part of the product's credibility.
4. The AI is a visible collaborator (Atlas), not an invisible backend — its presence in the UI should feel active and trustworthy, not gimmicky.

## Accessibility & Inclusion
No formally established standard yet; existing dark-mode-first theme with a light-mode toggle should be preserved as a capability (both themes must remain fully usable) through the redesign.
