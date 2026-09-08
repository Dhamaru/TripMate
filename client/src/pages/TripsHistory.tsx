import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import type { Trip } from "@shared/schema";
import { Compass, Plus, Search, Filter, ArrowUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { logError } from "@/lib/logger";
import { TripCard } from "@/components/dashboard/TripCard";

export default function TripsHistory() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // UX-audit finding: no way to sort My Trips once a user has more than a
  // handful — always server/creation order. "newest" mirrors that as the
  // default so existing behavior doesn't change until a user picks one.
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "destination" | "upcoming">("newest");

  const {
    data: trips,
    isLoading: tripsLoading,
    error,
  } = useQuery<Trip[]>({
    queryKey: ["/api/v1/trips"],
    enabled: !isLoading && !!isAuthenticated,
  });

  useEffect(() => {
    if (error && !isLoading) {
      const msg = String((error as any)?.message || "");
      if (isUnauthorizedError(error as any)) {
        toast({
          title: "Session expired",
          description: "Please sign in again.",
          variant: "destructive",
        });
        try {
          logError("trips_history_unauthorized", { message: msg });
        } catch {}
        const t = setTimeout(() => navigate("/signin", { replace: true }), 500);
        return () => clearTimeout(t);
      }
      try {
        logError("trips_history_error", { message: msg });
      } catch {}
    }
  }, [error, isLoading]);

  const filteredTrips = (trips ?? [])
    .filter((trip) => {
      const dest = (trip?.destination ?? "").toLowerCase();
      const status = trip?.status ?? "planning";
      return (
        dest.includes(searchQuery.toLowerCase()) &&
        (statusFilter === "all" || status === statusFilter)
      );
    })
    .sort((a, b) => {
      if (sortBy === "destination") {
        return (a.destination ?? "").localeCompare(b.destination ?? "");
      }
      if (sortBy === "upcoming") {
        // Trips with a start date sort soonest-first; undated trips sink
        // to the bottom rather than sorting as "epoch 0" (soonest).
        const aTime = a.startDate ? new Date(a.startDate).getTime() : Infinity;
        const bTime = b.startDate ? new Date(b.startDate).getTime() : Infinity;
        return aTime - bTime;
      }
      // newest/oldest by Mongo ObjectId creation order (first 8 hex chars
      // are a timestamp) — trips don't carry a client-visible createdAt,
      // and id ordering is already how the unsorted list behaves today.
      const aId = String(a.id ?? "");
      const bId = String(b.id ?? "");
      return sortBy === "oldest" ? aId.localeCompare(bId) : bId.localeCompare(aId);
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">My Trips</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {filteredTrips.length} {filteredTrips.length === 1 ? "trip" : "trips"} found
          </p>
        </div>
        <Link href="/app/planner">
          <Button className="bg-[var(--ink-blue)] hover:bg-[#0F2C52] text-white rounded-xl gap-2">
            <Plus className="h-4 w-4" /> New Trip
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-3xl border border-border p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search destinations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted border text-foreground placeholder:text-muted-foreground focus-visible:ring-[rgb(var(--ink-blue-rgb)/30%)]"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-muted border text-foreground">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trips</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="bg-muted border text-foreground">
              <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="upcoming">Upcoming first</SelectItem>
              <SelectItem value="destination">Destination A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {tripsLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--ink-blue)]" />
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-16 text-center">
          <div className="w-16 h-16 bg-muted rounded-3xl flex items-center justify-center mx-auto mb-5">
            <Compass className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {searchQuery || statusFilter !== "all" ? "No trips found" : "No trips yet"}
          </h3>
          <p className="text-muted-foreground text-sm mb-6">
            {searchQuery || statusFilter !== "all"
              ? "Try adjusting your filters"
              : "Start planning your first adventure!"}
          </p>
          {!searchQuery && statusFilter === "all" && (
            <Link href="/app/planner">
              <Button className="bg-[var(--ink-blue)] hover:bg-[#0F2C52] text-white rounded-xl gap-2">
                <Plus className="h-4 w-4" /> Plan Your First Trip
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredTrips.map((trip, index) => (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 8) * 0.06, duration: 0.3 }}
            >
              <TripCard trip={trip} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
