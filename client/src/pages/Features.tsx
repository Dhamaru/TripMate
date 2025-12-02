import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import {
  Plane,
  Map,
  BookOpen,
  CloudSun,
  DollarSign,
  Shield,
  Languages,
  X
} from "lucide-react";

export default function Features() {
  const { user } = useAuth() as { user: any };
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const features = [
    {
      id: "planner",
      title: "Trip Planner",
      description: "AI-powered trip planning with personalized itineraries",
      icon: Plane,
      color: "from-ios-blue to-ios-blue",
      href: "/app/planner",
      component: null // Will be implemented later
    },
    {
      id: "journal",
      title: "Travel Journal",
      description: "Capture and organize your travel memories",
      icon: BookOpen,
      color: "from-ios-orange to-ios-orange",
      href: "/app/journal",
      component: null
    },
    {
      id: "maps",
      title: "Offline Maps",
      description: "Download and use maps without internet connection",
      icon: Map,
      color: "from-ios-green to-ios-green",
      href: "/app/maps",
      component: null
    },
    {
      id: "weather",
      title: "Weather Insights",
      description: "7-day forecasts and travel weather recommendations",
      icon: CloudSun,
      color: "from-ios-orange to-ios-orange",
      href: "/app/weather",
      component: null
    },
    {
      id: "currency",
      title: "Currency Converter",
      description: "Real-time exchange rates for 20+ currencies",
      icon: DollarSign,
      color: "from-ios-green to-ios-green",
      href: "/app/currency",
      component: null
    },
    {
      id: "translate",
      title: "Language Translator",
      description: "Offline translation for 10+ languages",
      icon: Languages,
      color: "from-ios-blue to-ios-orange",
      href: "/app/translate",
      component: null
    },
    {
      id: "emergency",
      title: "Emergency Services",
      description: "Locate nearby hospitals, police, and embassies",
      icon: Shield,
      color: "from-ios-red to-ios-red",
      href: "/app/emergency",
      component: null
    }
  ];

  const selectedFeatureData = features.find(f => f.id === selectedFeature);

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-4xl font-bold text-white mb-2">Travel Tools</h1>
          <p className="text-lg text-ios-gray">Everything you need for your perfect trip</p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className=""
            >
              <Card
                className="bg-ios-card border-ios-gray elev-1 hover-lift smooth-transition cursor-pointer overflow-hidden group radius-md"
                onClick={() => setSelectedFeature(feature.id)}
              >
                <div className={`h-32 bg-gradient-to-br ${feature.color} flex items-center justify-center relative overflow-hidden`}>
                  <feature.icon className="w-12 h-12 text-white z-10" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                </div>
                <CardContent className="p-6">
                  <h3 className="font-bold text-white mb-2 text-lg">{feature.title}</h3>
                  <p className="text-sm text-ios-gray mb-4">{feature.description}</p>
                </CardContent>
              </Card>
              <Button
                size="sm"
                className="w-full bg-ios-blue hover:bg-ios-blue mt-2 smooth-transition interactive-tap radius-md"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(feature.href);
                }}
              >
                Open Tool
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <Card className="bg-ios-card border-ios-gray">
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/app/planner">
                <Button className="w-full bg-gradient-to-r from-ios-blue to-ios-orange smooth-transition interactive-tap radius-md">
                  <Plane className="w-4 h-4 mr-2" />
                  Plan New Trip
                </Button>
              </Link>
              <Link href="/app/journal">
                <Button variant="outline" className="w-full bg-ios-darker border-ios-gray text-white hover:bg-ios-card smooth-transition interactive-tap radius-md">
                  <BookOpen className="w-4 h-4 mr-2" />
                  Write Journal Entry
                </Button>
              </Link>
              <Link href="/app/maps">
                <Button variant="outline" className="w-full bg-ios-darker border-ios-gray text-white hover:bg-ios-card smooth-transition interactive-tap radius-md">
                  <Map className="w-4 h-4 mr-2" />
                  View Maps
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Detail Modal */}
      <AnimatePresence>
        {selectedFeature && selectedFeatureData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedFeature(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ios-card border border-ios-gray radius-md max-w-md w-full max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`h-48 bg-gradient-to-br ${selectedFeatureData.color} flex items-center justify-center relative`}>
                <selectedFeatureData.icon className="w-16 h-16 text-white" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-4 right-4 text-white hover:bg-ios-card/20 smooth-transition interactive-tap min-tap-target"
                  onClick={() => setSelectedFeature(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-6">
                <h3 className="text-2xl font-bold text-white mb-2">{selectedFeatureData.title}</h3>
                <p className="text-ios-gray mb-6">{selectedFeatureData.description}</p>
                <div className="space-y-3">
                  <Button
                    className="w-full bg-ios-blue hover:bg-ios-blue smooth-transition interactive-tap radius-md"
                    onClick={() => {
                      navigate(selectedFeatureData.href);
                      setSelectedFeature(null);
                    }}
                  >
                    Launch Tool
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full bg-ios-darker border-ios-gray text-white hover:bg-ios-card smooth-transition interactive-tap radius-md"
                    onClick={() => setSelectedFeature(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
