// Runtime constants shared by client and server. Keep this file free of
// imports: anything the browser imports from shared/schema.ts pulls in
// mongoose and bson (1.3MB in the entry bundle, found 2026-11-04).

export const NOTIFICATION_TYPES = [
  { value: "collaborator-invite", label: "Added to a trip" },
  { value: "collaborator-removed", label: "Removed from a trip" },
  { value: "itinerary-updated", label: "Itinerary changes" },
  { value: "expense-updated", label: "Expense changes" },
  { value: "packing-updated", label: "Packing list changes" },
  { value: "journal-updated", label: "Journal entries" },
  { value: "recap-generated", label: "Trip recaps" },
  { value: "trip-updated", label: "Trip detail changes" },
  { value: "trip-reminder", label: "Trip reminders" },
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]["value"];
