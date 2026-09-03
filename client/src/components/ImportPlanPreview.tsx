import { useState } from "react";
import {
  ChevronDown,
  Clock,
  MapPin,
  Utensils,
  Sunrise,
  AlertTriangle,
  Backpack,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Renders whatever AiUtilitiesService.parseSchedule actually returned —
// every field below is optional in practice (a model can omit one even
// under an explicit schema instruction), so every read here has a
// fallback. Never crash on a missing field; show a dash instead.
const show = (v: unknown): string => (v === undefined || v === null || v === "" ? "—" : String(v));

interface ImportPlanPreviewProps {
  plan: any;
  isCreating: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ActivityRow({ act }: { act: any }) {
  const type = (act.type || "").toLowerCase();
  const isMeal = type === "restaurant" || type === "cafe";
  const isTimeSensitive = !!act.timeSensitive;

  return (
    <div
      className={`flex gap-3 py-3 pl-3 pr-2 rounded-lg ${
        isTimeSensitive
          ? "border-l-2 border-[var(--amber)] bg-[var(--amber-dim)]"
          : "border-l-2 border-transparent"
      }`}
    >
      <div className="w-16 shrink-0 pt-0.5 text-xs font-mono text-muted-foreground">
        {show(act.time)}
      </div>
      <div className="shrink-0 pt-0.5">
        {isMeal ? (
          <Utensils className="w-4 h-4 text-[var(--emerald-horizon)]" />
        ) : isTimeSensitive ? (
          <Clock className="w-4 h-4 text-[var(--amber)]" />
        ) : (
          <MapPin className="w-4 h-4 text-[var(--explorer-blue)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-foreground text-sm truncate">{show(act.title)}</p>
          {(act.cost || act.entryFee) && (
            <span className="text-xs text-muted-foreground shrink-0">
              {act.cost || act.entryFee}
            </span>
          )}
        </div>
        {act.whyVisit && <p className="text-xs text-muted-foreground mt-0.5">{act.whyVisit}</p>}
        {isTimeSensitive && act.timeNote && (
          <p className="text-xs text-[var(--amber)] mt-1 flex items-center gap-1">
            <Sunrise className="w-3 h-3 shrink-0" /> {act.timeNote}
          </p>
        )}
        {act.localTip && (
          <p className="text-xs text-muted-foreground/80 italic mt-1">💡 {act.localTip}</p>
        )}
      </div>
    </div>
  );
}

function DayCard({ day, defaultOpen }: { day: any; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const activities = Array.isArray(day.activities) ? day.activities : [];

  return (
    <Card className="bg-card border elev-1 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-foreground">Day {show(day.day)}</span>
                  {day.theme && (
                    <span className="text-sm text-muted-foreground truncate">{day.theme}</span>
                  )}
                </div>
                {day.location && (
                  <p className="text-xs text-muted-foreground mt-0.5">{day.location}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {activities.length} {activities.length === 1 ? "stop" : "stops"}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                />
              </div>
            </CardContent>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4">
            {day.headlineExperience && (
              <p className="text-sm text-[var(--amber)] font-medium mb-2">
                ✨ {day.headlineExperience}
              </p>
            )}
            <div className="divide-y divide-[hsl(var(--border))]">
              {activities.length > 0 ? (
                activities.map((act: any, i: number) => <ActivityRow key={act.id || i} act={act} />)
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  No activities parsed for this day.
                </p>
              )}
            </div>
            {day.departureReminder && (
              <div className="mt-3 rounded-lg border border-[var(--ios-red)]/40 bg-[rgb(var(--ios-red-rgb)/10%)] px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--ios-red)] shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">
                    Depart by {show(day.departureReminder.departBy)} —{" "}
                    {show(day.departureReminder.transport)}
                  </p>
                  {day.departureReminder.note && (
                    <p className="text-muted-foreground mt-0.5">{day.departureReminder.note}</p>
                  )}
                </div>
              </div>
            )}
            {day.weatherNote && (
              <p className="text-xs text-muted-foreground mt-2">🌤️ {day.weatherNote}</p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Review screen shown after "Import My Plan" successfully parses a
 * schedule, before the trip is actually created — matches the
 * confirm-before-create pattern already used elsewhere in this app
 * (Save Trip after "Let AI Plan") rather than auto-creating on parse.
 */
export function ImportPlanPreview({
  plan,
  isCreating,
  onConfirm,
  onCancel,
}: ImportPlanPreviewProps) {
  const days = Array.isArray(plan?.itinerary) ? plan.itinerary : [];
  const bracketLabel =
    plan?.budgetBracket === "budget"
      ? "Budget-friendly"
      : plan?.budgetBracket === "premium"
        ? "Premium"
        : "Mid-range";

  return (
    <div className="space-y-5">
      <Card className="bg-card border elev-1">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-foreground">{show(plan?.destination)}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {show(plan?.days)} {plan?.days === 1 ? "day" : "days"}
                {plan?.tripStyle ? ` · ${plan.tripStyle}` : ""}
              </p>
            </div>
            <Badge variant="outline" className="border-[var(--amber)] text-[var(--amber)]">
              {bracketLabel}
            </Badge>
          </div>
          {plan?.notes && <p className="text-sm text-muted-foreground mt-3">{plan.notes}</p>}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {days.map((day: any, idx: number) => (
          <DayCard key={idx} day={day} defaultOpen={false} />
        ))}
      </div>

      {Array.isArray(plan?.bookingPriorities) && plan.bookingPriorities.length > 0 && (
        <Card className="bg-card border elev-1">
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-[var(--explorer-blue)]" /> Booking priorities
            </h3>
            <div className="space-y-2">
              {plan.bookingPriorities.map((b: any, i: number) => (
                <div key={i} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <span className="text-foreground font-medium">{show(b.item)}</span>
                    {b.reason && <p className="text-xs text-muted-foreground">{b.reason}</p>}
                  </div>
                  {b.urgency && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {b.urgency}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {Array.isArray(plan?.packingNotes) && plan.packingNotes.length > 0 && (
        <Card className="bg-card border elev-1">
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
              <Backpack className="w-4 h-4 text-[var(--emerald-horizon)]" /> Packing notes
            </h3>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              {plan.packingNotes.map((p: string, i: number) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Not sticky — this app's mobile bottom nav is fixed at bottom-3
          (Layout.tsx); a sticky action bar here would risk sitting right
          on top of it on small screens, the same overlap class of bug
          documented elsewhere in this codebase (Atlas FAB vs. form
          fields at 375-430px). Matches the plain in-flow button row the
          "Let AI Plan" review screen already uses after its own parse. */}
      <div className="flex gap-3 pb-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isCreating}
        >
          Start Over
        </Button>
        <Button
          type="button"
          className="flex-1 bg-[var(--amber)] text-white"
          onClick={onConfirm}
          disabled={isCreating}
        >
          {isCreating ? (
            <>
              <i className="fas fa-save fa-spin mr-2"></i>Creating Trip...
            </>
          ) : (
            "Create This Trip"
          )}
        </Button>
      </div>
    </div>
  );
}
