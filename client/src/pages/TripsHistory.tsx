import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import type { Trip } from "@shared/schema";
import { Compass, Plus, Search, Filter, Clock, Users, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { logError } from "@/lib/logger";

const STATUS_STYLE: Record<string, string> = {
  active:    "bg-blue-50 text-blue-600 border-blue-200",
  planning:  "bg-[#fff1f3] text-[#ff385c] border-[#ffd1da]",
  completed: "bg-green-50 text-green-600 border-green-200",
};

export default function TripsHistory() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: trips, isLoading: tripsLoading, error } = useQuery<Trip[]>({
    queryKey: ["/api/v1/trips"],
    enabled: !isLoading && !!isAuthenticated,
  });

  useEffect(() => {
    if (error && !isLoading) {
      const msg = String((error as any)?.message || "");
      if (isUnauthorizedError(error as any)) {
        toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
        try { logError("trips_history_unauthorized", { message: msg }); } catch {}
        const t = setTimeout(() => navigate("/signin", { replace: true }), 500);
        return () => clearTimeout(t);
      }
      try { logError("trips_history_error", { message: msg }); } catch {}
    }
  }, [error, isLoading]);

  const filteredTrips = (trips ?? []).filter((trip) => {
    const dest = (trip?.destination ?? "").toLowerCase();
    const status = trip?.status ?? "planning";
    return dest.includes(searchQuery.toLowerCase()) && (statusFilter === "all" || status === statusFilter);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#222222] tracking-tight">My Trips</h1>
          <p className="text-[#6a6a6a] text-sm mt-0.5">
            {filteredTrips.length} {filteredTrips.length === 1 ? "trip" : "trips"} found
          </p>
        </div>
        <Link href="/app/planner">
          <Button className="bg-[#ff385c] hover:bg-[#e00b41] text-white rounded-xl gap-2">
            <Plus className="h-4 w-4" /> New Trip
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-[#ebebeb] p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#929292]" />
            <Input
              placeholder="Search destinations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-[#f7f7f7] border-[#ebebeb] text-[#222222] placeholder:text-[#929292] focus-visible:ring-[#ff385c]/30"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-[#f7f7f7] border-[#ebebeb] text-[#222222]">
              <Filter className="h-4 w-4 mr-2 text-[#929292]" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trips</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {tripsLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#ff385c]" />
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#ebebeb] p-16 text-center">
          <div className="w-16 h-16 bg-[#f7f7f7] rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Compass className="h-8 w-8 text-[#929292]" />
          </div>
          <h3 className="text-lg font-semibold text-[#222222] mb-2">
            {searchQuery || statusFilter !== "all" ? "No trips found" : "No trips yet"}
          </h3>
          <p className="text-[#6a6a6a] text-sm mb-6">
            {searchQuery || statusFilter !== "all" ? "Try adjusting your filters" : "Start planning your first adventure!"}
          </p>
          {!searchQuery && statusFilter === "all" && (
            <Link href="/app/planner">
              <Button className="bg-[#ff385c] hover:bg-[#e00b41] text-white rounded-xl gap-2">
                <Plus className="h-4 w-4" /> Plan Your First Trip
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredTrips.map((trip, index) => (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.3 }}
            >
              <Link href={`/app/trips/${trip.id}`}>
                <div className="bg-white rounded-2xl border border-[#ebebeb] hover:border-[#ff385c]/30 hover:shadow-md transition-all cursor-pointer group overflow-hidden flex h-36">
                  {/* Image */}
                  <div className="w-1/3 min-w-[120px] relative bg-gradient-to-br from-[#ff385c] to-[#e00b41] overflow-hidden flex-shrink-0">
                    {trip.imageUrl ? (
                      <img
                        src={trip.imageUrl}
                        alt={trip.destination}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Compass className="w-8 h-8 text-white/70" />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-[#222222] text-base leading-tight">
                          {trip.destination || "New Trip"}
                        </h3>
                        <p className="text-[#929292] text-xs capitalize mt-0.5">{trip.travelStyle}</p>
                      </div>
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${STATUS_STYLE[trip.status ?? "planning"] ?? STATUS_STYLE.planning}`}>
                        {trip.status ?? "Planning"}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-[#6a6a6a]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {trip.days ?? 0} days
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {Number(trip.groupSize ?? 1) === 1 ? "Solo" : `${trip.groupSize} people`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Wallet className="w-3.5 h-3.5" /> ₹{(trip.budget ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
