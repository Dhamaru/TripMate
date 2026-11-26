// Tool-call badge — shows which Atlas tools ran for a message.
// Uses lucide-react icons (the emoji version rendered as tofu boxes on
// several Android font stacks).
import {
  CloudSun,
  ArrowLeftRight,
  Siren,
  MapPin,
  Luggage,
  Languages,
  Wallet,
  Map as MapIcon,
  Compass,
  Check,
  Lightbulb,
  NotebookPen,
  CalendarDays,
  Settings,
  Users,
  CreditCard,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const TOOL_META: Record<string, { icon: LucideIcon; label: string }> = {
  get_weather: { icon: CloudSun, label: "Weather checked" },
  get_currency_rate: { icon: ArrowLeftRight, label: "Currency converted" },
  convert_currency: { icon: ArrowLeftRight, label: "Currency converted" },
  get_emergency_info: { icon: Siren, label: "Emergency info" },
  search_places: { icon: MapPin, label: "Places searched" },
  generate_packing_list: { icon: Luggage, label: "Packing generated" },
  manage_packing_list: { icon: Luggage, label: "Packing list updated" },
  translate_text: { icon: Languages, label: "Translation done" },
  get_budget_breakdown: { icon: Wallet, label: "Budget calculated" },
  get_trip_details: { icon: MapIcon, label: "Trip details fetched" },
  list_trips: { icon: Compass, label: "Trips listed" },
  finalize_trip_plan: { icon: Check, label: "Plan saved" },
  get_travel_hacks: { icon: Lightbulb, label: "Travel hacks fetched" },
  augment_journal: { icon: NotebookPen, label: "Journal enhanced" },
  create_journal_entry: { icon: NotebookPen, label: "Journal entry saved" },
  modify_itinerary: { icon: CalendarDays, label: "Itinerary updated" },
  get_user_preferences: { icon: Settings, label: "Preferences checked" },
  update_user_preferences: { icon: Settings, label: "Preferences saved" },
  collaborate_with_agents: { icon: Users, label: "Team consulted" },
  manage_expense: { icon: CreditCard, label: "Expense updated" },
  manage_collaborator: { icon: Users, label: "Collaborator updated" },
};

interface Props {
  toolName: string;
}

export function ToolCallBadge({ toolName }: Props) {
  const meta = TOOL_META[toolName] ?? {
    icon: Wrench,
    label: toolName.replace(/_/g, " "),
  };
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border border-border"
      aria-label={`Tool used: ${meta.label}`}
    >
      <Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
