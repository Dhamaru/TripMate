import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import type { Trip, User } from "@shared/schema";
import { Compass, Plus, Search, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useEffect } from "react";
import { logError } from "@/lib/logger";

export default function TripsHistory() {
    const { user, isAuthenticated, isLoading, token } = useAuth() as { user: User | undefined; isAuthenticated: boolean; isLoading: boolean; token: string | null };
    const [, navigate] = useLocation();
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    const { data: trips, isLoading: tripsLoading, error } = useQuery<Trip[]>({
        queryKey: ['/api/v1/trips'],
        enabled: !isLoading && !!isAuthenticated,
    });

    useEffect(() => {
        if (error && !isLoading) {
            const msg = String((error as any)?.message || '');
            if (isUnauthorizedError(error as any)) {
                toast({ title: "Unauthorized", description: "Your session expired. Please sign in again.", variant: "destructive" });
                try { logError('trips_history_unauthorized', { message: msg }); } catch { }
                const t = setTimeout(() => navigate('/signin', { replace: true }), 500);
                return () => clearTimeout(t);
            }
            try { logError('trips_history_error', { message: msg }); } catch { }
        }
    }, [error, isLoading]);

    const filteredTrips = trips?.filter(trip => {
        const matchesSearch = trip.destination.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || trip.status === statusFilter;
        return matchesSearch && matchesStatus;
    }) || [];

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active':
                return 'bg-ios-green/20 text-ios-green border-ios-green/30';
            case 'planning':
                return 'bg-ios-blue/20 text-ios-blue border-ios-blue/30';
            case 'completed':
                return 'bg-ios-gray/20 text-ios-gray border-ios-gray/30';
            default:
                return 'bg-ios-card text-ios-gray border-ios-gray';
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">My Trips</h1>
                    <p className="text-ios-gray">
                        {filteredTrips.length} {filteredTrips.length === 1 ? 'trip' : 'trips'} found
                    </p>
                </div>
                <Link href="/app/planner">
                    <Button className="bg-ios-blue hover:bg-blue-600 text-white">
                        <Plus className="h-4 w-4 mr-2" />
                        New Trip
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <Card className="bg-ios-card border-ios-gray">
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ios-gray" />
                            <Input
                                placeholder="Search destinations..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                            />
                        </div>

                        {/* Status Filter */}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="bg-ios-darker border-ios-gray text-white">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-ios-darker border-ios-gray">
                                <SelectItem value="all" className="text-white hover:bg-ios-card">All Trips</SelectItem>
                                <SelectItem value="planning" className="text-white hover:bg-ios-card">Planning</SelectItem>
                                <SelectItem value="active" className="text-white hover:bg-ios-card">Active</SelectItem>
                                <SelectItem value="completed" className="text-white hover:bg-ios-card">Completed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Trips Grid */}
            {tripsLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ios-blue"></div>
                </div>
            ) : filteredTrips.length === 0 ? (
                <Card className="bg-ios-card border-ios-gray">
                    <CardContent className="p-12 text-center">
                        <Compass className="h-16 w-16 text-ios-gray mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-white mb-2">
                            {searchQuery || statusFilter !== "all" ? "No trips found" : "No trips yet"}
                        </h3>
                        <p className="text-ios-gray mb-6">
                            {searchQuery || statusFilter !== "all"
                                ? "Try adjusting your filters"
                                : "Start planning your first adventure!"}
                        </p>
                        {!searchQuery && statusFilter === "all" && (
                            <Link href="/app/planner">
                                <Button className="bg-ios-blue hover:bg-blue-600 text-white">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Plan Your First Trip
                                </Button>
                            </Link>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredTrips.map((trip, index) => (
                        <motion.div
                            key={trip.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1, duration: 0.4 }}
                        >
                            <Link href={`/app/trips/${trip.id}`}>
                                <Card className="bg-ios-card border-ios-gray hover:border-ios-blue transition-all cursor-pointer h-full group">
                                    {/* Trip Image/Header */}
                                    <div className="relative h-40 bg-gradient-to-br from-ios-blue to-purple-600 flex items-center justify-center overflow-hidden">
                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>
                                        <div className="relative text-center text-white px-4">
                                            <Compass className="w-10 h-10 mx-auto mb-2 opacity-90" />
                                            <h3 className="text-xl font-bold truncate">{trip.destination}</h3>
                                        </div>
                                    </div>

                                    {/* Trip Details */}
                                    <CardContent className="p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className={`text-xs px-3 py-1 rounded-full border ${getStatusColor(trip.status)}`}>
                                                {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                                            </span>
                                            <span className="text-sm text-ios-gray">{trip.days} days</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <p className="text-ios-gray text-xs">Budget</p>
                                                <p className="text-white font-medium">₹{trip.budget?.toLocaleString() || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-ios-gray text-xs">Group</p>
                                                <p className="text-white font-medium capitalize">{String(trip.groupSize).replace('-', ' ')}</p>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-ios-gray text-xs mb-1">Travel Style</p>
                                            <p className="text-white text-sm capitalize">{trip.travelStyle.replace('-', ' ')}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
