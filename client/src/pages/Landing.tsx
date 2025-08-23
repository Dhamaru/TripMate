import { TripMateLogo } from "@/components/TripMateLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function Landing() {
  const [tripForm, setTripForm] = useState({
    destination: '',
    budget: '',
    days: '',
    groupSize: ''
  });

  const features = [
    {
      icon: 'fas fa-route',
      title: 'Smart Trip Planner',
      description: 'AI-powered itinerary generation based on your preferences, budget, and travel style.',
      color: 'bg-ios-blue'
    },
    {
      icon: 'fas fa-book',
      title: 'Travel Journal',
      description: 'Capture memories with photos, notes, and stories. Create beautiful travel memories.',
      color: 'bg-ios-orange'
    },
    {
      icon: 'fas fa-cloud-sun',
      title: 'Weather Insights',
      description: '7-day forecasts, weather alerts, and packing recommendations for any destination.',
      color: 'bg-ios-green'
    },
    {
      icon: 'fas fa-language',
      title: 'Smart Translator',
      description: 'Offline translation for 10+ languages with voice input and conversation mode.',
      color: 'bg-purple-600'
    },
    {
      icon: 'fas fa-exchange-alt',
      title: 'Currency Converter',
      description: 'Real-time exchange rates for 20+ currencies with offline rate caching.',
      color: 'bg-yellow-600'
    },
    {
      icon: 'fas fa-shield-alt',
      title: 'Emergency Services',
      description: 'Locate nearby hospitals, police, and embassies with one-tap SOS calling.',
      color: 'bg-ios-red'
    }
  ];

  const travelStyles = [
    { icon: 'fas fa-backpack', name: 'Adventure', color: 'text-ios-blue' },
    { icon: 'fas fa-spa', name: 'Relaxation', color: 'text-ios-orange' },
    { icon: 'fas fa-landmark', name: 'Cultural', color: 'text-purple-400' },
    { icon: 'fas fa-utensils', name: 'Culinary', color: 'text-ios-green' }
  ];

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      {/* Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <TripMateLogo size="md" />
            <div className="hidden md:flex items-center space-x-4">
              <a href="#features" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                Features
              </a>
              <a href="#dashboard" className="text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                Dashboard
              </a>
              <Button 
                onClick={() => window.location.href = '/api/login'}
                className="bg-ios-blue hover:bg-blue-600"
                data-testid="button-sign-in"
              >
                Sign In
              </Button>
            </div>
            <div className="md:hidden">
              <button className="text-gray-300 hover:text-white">
                <i className="fas fa-bars text-xl"></i>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-16 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
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
                onClick={() => window.location.href = '/api/login'}
                className="bg-ios-blue hover:bg-blue-600 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105"
                data-testid="button-start-planning"
              >
                Start Planning
              </Button>
              <Button 
                variant="outline"
                className="bg-ios-card hover:bg-gray-700 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105 border border-ios-gray"
                data-testid="button-watch-demo"
              >
                Watch Demo
              </Button>
            </div>
          </div>
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
              <Card 
                key={index} 
                className="bg-ios-card border-ios-gray hover:transform hover:scale-105 transition-all duration-300"
                data-testid={`feature-card-${index}`}
              >
                <CardContent className="p-6">
                  <div className={`w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-4`}>
                    <i className={`${feature.icon} text-white text-xl`}></i>
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                  <p className="text-ios-gray mb-4">{feature.description}</p>
                </CardContent>
              </Card>
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
            <Card className="bg-ios-card border-ios-gray">
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
                      <label className="block text-sm font-semibold text-white mb-2">Budget (USD)</label>
                      <Input
                        type="number"
                        placeholder="1000"
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
                          className="bg-ios-darker border border-ios-gray rounded-xl p-3 text-center hover:border-ios-blue transition-colors"
                          data-testid={`travel-style-${index}`}
                        >
                          <i className={`${style.icon} ${style.color} mb-2 text-lg`}></i>
                          <div className="text-sm font-medium text-white">{style.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={() => window.location.href = '/api/login'}
                    className="w-full bg-gradient-to-r from-ios-blue to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105"
                    data-testid="button-generate-itinerary"
                  >
                    Generate My Itinerary
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-ios-darker border-t border-ios-card py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <TripMateLogo size="md" className="mb-4" />
              <p className="text-ios-gray mb-4 max-w-md">
                Your intelligent travel companion powered by AI. Plan smarter, travel better, and create unforgettable memories.
              </p>
              <div className="flex space-x-4">
                <a href="#" className="text-ios-gray hover:text-white transition-colors">
                  <i className="fab fa-twitter text-xl"></i>
                </a>
                <a href="#" className="text-ios-gray hover:text-white transition-colors">
                  <i className="fab fa-instagram text-xl"></i>
                </a>
                <a href="#" className="text-ios-gray hover:text-white transition-colors">
                  <i className="fab fa-facebook text-xl"></i>
                </a>
              </div>
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
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-ios-card mt-8 pt-8 text-center text-sm text-ios-gray">
            <p>&copy; 2024 TripMate. All rights reserved. Made with ❤️ for travelers worldwide.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
