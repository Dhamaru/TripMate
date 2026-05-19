import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore, useTripStore } from "@/store";
import { Link, useLocation } from "wouter";
import { Compass, Plus, Map, BookOpen, Grid, ArrowRight, Sparkles, Clock, Users, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

const STYLE_LABELS: Record<string, string> = {
  adventure: "Adventure", Adventure: "Adventure",
  cultural: "Culture & History", Cultural: "Culture & History",
  relaxed: "Rest & Relax", Relaxed: "Rest & Relax",
  budget: "Budget Travel", Budget: "Budget Travel",
  luxury: "Luxury", Luxury: "Luxury",
  family: "Family Trip", Family: "Family Trip",
};

const quickActions = [
  { title: "Plan Trip",  icon: Plus,     href: "/app/planner", tint: "icon-tint-amber" },
  { title: "Journal",   icon: BookOpen,  href: "/app/journal", tint: "icon-tint-blue" },
  { title: "Tools",     icon: Grid,      href: "/app/tools",   tint: "icon-tint-purple" },
  { title: "Maps",      icon: Map,       href: "/app/maps",    tint: "icon-tint-orange" },
];

export default function Home() {
  const { user } = useAuthStore();
  const { trips, fetchTrips, isLoading: tripsLoading, error } = useTripStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  useEffect(() => {
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      try { logError("home_trips_error", { message: error }); } catch {}
    }
  }, [error, toast]);

  const currentTrip = trips?.length > 0 ? trips[0] : null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-9">

      {/* ── Welcome ──────────────────────────────────── */}
      <div className="animate-fade-up">
        <p className="label-xs text-[hsl(var(--muted-foreground))] mb-1">{greeting}</p>
        <h1 className="font-display text-4xl font-bold text-[hsl(var(--foreground))] leading-tight">
          {user?.firstName || "Explorer"}
          {!trips || trips.length === 0
            ? <span className="block text-[hsl(var(--muted-foreground))] text-2xl font-normal italic mt-0.5">where to next?</span>
            : <span className="block text-[hsl(var(--muted-foreground))] text-2xl font-normal italic mt-0.5">welcome back.</span>
          }
        </h1>
      </div>

      {/* ── Active trip hero ─────────────────────────── */}
      {!tripsLoading && currentTrip && (
        <div
          className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden cursor-pointer group card-hover-glow animate-fade-up animate-fade-up-delay-1"
          onClick={() => navigate(`/app/trips/${currentTrip.id}`)}
        >
          <div className="relative h-52 w-full overflow-hidden bg-gradient-to-br from-[var(--amber)] to-[#C97908]">
            {currentTrip.imageUrl && (
              <img
                src={currentTrip.imageUrl}
                alt={currentTrip.destination}
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute top-4 right-4">
              <span className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/20 tracking-wide">
                <Sparkles className="w-3 h-3 text-[var(--amber)]" /> ACTIVE
              </span>
            </div>
            <div className="absolute bottom-5 left-5">
              <h2 className="font-display text-3xl font-bold text-white leading-tight tracking-tight">
                {currentTrip.destination}
              </h2>
              <p className="text-white/60 text-xs uppercase tracking-[0.1em] mt-1 font-sans-clean">
                {STYLE_LABELS[currentTrip.travelStyle] ?? currentTrip.travelStyle}
              </p>
            </div>
          </div>

          <div className="bg-[hsl(var(--card))] px-5 py-3.5 flex items-center justify-between">
            <div className="flex gap-5 text-sm">
              <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-sans-clean">{currentTrip.days}d</span>
              </div>
              <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs font-sans-clean">{currentTrip.groupSize} pax</span>
              </div>
              <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                <Wallet className="w-3.5 h-3.5" />
                <span className="text-xs font-sans-clean">₹{currentTrip.budget?.toLocaleString()}</span>
              </div>
            </div>
            <button className="flex items-center gap-1 text-[var(--amber)] text-xs font-semibold hover:gap-2 transition-all duration-150 font-sans-clean">
              View trip <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Quick actions ─────────────────────────────── */}
      <div className="animate-fade-up animate-fade-up-delay-2">
        <p className="label-xs text-[hsl(var(--muted-foreground))] mb-4">Quick actions</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 flex flex-col items-start gap-3 card-hover-glow cursor-pointer group">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${action.tint} group-hover:scale-110 transition-transform duration-200`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-[13px] font-semibold text-[hsl(var(--foreground))] font-sans-clean">{action.title}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Recent trips ─────────────────────────────── */}
      {!tripsLoading && trips && trips.length > 1 && (
        <div className="animate-fade-up animate-fade-up-delay-3">
          <div className="flex items-center justify-between mb-4">
            <p className="label-xs text-[hsl(var(--muted-foreground))]">Recent trips</p>
            <Link href="/app/trips">
              <button className="text-[11px] text-[var(--amber)] font-semibold flex items-center gap-1 hover:opacity-70 transition-opacity font-sans-clean">
                See all <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          </div>
          <div className="space-y-2">
            {trips
              .filter((t) => !currentTrip || t.id !== currentTrip.id)
              .slice(0, 4)
              .map((t, idx) => (
                <Link key={t.id} href={`/app/trips/${t.id}`}>
                  <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] px-4 py-3 flex items-center gap-3 card-hover-glow cursor-pointer group">
                    <span className="text-[11px] text-[hsl(var(--muted-foreground))] w-5 text-right font-display italic flex-shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-gradient-to-br from-[var(--amber)] to-[#C97908] flex-shrink-0">
                      {t.imageUrl ? (
                        <img src={t.imageUrl} alt={t.destination} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Compass className="w-4 h-4 text-black" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[hsl(var(--foreground))] truncate text-sm font-sans-clean">{t.destination}</p>
                      <p className="text-[hsl(var(--muted-foreground))] text-xs capitalize font-sans-clean">{t.travelStyle}</p>
                    </div>
                    <span className={`status-badge ${
                      t.status === "completed" ? "status-completed" :
                      t.status === "active"    ? "status-active"    :
                                                 "status-planning"
                    }`}>
                      {t.status}
                    </span>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────── */}
      {!tripsLoading && (!trips || trips.length === 0) && (
        <div className="bg-[hsl(var(--card))] rounded-2xl border border-[hsl(var(--border))] p-16 flex flex-col items-center text-center animate-fade-up animate-fade-up-delay-2">
          <div className="w-14 h-14 icon-tint-amber rounded-2xl flex items-center justify-center mb-5">
            <Plus className="w-7 h-7" />
          </div>
          <h2 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] mb-2">No adventures yet</h2>
          <p className="text-[hsl(var(--muted-foreground))] text-sm max-w-xs mb-7 font-sans-clean">
            Your first great journey is one plan away. Let Atlas craft your itinerary.
          </p>
          <Button
            onClick={() => navigate("/app/planner")}
            className="bg-[var(--amber)] hover:bg-[#C97908] text-black px-8 h-10 rounded-xl font-semibold font-sans-clean text-sm"
          >
            Start planning
          </Button>
        </div>
      )}
    </div>
  );
}
