import { TripMateLogo } from "@/components/TripMateLogo";
import {
  Route, BookOpen, CloudSun, Languages, Banknote, Shield,
  Mountain, Armchair, Landmark, Utensils,
  Menu, Lightbulb, Code
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const [tripForm, setTripForm] = useState({
    destination: '',
    budget: '',
    days: '',
    groupSize: ''
  });

  // Redirect authenticated users to home
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/app/home");
    }
  }, [isAuthenticated, isLoading, navigate]);

  const features = [
    {
      icon: Route,
      title: 'Smart Trip Planner',
      description: 'AI-powered itinerary generation based on your preferences, budget, and travel style.',
      color: 'bg-ios-blue'
    },
    {
      icon: BookOpen,
      title: 'Travel Journal',
      description: 'Capture memories with photos, notes, and stories. Create beautiful travel memories.',
      color: 'bg-ios-orange'
    },
    {
      icon: CloudSun,
      title: 'Weather Insights',
      description: '7-day forecasts, weather alerts, and packing recommendations for any destination.',
      color: 'bg-ios-green'
    },
    {
      icon: Languages,
      title: 'Smart Translator',
      description: 'Offline translation for 10+ languages with voice input and conversation mode.',
      color: 'bg-ios-blue'
    },
    {
      icon: Banknote,
      title: 'Currency Converter',
      description: 'Real-time exchange rates for 20+ currencies with offline rate caching.',
      color: 'bg-ios-orange'
    },
    {
      icon: Shield,
      title: 'Emergency Services',
      description: 'Locate nearby hospitals, police, and embassies with one-tap SOS calling.',
      color: 'bg-ios-red'
    }
  ];

  const travelStyles = [
    { icon: Mountain, name: 'Adventure', color: 'text-ios-blue' },
    { icon: Armchair, name: 'Relaxation', color: 'text-ios-orange' },
    { icon: Landmark, name: 'Cultural', color: 'text-ios-blue' },
    { icon: Utensils, name: 'Culinary', color: 'text-ios-green' }
  ];

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <TripMateLogo size="md" />
            <div className="hidden md:flex items-center space-x-4">
              <a href="#features" className="text-ios-gray hover:text-white px-3 py-2 rounded-lg text-sm font-medium smooth-transition interactive-tap min-tap-target">
                Features
              </a>
              <a href="#support" className="text-ios-gray hover:text-white px-3 py-2 rounded-lg text-sm font-medium smooth-transition interactive-tap min-tap-target">
                Support
              </a>
              <Button
                onClick={() => window.location.href = '/signin'}
                className="bg-ios-blue hover:bg-blue-600"
                data-testid="button-sign-in"
              >
                Sign In
              </Button>
            </div>
            <div className="md:hidden">
              <button className="text-ios-gray hover:text-white smooth-transition interactive-tap min-tap-target">
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-screen flex items-center pt-header-gap">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <motion.div className="text-center" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="mb-8">
              <TripMateLogo size="lg" className="justify-center mb-6" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6" data-testid="hero-title">
              Your AI Travel
              <span className="bg-gradient-to-r from-ios-blue to-purple-600 bg-clip-text text-transparent ml-3">
                Companion
              </span>
            </h1>
            <p className="text-xl text-ios-gray mb-8 max-w-3xl mx-auto leading-relaxed" data-testid="hero-description">
              Plan, explore, and experience the world with TripMate's intelligent travel assistant.
              From trip planning to real-time guidance, we've got your journey covered.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => window.location.href = '/signin'}
                className="bg-ios-blue hover:bg-blue-600 text-white px-8 py-4 radius-md text-lg font-semibold smooth-transition interactive-tap"
                data-testid="button-start-planning"
              >
                Sign In
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 bg-ios-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="features-title">
              Everything You Need
            </h2>
            <p className="text-xl text-ios-gray max-w-2xl mx-auto" data-testid="features-description">
              Comprehensive travel tools powered by AI to make your journey seamless and memorable.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div key={index} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.05 }} className="">
                <Card
                  className="bg-ios-card border-ios-gray elev-1 hover-lift smooth-transition radius-md"
                  data-testid={`feature-card-${index}`}
                >
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-4`}>
                      <feature.icon className="text-white w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                    <p className="text-ios-gray mb-4">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trip Planner Demo */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="planner-title">
              Plan Your Perfect Trip
            </h2>
            <p className="text-xl text-ios-gray max-w-2xl mx-auto" data-testid="planner-description">
              Tell us your preferences and let AI create a personalized itinerary just for you.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <Card className="bg-ios-card border-ios-gray elev-1">
              <CardContent className="p-8">
                <form className="space-y-6" data-testid="trip-planner-form">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Destination</label>
                      <Input
                        type="text"
                        placeholder="Where do you want to go?"
                        value={tripForm.destination}
                        onChange={(e) => setTripForm(prev => ({ ...prev, destination: e.target.value }))}
                        className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                        data-testid="input-destination"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Budget (₹ INR)</label>
                      <Input
                        type="number"
                        placeholder="75000"
                        value={tripForm.budget}
                        onChange={(e) => setTripForm(prev => ({ ...prev, budget: e.target.value }))}
                        className="bg-ios-darker border-ios-gray text-white placeholder-ios-gray"
                        data-testid="input-budget"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Trip Duration</label>
                      <Select
                        value={tripForm.days}
                        onValueChange={(value) => setTripForm(prev => ({ ...prev, days: value }))}
                      >
                        <SelectTrigger
                          className="bg-ios-darker border-ios-gray text-white"
                          data-testid="select-duration"
                        >
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent className="bg-ios-darker border-ios-gray">
                          <SelectItem value="1-3" className="text-white hover:bg-ios-card">1-3 days</SelectItem>
                          <SelectItem value="4-7" className="text-white hover:bg-ios-card">4-7 days</SelectItem>
                          <SelectItem value="1-2weeks" className="text-white hover:bg-ios-card">1-2 weeks</SelectItem>
                          <SelectItem value="3+weeks" className="text-white hover:bg-ios-card">3+ weeks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Group Size</label>
                      <Select
                        value={tripForm.groupSize}
                        onValueChange={(value) => setTripForm(prev => ({ ...prev, groupSize: value }))}
                      >
                        <SelectTrigger
                          className="bg-ios-darker border-ios-gray text-white"
                          data-testid="select-group-size"
                        >
                          <SelectValue placeholder="Select group size" />
                        </SelectTrigger>
                        <SelectContent className="bg-ios-darker border-ios-gray">
                          <SelectItem value="solo" className="text-white hover:bg-ios-card">Solo traveler</SelectItem>
                          <SelectItem value="2-3" className="text-white hover:bg-ios-card">2-3 people</SelectItem>
                          <SelectItem value="4-6" className="text-white hover:bg-ios-card">4-6 people</SelectItem>
                          <SelectItem value="7+" className="text-white hover:bg-ios-card">7+ people</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">Travel Style</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {travelStyles.map((style, index) => (
                        <button
                          key={index}
                          type="button"
                          className="bg-ios-darker border border-ios-gray radius-md p-3 text-center hover:border-ios-blue smooth-transition"
                          data-testid={`travel-style-${index}`}
                        >
                          <style.icon className={`${style.color} mb-2 w-6 h-6 mx-auto`} />
                          <div className="text-sm font-medium text-white">{style.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => window.location.href = '/signin'}
                    className="w-full bg-gradient-to-r from-ios-blue to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105"
                    data-testid="button-generate-itinerary"
                  >
                    Sign In to Generate Itinerary
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="support" className="bg-ios-darker border-t border-ios-card py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <TripMateLogo size="md" className="mb-4" />
              <p className="text-ios-gray mb-4 max-w-md">
                Your intelligent travel companion powered by AI. Plan smarter, travel better, and create unforgettable memories.
              </p>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">Features</h3>
              <ul className="space-y-2 text-sm text-ios-gray">
                <li><a href="#" className="hover:text-white transition-colors">Trip Planner</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Travel Journal</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Weather Forecast</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Language Translator</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Emergency Services</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-sm text-ios-gray">
                <li><a href="/app/feedback" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="/app/feedback" className="hover:text-white transition-colors">Contact Us</a></li>
              </ul>
            </div>
          </div>

          {/* Team Credits */}
          <div className="mt-12">
            <h3 className="text-white font-semibold text-center mb-6 text-xl">Meet the Team</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <Card className="bg-ios-card border-ios-gray">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-ios-blue rounded-full flex items-center justify-center flex-shrink-0">
                      <Lightbulb className="text-white w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-lg mb-1">Sai Naidu .B</h4>
                      <p className="text-ios-blue text-sm font-semibold mb-2">Product Visionary & UX Designer</p>
                      <p className="text-ios-gray text-sm">
                        Conceptualized the core features and user experience that make TripMate intuitive and powerful.
                        Responsible for the creative vision and innovative ideas that shape the product.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-ios-card border-ios-gray">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-ios-green rounded-full flex items-center justify-center flex-shrink-0">
                      <Code className="text-white w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-lg mb-1">Dhamarunath .K</h4>
                      <p className="text-ios-green text-sm font-semibold mb-2">Lead Developer & DevOps Engineer</p>
                      <p className="text-ios-gray text-sm">
                        Architected and implemented the entire technical infrastructure, from backend systems to deployment.
                        Manages hosting, databases, and ensures seamless performance across all platforms.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="border-t border-ios-card mt-8 pt-8 text-center text-sm text-ios-gray">
            <p>&copy; 2025 TripMate. All rights reserved. Made with ❤️ for travelers worldwide.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
