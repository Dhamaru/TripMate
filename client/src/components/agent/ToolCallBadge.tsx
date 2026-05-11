// Task 7 — Tool call badge component
const TOOL_LABELS: Record<string, string> = {
    get_weather: '🌤 Weather checked',
    get_currency_rate: '💱 Currency converted',
    convert_currency: '💱 Currency converted',
    get_emergency_info: '🆘 Emergency info',
    search_places: '📍 Places searched',
    generate_packing_list: '🧳 Packing generated',
    translate_text: '🗣 Translation done',
    get_budget_breakdown: '💰 Budget calculated',
    get_trip_details: '🗺 Trip details fetched',
    finalize_trip_plan: '✅ Plan saved',
    get_travel_hacks: '💡 Travel hacks fetched',
    augment_journal: '📔 Journal enhanced',
}

interface Props { toolName: string }

export function ToolCallBadge({ toolName }: Props) {
    const label = TOOL_LABELS[toolName] ?? `🔧 ${toolName}`
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border border-border" aria-label={`Tool used: ${label}`}>
            {label}
        </span>
    )
}
