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
  { title: "Plan Trip",  icon: Plus,     href: "/app/planner", iconBg: "bg-[#FFFBEB]", iconColor: "text-[#F59E0B]" },
  { title: "Journal",   icon: BookOpen,  href: "/app/journal", iconBg: "bg-blue-50",   iconColor: "text-blue-500" },
  { title: "Tools",     icon: Grid,      href: "/app/tools",   iconBg: "bg-purple-50", iconColor: "text-purple-500" },
  { title: "Maps",      icon: Map,       href: "/app/maps",    iconBg: "bg-orange-50", iconColor: "text-orange-500" },
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
  const goalLabel = currentTrip ? (STYLE_LABELS[currentTrip.travelStyle] ?? "Explore & Discover") : "Explore & Discover";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold text-[#111827] tracking-tight">
          {!trips || trips.length === 0 ? "Welcome" : "Welcome back"},{" "}
          <span className="text-[#F59E0B]">{user?.firstName || "Explorer"}</span>
        </h1>
        <p className="text-[#6a6a6a] mt-1">Where shall we go next?</p>
      </div>

      {/* Current trip hero */}
      {!tripsLoading && currentTrip && (
        <div
          className="bg-white rounded-3xl border border-[#ebebeb] shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
          onClick={() => navigate(`/app/trips/${currentTrip.id}`)}
        >
          <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-[#F59E0B] to-[#D97706]">
            {currentTrip.imageUrl && (
              <img
                src={currentTrip.imageUrl}
                alt={currentTrip.destination}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute top-4 right-4">
              <span className="bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Active Journey
              </span>
            </div>
            <div className="absolute bottom-4 left-5">
              <h2 className="text-2xl font-bold text-white tracking-tight">{currentTrip.destination}</h2>
              <p className="text-white/80 text-sm capitalize">{currentTrip.travelStyle}</p>
            </div>
          </div>

          <div className="p-5 flex items-center justify-between">
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-1.5 text-[#6a6a6a]">
                <Clock className="w-4 h-4" />
                <span>{currentTrip.days} days</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#6a6a6a]">
                <Users className="w-4 h-4" />
                <span>{currentTrip.groupSize} people</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#6a6a6a]">
                <Wallet className="w-4 h-4" />
                <span>₹{currentTrip.budget?.toLocaleString()}</span>
              </div>
            </div>
            <Button size="sm" className="bg-[#F59E0B] hover:bg-[#D97706] text-white rounded-xl gap-1">
              View <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-xs font-bold text-[#929292] uppercase tracking-widest mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <div className="bg-white rounded-3xl border border-[#ebebeb] p-6 flex flex-col items-center gap-3 hover:border-[#F59E0B]/30 hover:shadow-sm transition-all cursor-pointer group">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.iconBg} group-hover:scale-110 transition-transform`}>
                  <action.icon className={`w-6 h-6 ${action.iconColor}`} />
                </div>
                <span className="text-sm font-semibold text-[#111827]">{action.title}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent trips */}
      {!tripsLoading && trips && trips.length > 1 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-[#929292] uppercase tracking-widest">Recent Trips</h2>
            <Link href="/app/trips">
              <button className="text-xs text-[#F59E0B] font-semibold flex items-center gap-1 hover:opacity-70 transition-opacity">
                See all <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {trips
              .filter((t) => !currentTrip || t.id !== currentTrip.id)
              .slice(0, 3)
              .map((t) => (
                <Link key={t.id} href={`/app/trips/${t.id}`}>
                  <div className="bg-white rounded-xl border border-[#ebebeb] p-4 flex items-center gap-3 hover:border-[#F59E0B]/30 hover:shadow-sm transition-all cursor-pointer group">
                    <div className="w-11 h-11 rounded-xl overflow-hidden bg-gradient-to-br from-[#F59E0B] to-[#D97706] flex-shrink-0">
                      {t.imageUrl ? (
                        <img src={t.imageUrl} alt={t.destination} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Compass className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#111827] truncate text-sm">{t.destination}</p>
                      <p className="text-[#929292] text-xs capitalize">{t.travelStyle}</p>
                    </div>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      t.status === "completed" ? "bg-green-50 text-green-600 border-green-200" :
                      t.status === "active" ? "bg-blue-50 text-blue-600 border-blue-200" :
                      "bg-[#FFFBEB] text-[#F59E0B] border-[#FDE68A]"
                    }`}>
                      {t.status}
                    </span>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!tripsLoading && (!trips || trips.length === 0) && (
        <div className="bg-white rounded-3xl border border-[#ebebeb] p-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-[#FFFBEB] rounded-3xl flex items-center justify-center mb-5">
            <Plus className="w-8 h-8 text-[#F59E0B]" />
          </div>
          <h2 className="text-xl font-bold text-[#111827] mb-2">No Adventures Yet</h2>
          <p className="text-[#6a6a6a] text-sm max-w-xs mb-7">
            Your future travels await. Let Atlas help you plan your first itinerary.
          </p>
          <Button
            onClick={() => navigate("/app/planner")}
            className="bg-[#1E3A8A] hover:bg-blue-900 text-white px-8 h-11 rounded-xl font-semibold"
          >
            Start Planning
          </Button>
        </div>
      )}
    </div>
  );
}
