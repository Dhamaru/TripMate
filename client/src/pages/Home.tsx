import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import type { Trip, User } from "@shared/schema";
import { Compass, Plus, History, Map, BookOpen, Grid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useEffect } from "react";
import { logError } from "@/lib/logger";

export default function Home() {
  const { user, isAuthenticated, isLoading } = useAuth() as { user: User | undefined; isAuthenticated: boolean; isLoading: boolean };
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);
  const { data: trips, isLoading: tripsLoading, error } = useQuery<Trip[]>({
    queryKey: ['/api/v1/trips'],
    enabled: !isLoading && !!isAuthenticated,
  });

  useEffect(() => {
    if (error && !isLoading) {
      const msg = String((error as any)?.message || '');
      if (isUnauthorizedError(error as any)) {
        toast({ title: "Unauthorized", description: "Your session expired. Please sign in again.", variant: "destructive" });
        try { logError('home_trips_unauthorized', { message: msg }); } catch { }
        const t = setTimeout(() => navigate('/signin', { replace: true }), 500);
        return () => clearTimeout(t);
      }
      try { logError('home_trips_error', { message: msg }); } catch { }
    }
  }, [error, isLoading]);

  const currentTrip = trips?.find(trip => trip.status === 'active') || trips?.[0];

  const quickActions = [
    {
      title: "Plan Trip",
      icon: Plus,
      href: "/app/planner",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Journal",
      icon: BookOpen,
      href: "/app/journal",
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      title: "Tools",
      icon: Grid,
      href: "/app/tools",
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      title: "Maps",
      icon: Map,
      href: "/app/maps",
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Welcome back, {user?.firstName || 'Traveler'}!
        </h1>
        <p className="text-muted-foreground">Ready for your next adventure?</p>
      </motion.div>

      {/* Quick Actions - Moved to top */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        <h2 className="text-xl font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer h-full">
                <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full py-6">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${action.bg}`}>
                    <action.icon className={`w-5 h-5 ${action.color}`} />
                  </div>
                  <span className="font-medium text-sm">{action.title}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Current Trip Section */}
      {!tripsLoading && currentTrip && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">Current Trip</h2>
            <Link href={`/app/trips/${currentTrip.id}`}>
              <Button variant="link" className="text-primary">View Details</Button>
            </Link>
          </div>
          <Card className="bg-card border-border overflow-hidden hover:border-primary/50 transition-colors cursor-pointer" onClick={() => navigate(`/app/trips/${currentTrip.id}`)}>
            <div className="relative h-48 bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <div className="text-center text-white px-6">
                <Compass className="w-12 h-12 mx-auto mb-3 opacity-90" />
                <h3 className="text-2xl font-bold mb-1">{currentTrip.destination}</h3>
                <p className="text-sm opacity-90">
                  {currentTrip.days} days • {currentTrip.groupSize}
                </p>
              </div>
            </div>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Status</p>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                  {currentTrip.status === 'active' ? 'In Progress' : currentTrip.status === 'planning' ? 'Planning' : 'Completed'}
                </span>
              </div>
              <Button size="sm">Manage</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Trip History */}
      {!tripsLoading && trips && trips.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-foreground">Recent Activity</h2>
            <Link href="/app/planner">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {trips
              .filter(t => !currentTrip || t.id !== currentTrip.id)
              .slice(0, 3)
              .map((t) => (
                <Link key={t.id} href={`/app/trips/${t.id}`}>
                  <Card className="bg-card border-border hover:bg-accent/50 transition-colors cursor-pointer h-full">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-secondary`}>
                        <History className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{t.destination}</h4>
                        <p className="text-xs text-muted-foreground">{t.days} days</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${t.status === 'completed' ? 'bg-green-500/10 text-green-500' : 'bg-secondary text-muted-foreground'}`}>
                        {t.status}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
