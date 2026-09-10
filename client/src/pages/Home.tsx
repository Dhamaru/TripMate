import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useAuthStore, useTripStore, useAgentStore } from "@/store";
import { Link, useLocation } from "wouter";
import {
  Plus,
  Map,
  BookOpen,
  ListChecks,
  ArrowRight,
  Users,
  Wallet,
  Bot,
  CalendarDays,
  CalendarPlus,
  MapPin,
  Clock,
  ImageOff,
  CloudSun,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { getCurrencySymbol } from "@/lib/currency";
import type { Trip } from "@/types/api.types";

const STYLE_LABELS: Record<string, string> = {
  adventure: "Adventure",
  cultural: "Culture & history",
  relaxed: "Rest & relax",
  budget: "Budget travel",
  luxury: "Luxury",
  family: "Family trip",
  culinary: "Food & drink",
};

const QUICK_LINKS = [
  { title: "Plan a trip", icon: Plus, href: "/app/planner" },
  { title: "Packing list", icon: ListChecks, href: "/app/packing" },
  { title: "Offline maps", icon: Map, href: "/app/maps" },
  { title: "Journal", icon: BookOpen, href: "/app/journal" },
];

function toDate(d?: string | Date | null): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function midnight(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((midnight(b).getTime() - midnight(a).getTime()) / 86_400_000);
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && midnight(a).getTime() === midnight(b).getTime();
}

type Phase =
  | { kind: "upcoming"; label: string; detail: string }
  | { kind: "active"; label: string; detail: string }
  | { kind: "past"; label: string; detail: string }
  | { kind: "undated"; label: string; detail: string };

function tripPhase(trip: Trip): Phase {
  const start = toDate(trip.startDate);
  const end = toDate(trip.endDate);
  const today = midnight(new Date());
  if (!start) return { kind: "undated", label: "No dates set", detail: "add dates to track countdown" };
  if (today < midnight(start)) {
    const d = daysBetween(today, start);
    return {
      kind: "upcoming",
      label: d === 0 ? "Leaves today" : `${d} day${d === 1 ? "" : "s"} to go`,
      detail: "until departure",
    };
  }
  if (end && today > midnight(end)) {
    const d = daysBetween(end, today);
    return { kind: "past", label: "Trip wrapped", detail: `${d} day${d === 1 ? "" : "s"} ago` };
  }
  const dayNum = daysBetween(start, today) + 1;
  return {
    kind: "active",
    label: `Day ${dayNum}${trip.days ? ` of ${trip.days}` : ""}`,
    detail: "on the ground",
  };
}

function collaboratorInitials(trip: Trip): string[] {
  return (trip.collaborators ?? [])
    .map((c) => {
      const u = c.userId;
      if (u && typeof u === "object") {
        return `${u.firstName?.[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase() || "?";
      }
      return "•";
    })
    .slice(0, 4);
}

function budgetState(trip: Trip) {
  const total = trip.totalBudget || trip.budget || 0;
  // Expenses can technically be in mixed currencies (rare); we sum raw
  // amounts and label with the trip currency rather than pretend to do
  // FX we don't have a rate for here. Good enough for an at-a-glance bar.
  const spent = (trip.expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const remaining = total - spent;
  const pct = total > 0 ? Math.min(100, Math.max(0, (spent / total) * 100)) : 0;
  const sym = getCurrencySymbol(trip.currency);
  return { total, spent, remaining, pct, sym, hasBudget: total > 0, over: remaining < 0 };
}

// Compact, editorial weather line for the dashboard rail. The standalone
// WeatherWidget is a full sky-gradient card of its own — deliberately dark,
// out of place in the paper dashboard — so this hits the same
// /api/v1/weather endpoint and renders it to the dashboard's own tokens.
function TripWeather({ location }: { location: string }) {
  const { data, isLoading, isError } = useQuery<{
    current?: { temperature?: number; condition?: string; humidity?: number; windSpeed?: number };
  }>({
    queryKey: ["/api/v1/weather", location, "metric"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/v1/weather?location=${encodeURIComponent(location)}&units=metric&lang=en`,
      );
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
  });

  const c = data?.current;
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))] mb-3">
        <CloudSun className="w-3.5 h-3.5" aria-hidden="true" />
        <Eyebrow>Weather in {location}</Eyebrow>
      </div>
      {isLoading ? (
        <div className="h-10 w-28 rounded bg-[hsl(var(--muted))] animate-pulse" />
      ) : isError || !c || typeof c.temperature !== "number" ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))] font-sans-clean">
          Forecast unavailable right now.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-[hsl(var(--foreground))]">
              {Math.round(c.temperature)}°
            </span>
            <span className="text-sm text-[hsl(var(--muted-foreground))] font-sans-clean capitalize">
              {c.condition ?? ""}
            </span>
          </div>
          {(typeof c.humidity === "number" || typeof c.windSpeed === "number") && (
            <div className="mt-2 flex gap-4 text-[11px] text-[hsl(var(--muted-foreground))] font-sans-clean">
              {typeof c.humidity === "number" && (
                <span>
                  Humidity <span className="font-mono-data">{c.humidity}%</span>
                </span>
              )}
              {typeof c.windSpeed === "number" && (
                <span>
                  Wind <span className="font-mono-data">{Math.round(c.windSpeed)} km/h</span>
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono-data text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
      {children}
    </span>
  );
}

export default function Home() {
  const { user } = useAuthStore();
  const { trips, fetchTrips, isLoading: tripsLoading, error } = useTripStore();
  const toggleAtlasChat = useAgentStore((s) => s.toggleChat);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  useEffect(() => {
    if (error) {
      toast({ title: "Couldn't load your trips", description: error, variant: "destructive" });
      try {
        logError("home_trips_error", { message: error });
      } catch {}
    }
  }, [error, toast]);

  const currentTrip = useMemo<Trip | null>(() => {
    if (!trips || trips.length === 0) return null;
    const active = trips.find((t) => t.status === "active");
    if (active) return active;
    const upcoming = trips
      .filter((t) => t.status === "planning" && toDate(t.startDate))
      .sort((a, b) => toDate(a.startDate)!.getTime() - toDate(b.startDate)!.getTime());
    if (upcoming.length > 0) return upcoming[0];
    return trips[0];
  }, [trips]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const phase = currentTrip ? tripPhase(currentTrip) : null;
  const budget = currentTrip ? budgetState(currentTrip) : null;
  const initials = currentTrip ? collaboratorInitials(currentTrip) : [];

  // Today's plan: the itinerary day whose date is today (active trip),
  // otherwise the first day (a plan you're about to start). Falls back to
  // day 1 when the itinerary has no real dates stamped.
  const todayPlan = useMemo(() => {
    if (!currentTrip?.itinerary?.length) return null;
    const today = midnight(new Date());
    const dated = currentTrip.itinerary.find((d) => sameDay(toDate(d.date), today));
    return dated ?? currentTrip.itinerary[0];
  }, [currentTrip]);

  const portfolio = useMemo(
    () => (trips ?? []).filter((t) => !currentTrip || t.id !== currentTrip.id).slice(0, 6),
    [trips, currentTrip],
  );

  const phaseTone =
    phase?.kind === "active"
      ? "text-[var(--transit-green)]"
      : phase?.kind === "past"
        ? "text-[hsl(var(--muted-foreground))]"
        : "text-[var(--ink-blue-bright)]";

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-4">
      {/* ── Masthead ─────────────────────────────────── */}
      <header className="animate-fade-up flex flex-wrap items-end justify-between gap-4 border-b border-[hsl(var(--border))] pb-6">
        <div>
          <Eyebrow>{greeting}</Eyebrow>
          <h1 className="font-display text-[2.6rem] leading-[1.05] font-semibold text-[hsl(var(--foreground))] mt-1">
            {user?.firstName ? `${user.firstName}'s trips` : "Your trips"}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1.5 font-sans-clean">
            {currentTrip
              ? "Here's where things stand right now."
              : "Nothing planned yet — start with a destination and rough dates."}
          </p>
        </div>
        <Button
          onClick={() => navigate("/app/planner")}
          className="bg-[var(--amber)] hover:bg-[var(--airbnb-primary-active)] text-white h-10 px-5 rounded-lg font-semibold text-sm font-sans-clean"
        >
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          New trip
        </Button>
      </header>

      {tripsLoading && !currentTrip && (
        <div className="h-64 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] animate-pulse" />
      )}

      {/* ── Current trip ─────────────────────────────── */}
      {currentTrip && phase && budget && (
        <section className="animate-fade-up animate-fade-up-delay-1">
          <div className="rounded-2xl border-2 border-[rgb(var(--ink-blue-rgb)/35%)] bg-[hsl(var(--card))] overflow-hidden shadow-[var(--shadow-hover)]">
            <div className="h-1.5 w-full bg-gradient-to-r from-[var(--amber)] via-[var(--ink-blue-bright)] to-[var(--customs-blue)]" />
            <div className="grid md:grid-cols-[300px_1fr]">
              {/* Photo */}
              <div className="relative h-44 md:h-full min-h-[190px] bg-[hsl(var(--muted))]">
                {currentTrip.imageUrl ? (
                  <OptimizedImage
                    src={currentTrip.imageUrl}
                    alt={currentTrip.destination}
                    className="absolute inset-0 w-full h-full object-cover"
                    fallback={
                      <div className="w-full h-full flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                        <ImageOff className="w-6 h-6" />
                      </div>
                    }
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                    <ImageOff className="w-6 h-6" />
                  </div>
                )}
              </div>

              {/* Detail */}
              <div className="p-5 md:p-6 flex flex-col gap-5 bg-[rgb(var(--ink-blue-rgb)/4%)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-mono-data text-[10px] uppercase tracking-[0.14em] text-[var(--ink-blue-bright)] font-semibold">
                      {currentTrip.status === "active"
                        ? "Current trip"
                        : currentTrip.status === "completed"
                          ? "Last trip"
                          : "Next trip"}
                    </span>
                    <h2 className="font-display text-2xl font-semibold text-[hsl(var(--foreground))] leading-tight mt-0.5 truncate">
                      {currentTrip.destination}
                    </h2>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 font-sans-clean">
                      {STYLE_LABELS[String(currentTrip.travelStyle).toLowerCase()] ??
                        currentTrip.travelStyle}
                      {currentTrip.origin ? ` · from ${currentTrip.origin}` : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`font-display text-xl font-semibold ${phaseTone}`}>
                      {phase.label}
                    </div>
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))] font-sans-clean">
                      {phase.detail}
                    </div>
                  </div>
                </div>

                {/* Stat row */}
                <div className="grid grid-cols-3 gap-px bg-[hsl(var(--border))] rounded-lg overflow-hidden border border-[hsl(var(--border))]">
                  <div className="bg-[hsl(var(--card))] p-3">
                    <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))] mb-1">
                      <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                      <Eyebrow>Dates</Eyebrow>
                    </div>
                    {toDate(currentTrip.startDate) ? (
                      <div className="font-mono-data text-xs text-[hsl(var(--foreground))]">
                        {toDate(currentTrip.startDate)!.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                        {toDate(currentTrip.endDate)
                          ? ` – ${toDate(currentTrip.endDate)!.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}`
                          : ""}
                      </div>
                    ) : (
                      <Link
                        href={`/app/trips/${currentTrip.id}?edit=1`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink-blue-bright)] font-sans-clean hover:gap-1.5 transition-all rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue-bright)]"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
                        Set dates
                      </Link>
                    )}
                  </div>
                  <div className="bg-[hsl(var(--card))] p-3">
                    <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))] mb-1">
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                      <Eyebrow>Party</Eyebrow>
                    </div>
                    <div className="font-mono-data text-xs text-[hsl(var(--foreground))]">
                      {currentTrip.groupSize ?? currentTrip.companions ?? 1}
                      {" traveller"}
                      {Number(currentTrip.groupSize ?? currentTrip.companions ?? 1) === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="bg-[hsl(var(--card))] p-3">
                    <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))] mb-1">
                      <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                      <Eyebrow>{budget.hasBudget ? "Left" : "Budget"}</Eyebrow>
                    </div>
                    <div
                      className={`font-mono-data text-xs ${
                        budget.over ? "text-[var(--stamp-red)]" : "text-[hsl(var(--foreground))]"
                      }`}
                    >
                      {budget.hasBudget
                        ? `${budget.sym}${Math.abs(budget.remaining).toLocaleString()}${
                            budget.over ? " over" : ""
                          }`
                        : "not set"}
                    </div>
                  </div>
                </div>

                {/* Budget bar */}
                {budget.hasBudget && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-sans-clean mb-1.5">
                      <span className="text-[hsl(var(--muted-foreground))]">
                        Spent{" "}
                        <span className="font-mono-data text-[hsl(var(--foreground))]">
                          {budget.sym}
                          {budget.spent.toLocaleString()}
                        </span>{" "}
                        of {budget.sym}
                        {budget.total.toLocaleString()}
                      </span>
                      <span
                        className={`font-mono-data ${
                          budget.over ? "text-[var(--stamp-red)]" : "text-[hsl(var(--muted-foreground))]"
                        }`}
                      >
                        {Math.round(budget.pct)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          budget.over ? "bg-[var(--stamp-red)]" : "bg-[var(--amber)]"
                        }`}
                        style={{ width: `${budget.pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2 min-h-[24px]">
                    {initials.length > 0 ? (
                      <>
                        <div className="flex -space-x-1.5">
                          {initials.map((ini, i) => (
                            <span
                              key={i}
                              className="w-6 h-6 rounded-full border border-[hsl(var(--card))] bg-[hsl(var(--muted))] text-[9px] font-semibold text-[hsl(var(--foreground))] flex items-center justify-center font-sans-clean"
                            >
                              {ini}
                            </span>
                          ))}
                        </div>
                        <span className="text-[11px] text-[hsl(var(--muted-foreground))] font-sans-clean">
                          {initials.length} travelling with you
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-[hsl(var(--muted-foreground))] font-sans-clean">
                        Just you
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/app/trips/${currentTrip.id}`}
                    className="inline-flex items-center gap-1 text-[var(--ink-blue-bright)] text-xs font-semibold font-sans-clean hover:gap-2 transition-all rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue-bright)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--card))]"
                  >
                    Open trip <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Today + right rail ───────────────────────── */}
      {currentTrip && (
        <section className="animate-fade-up animate-fade-up-delay-2 grid lg:grid-cols-[1fr_320px] gap-5">
          {/* Today's plan */}
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Eyebrow>
                  {phase?.kind === "active" ? "Today's plan" : "First day"}
                </Eyebrow>
                <h3 className="font-display text-lg font-semibold text-[hsl(var(--foreground))] mt-0.5">
                  {todayPlan
                    ? `Day ${todayPlan.day}${
                        toDate(todayPlan.date)
                          ? ` · ${toDate(todayPlan.date)!.toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}`
                          : ""
                      }`
                    : "No itinerary yet"}
                </h3>
              </div>
              <Link
                href={`/app/trips/${currentTrip.id}?tab=itinerary`}
                className="text-[var(--ink-blue-bright)] text-xs font-semibold font-sans-clean hover:opacity-70 rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue-bright)]"
              >
                Full itinerary →
              </Link>
            </div>

            {todayPlan && todayPlan.activities?.length > 0 ? (
              <ol className="relative border-l border-[hsl(var(--border))] ml-1.5 space-y-4">
                {todayPlan.activities.slice(0, 6).map((a) => (
                  <li key={a.id} className="pl-5 relative">
                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[var(--amber)] border-2 border-[hsl(var(--card))]" />
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono-data text-[11px] text-[var(--ink-blue-bright)] flex-shrink-0">
                        {a.time || "—"}
                      </span>
                      <span className="text-sm font-medium text-[hsl(var(--foreground))] font-sans-clean">
                        {a.placeName || a.title || "Activity"}
                      </span>
                    </div>
                    {a.address && (
                      <div className="flex items-center gap-1 text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5 font-sans-clean">
                        <MapPin className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                        <span className="truncate">{a.address}</span>
                      </div>
                    )}
                  </li>
                ))}
                {todayPlan.activities.length > 6 && (
                  <li className="pl-5 text-[11px] text-[hsl(var(--muted-foreground))] font-sans-clean">
                    + {todayPlan.activities.length - 6} more today
                  </li>
                )}
              </ol>
            ) : (
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] font-sans-clean py-4">
                <Clock className="w-4 h-4" aria-hidden="true" />
                Nothing scheduled — open the trip to build the itinerary.
              </div>
            )}
          </div>

          {/* Right rail */}
          <div className="space-y-5">
            <TripWeather location={currentTrip.destination} />
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
              <Eyebrow>Quick links</Eyebrow>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {QUICK_LINKS.map((q) => (
                  <Link
                    key={q.href}
                    href={q.href}
                    className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2.5 text-xs font-medium text-[hsl(var(--foreground))] font-sans-clean hover:border-[var(--ink-blue-bright)] hover:text-[var(--ink-blue-bright)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue-bright)]"
                  >
                    <q.icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                    {q.title}
                  </Link>
                ))}
              </div>
              <button
                onClick={toggleAtlasChat}
                className="mt-2 w-full flex items-center gap-2 rounded-lg bg-[rgb(var(--ink-blue-rgb)/8%)] border border-[var(--ink-blue-bright)]/30 px-3 py-2.5 text-xs font-semibold text-[var(--ink-blue-bright)] font-sans-clean hover:bg-[rgb(var(--ink-blue-rgb)/14%)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue-bright)]"
              >
                <Bot className="w-4 h-4" aria-hidden="true" />
                Ask Atlas about this trip
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Portfolio ────────────────────────────────── */}
      {portfolio.length > 0 && (
        <section className="animate-fade-up animate-fade-up-delay-3">
          <div className="flex items-center justify-between mb-4 border-b border-[hsl(var(--border))] pb-3">
            <h3 className="font-display text-lg font-semibold text-[hsl(var(--foreground))]">
              {currentTrip ? "Other trips" : "Your trips"}
            </h3>
            <Link
              href="/app/trips"
              className="text-[var(--ink-blue-bright)] text-xs font-semibold font-sans-clean hover:opacity-70 py-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue-bright)]"
            >
              See all →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {portfolio.map((t) => {
              const b = budgetState(t);
              return (
                <Link
                  key={t.id}
                  href={`/app/trips/${t.id}`}
                  className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden shadow-[var(--shadow-card)] hover:border-[var(--ink-blue-bright)]/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue-bright)]"
                >
                  <div className="relative h-32 bg-[hsl(var(--muted))]">
                    {t.imageUrl ? (
                      <OptimizedImage
                        src={t.imageUrl}
                        alt={t.destination}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        fallback={
                          <div className="w-full h-full flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                            <ImageOff className="w-5 h-5" />
                          </div>
                        }
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                        <ImageOff className="w-5 h-5" />
                      </div>
                    )}
                    <span
                      className={`absolute top-2 right-2 text-[10px] font-mono-data uppercase tracking-[0.08em] px-2 py-0.5 rounded-full backdrop-blur-sm ${
                        t.status === "active"
                          ? "bg-[rgb(var(--transit-green-rgb)/90%)] text-white"
                          : t.status === "completed"
                            ? "bg-black/45 text-white"
                            : "bg-[rgb(var(--ink-blue-rgb)/92%)] text-white"
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div className="p-3.5">
                    <p className="font-display text-[15px] font-semibold text-[hsl(var(--foreground))] truncate">
                      {t.destination}
                    </p>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] font-sans-clean text-[hsl(var(--muted-foreground))]">
                      <span className="font-mono-data">
                        {toDate(t.startDate)
                          ? toDate(t.startDate)!.toLocaleDateString(undefined, {
                              month: "short",
                              year: "2-digit",
                            })
                          : `${t.days || "?"} days`}
                      </span>
                      {b.hasBudget && (
                        <span className="font-mono-data">
                          {b.sym}
                          {b.total.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Empty ────────────────────────────────────── */}
      {!tripsLoading && (!trips || trips.length === 0) && (
        <section className="animate-fade-up rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-8 py-16 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-xl bg-[rgb(var(--ink-blue-rgb)/10%)] flex items-center justify-center mb-4 text-[var(--ink-blue-bright)]">
            <Plus className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-[hsl(var(--foreground))] mb-1.5">
            No trips yet
          </h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-sm mb-6 font-sans-clean">
            Give TripMate a destination and rough dates — it drafts the day-by-day itinerary,
            a budget, and a packing list you can adjust.
          </p>
          <Button
            onClick={() => navigate("/app/planner")}
            className="bg-[var(--amber)] hover:bg-[var(--airbnb-primary-active)] text-white px-6 h-10 rounded-lg font-semibold text-sm font-sans-clean"
          >
            Plan your first trip
          </Button>
        </section>
      )}
    </div>
  );
}
