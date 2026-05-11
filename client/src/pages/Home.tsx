import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore, useTripStore } from "@/store";
import { Link, useLocation } from "wouter";
import type { Trip } from "@/types/api.types";
import { Compass, Plus, History, Map, BookOpen, Grid, ArrowRight, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

export default function Home() {
  const { user } = useAuthStore();
  const { trips, fetchTrips, isLoading: tripsLoading, error } = useTripStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  useEffect(() => {
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
      try { logError('home_trips_error', { message: error }); } catch { }
    }
  }, [error, toast]);

  const currentTrip = trips?.length > 0 ? trips[0] : null;

  const STYLE_LABELS: Record<string, string> = {
    adventure:  'Adventure',
    Adventure:  'Adventure',
    cultural:   'Culture & History',
    Cultural:   'Culture & History',
    relaxed:    'Rest & Relax',
    Relaxed:    'Rest & Relax',
    budget:     'Budget Travel',
    Budget:     'Budget Travel',
    luxury:     'Luxury',
    Luxury:     'Luxury',
    family:     'Family Trip',
    Family:     'Family Trip',
  };
  const goalLabel = currentTrip ? (STYLE_LABELS[currentTrip.travelStyle] ?? 'Explore & Discover') : 'Explore & Discover';

  const quickActions = [
    {
      title: "Plan Trip",
      icon: Plus,
      href: "/app/planner",
      color: "text-ios-blue",
      bg: "bg-ios-blue/10",
      accent: "from-ios-blue/20 to-purple-600/20",
    },
    {
      title: "Journal",
      icon: BookOpen,
      href: "/app/journal",
      color: "text-ios-green",
      bg: "bg-ios-green/10",
      accent: "from-ios-green/20 to-emerald-600/20",
    },
    {
      title: "Tools",
      icon: Grid,
      href: "/app/tools",
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      accent: "from-purple-500/20 to-pink-600/20",
    },
    {
      title: "Maps",
      icon: Map,
      href: "/app/maps",
      color: "text-ios-orange",
      bg: "bg-ios-orange/10",
      accent: "from-ios-orange/20 to-red-600/20",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-12">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative"
      >
        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-ios-blue rounded-full"></div>
        <h1 className="text-5xl font-black text-white tracking-tighter mb-2">
          {(!trips || trips.length === 0) ? 'Welcome' : 'Welcome back'},<br />
          <span className="bg-gradient-to-r from-ios-blue to-purple-400 bg-clip-text text-transparent">
            {user?.firstName || 'Explorer'}
          </span>
        </h1>
        <p className="text-ios-gray font-medium text-lg">Where shall we go next?</p>
      </motion.div>

      {/* Hero Current Trip */}
      <AnimatePresence>
        {!tripsLoading && currentTrip && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <Card 
              className="bg-ios-card/50 backdrop-blur-2xl border-white/5 overflow-hidden hover:border-ios-blue/30 transition-all duration-500 cursor-pointer group shadow-2xl relative"
              onClick={() => navigate(`/app/trips/${currentTrip.id}`)}
            >
                <div className="absolute top-0 right-0 p-6 z-20">
                    <div className="bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-ios-blue animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white">Active Journey</span>
                    </div>
                </div>

              <div className="relative h-72 w-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-ios-darker via-ios-darker/40 to-transparent z-10" />
                <div className="absolute inset-0 bg-ios-blue/10 mix-blend-overlay z-10" />
                
                {currentTrip.imageUrl ? (
                  <img 
                    src={currentTrip.imageUrl} 
                    alt={currentTrip.destination}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-ios-blue/60 to-purple-900 group-hover:scale-110 transition-transform duration-700" />
                )}

                <div className="absolute bottom-0 left-0 p-8 z-20 w-full">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 group-hover:translate-x-2 transition-transform duration-500">
                        {currentTrip.destination}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 text-ios-gray font-bold text-xs uppercase tracking-widest">
                      <span className="flex items-center gap-1.5">
                        <Compass className="w-4 h-4 text-ios-blue" />
                        {currentTrip.travelStyle}
                      </span>
                      <span className="w-1 h-1 bg-ios-gray/30 rounded-full" />
                      <span>{currentTrip.days} Days</span>
                      <span className="w-1 h-1 bg-ios-gray/30 rounded-full" />
                      <span>{currentTrip.groupSize} People</span>
                    </div>
                  </div>
                </div>
              </div>

              <CardContent className="p-8 flex justify-between items-center bg-white/[0.02]">
                <div className="flex gap-8">
                  <div>
                    <p className="text-[10px] font-black text-ios-gray uppercase tracking-widest mb-1.5">Status</p>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-ios-blue animate-pulse" />
                        <span className="text-sm font-bold text-white capitalize">{currentTrip.status}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-ios-gray uppercase tracking-widest mb-1.5">Goal</p>
                    <p className="text-sm font-bold text-white">{goalLabel}</p>
                  </div>
                </div>
                <Button className="bg-white text-black hover:bg-ios-blue hover:text-white rounded-xl px-6 h-12 font-bold transition-all shadow-xl group/btn">
                  Manage Trip
                  <ArrowRight className="ml-2 w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Actions Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="space-y-6"
      >
        <h2 className="text-xs font-black text-ios-gray uppercase tracking-[0.3em] ml-1">Universal Tools</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {quickActions.map((action, idx) => (
            <Link key={action.title} href={action.href}>
              <motion.div
                whileHover={{ y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card className="bg-ios-card/40 backdrop-blur-xl border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300 cursor-pointer h-full group overflow-hidden relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${action.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  <CardContent className="p-8 flex flex-col items-center justify-center text-center h-full relative z-10">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${action.bg} group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg`}>
                      <action.icon className={`w-7 h-7 ${action.color}`} />
                    </div>
                    <span className="font-black text-white text-sm uppercase tracking-widest">{action.title}</span>
                  </CardContent>
                </Card>
              </motion.div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Recent Activity / History */}
      {!tripsLoading && trips && trips.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between ml-1">
            <h2 className="text-xs font-black text-ios-gray uppercase tracking-[0.3em]">Discovery Logs</h2>
            <Link href="/app/trips">
              <Button variant="link" className="text-ios-blue text-xs font-bold uppercase tracking-widest hover:no-underline hover:text-white transition-colors">
                Archive <ArrowRight className="ml-1 w-3 h-3" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {trips
              .filter(t => !currentTrip || t.id !== currentTrip.id)
              .slice(0, 3)
              .map((t, idx) => (
                <Link key={t.id} href={`/app/trips/${t.id}`}>
                  <Card className="bg-ios-card/30 backdrop-blur-lg border-white/5 hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 cursor-pointer h-full group">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 group-hover:bg-ios-blue/10 transition-colors overflow-hidden">
                        {t.imageUrl ? (
                            <img src={t.imageUrl} className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity" />
                        ) : (
                            <History className="w-5 h-5 text-ios-gray group-hover:text-ios-blue transition-colors" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-white truncate group-hover:text-ios-blue transition-colors">{t.destination}</h4>
                        <p className="text-[10px] text-ios-gray font-bold uppercase tracking-widest">{t.travelStyle}</p>
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-1 rounded-md border ${
                          t.status === 'completed' ? 'border-ios-green/30 text-ios-green bg-ios-green/5' : 'border-white/10 text-ios-gray bg-white/5'
                      }`}>
                        {t.status}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {!tripsLoading && (!trips || trips.length === 0) && (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
        >
            <div className="w-20 h-20 bg-ios-blue/10 rounded-3xl flex items-center justify-center mb-6">
                <Plus className="w-10 h-10 text-ios-blue" />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tighter mb-3">No Adventures Yet</h2>
            <p className="text-ios-gray font-medium max-w-sm mb-8">
                Your future travels await. Let Atlas help you create your first legendary itinerary.
            </p>
            <Button 
                onClick={() => navigate('/app/planner')}
                className="bg-ios-blue hover:bg-ios-blue/80 px-10 h-14 rounded-2xl font-bold text-lg shadow-xl shadow-ios-blue/20"
            >
                Start Planning
            </Button>
        </motion.div>
      )}
    </div>
  );
}
