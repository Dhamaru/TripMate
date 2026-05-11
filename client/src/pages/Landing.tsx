import { TripMateLogo } from "@/components/TripMateLogo";
import {
  Route, BookOpen, CloudSun, Languages, Banknote, Shield,
  Mountain, Armchair, Landmark, Utensils,
  Menu, X, Lightbulb, Code, Star, MapPin, Users, ArrowRight,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

const features = [
  {
    icon: Route,
    title: "Smart Trip Planner",
    description: "AI-powered itinerary generation based on your preferences, budget, and travel style.",
    tag: "AI-Powered",
  },
  {
    icon: BookOpen,
    title: "Travel Journal",
    description: "Capture memories with photos, notes, and stories. Create beautiful travel recaps.",
    tag: "Memories",
  },
  {
    icon: CloudSun,
    title: "Weather Insights",
    description: "7-day forecasts, weather alerts, and packing recommendations for any destination.",
    tag: "Real-time",
  },
  {
    icon: Languages,
    title: "Smart Translator",
    description: "Instant translation for 10+ languages with phonetic pronunciation guides.",
    tag: "Offline",
  },
  {
    icon: Banknote,
    title: "Currency Converter",
    description: "Real-time exchange rates for 20+ currencies with offline rate caching.",
    tag: "Live Rates",
  },
  {
    icon: Shield,
    title: "Emergency Services",
    description: "Locate nearby hospitals, police, and embassies with one-tap SOS calling.",
    tag: "Safety",
  },
];

const travelStyles = [
  { icon: Mountain, name: "Adventure" },
  { icon: Armchair, name: "Relaxation" },
  { icon: Landmark, name: "Cultural" },
  { icon: Utensils, name: "Culinary" },
];

const stats = [
  { value: "10K+", label: "Trips Planned" },
  { value: "50+", label: "Destinations" },
  { value: "4.9", label: "User Rating", icon: Star },
  { value: "24/7", label: "AI Support" },
];

const navLinks = [
  { name: "Features", href: "#features" },
  { name: "How It Works", href: "#how-it-works" },
  { name: "Support", href: "#support" },
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ name: string; country: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate("/app/home");
  }, [isAuthenticated, isLoading, navigate]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced geocode fetch for suggestions
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    const q = destination.trim();
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = window.setTimeout(async () => {
      abortRef.current = new AbortController();
      try {
        const res = await fetch(`/api/v1/geocode?query=${encodeURIComponent(q)}`, { signal: abortRef.current.signal });
        const json = await res.json().catch(() => []);
        const arr: any[] = Array.isArray(json) ? json : (Array.isArray(json?.results) ? json.results : []);
        const mapped = arr.slice(0, 6).map((it: any) => ({
          name: it.name || it.display_name?.split(',')[0] || '',
          country: it.country || it.display_name?.split(',').slice(-1)[0]?.trim() || '',
        })).filter((s) => s.name);
        setSuggestions(mapped);
        setShowSuggestions(mapped.length > 0);
        setActiveIndex(-1);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setSuggestions([]);
      }
    }, 280);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [destination]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#111827] font-sans">

      {/* ── Navigation ─────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-[#ebebeb]" : "bg-transparent"
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <TripMateLogo size="md" />

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-[#6a6a6a] hover:text-[#111827] text-sm font-medium transition-colors"
                >
                  {link.name}
                </a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => navigate("/signin")}
                className="text-[#111827] text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#f7f7f7] transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate("/signup")}
                className="bg-[#F59E0B] hover:bg-[#D97706] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                Get Started Free
              </button>
            </div>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-[#111827] hover:bg-[#f7f7f7] rounded-lg transition-colors"
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white border-b border-[#ebebeb] overflow-hidden"
            >
              <div className="px-4 py-6 space-y-4">
                {navLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="block text-base font-medium text-[#111827] hover:text-[#F59E0B] transition-colors"
                  >
                    {link.name}
                  </a>
                ))}
                <div className="pt-2 flex flex-col gap-3">
                  <button
                    onClick={() => navigate("/signin")}
                    className="w-full border border-[#dddddd] text-[#111827] py-3 rounded-lg text-sm font-semibold hover:bg-[#f7f7f7] transition-colors"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => navigate("/signup")}
                    className="w-full bg-[#F59E0B] text-white py-3 rounded-lg text-sm font-semibold hover:bg-[#D97706] transition-colors"
                  >
                    Get Started Free
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── Hero ───────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 bg-[#FFFBEB] text-[#F59E0B] text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
              AI-Powered Travel Planning
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-[#111827] leading-tight tracking-tight mb-6" data-testid="hero-title">
              Your AI Travel
              <span className="text-[#F59E0B]"> Companion</span>
            </h1>

            <p className="text-lg text-[#6a6a6a] mb-10 max-w-2xl mx-auto leading-relaxed" data-testid="hero-description">
              Plan, explore, and experience the world with TripMate's intelligent travel assistant.
              From itinerary generation to real-time guidance — your entire journey, handled.
            </p>

            {/* Hero search bar with autocomplete */}
            <div className="max-w-2xl mx-auto mb-8 relative" ref={searchRef}>
              <div className="flex items-center bg-white border border-[#dddddd] rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] px-6 py-4 gap-4">
                <MapPin className="w-5 h-5 text-[#F59E0B] flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Where do you want to go?"
                  value={destination}
                  onChange={(e) => { setDestination(e.target.value); }}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
                    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, -1)); }
                    if (e.key === "Enter") {
                      if (activeIndex >= 0 && suggestions[activeIndex]) {
                        setDestination(suggestions[activeIndex].name);
                        setShowSuggestions(false);
                      } else {
                        navigate("/signup");
                      }
                    }
                    if (e.key === "Escape") setShowSuggestions(false);
                  }}
                  className="flex-1 text-[#111827] text-base outline-none bg-transparent placeholder:text-[#929292]"
                  data-testid="input-destination"
                  autoComplete="off"
                />
                <button
                  onClick={() => navigate("/signup")}
                  className="bg-[#F59E0B] hover:bg-[#D97706] text-white rounded-full px-5 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors flex-shrink-0"
                  data-testid="button-get-started"
                >
                  Plan Trip
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Suggestions dropdown */}
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 right-0 top-full mt-2 bg-white border border-[#dddddd] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden z-50"
                  >
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${activeIndex === idx ? 'bg-[#FFFBEB]' : 'hover:bg-[#f7f7f7]'}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => { setDestination(s.name); setShowSuggestions(false); }}
                      >
                        <MapPin className="w-4 h-4 text-[#F59E0B] flex-shrink-0" />
                        <div>
                          <span className="text-sm font-medium text-[#111827]">{s.name}</span>
                          {s.country && <span className="text-xs text-[#929292] ml-2">{s.country}</span>}
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Travel style chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
              {travelStyles.map((style) => (
                <button
                  key={style.name}
                  onClick={() => setSelectedStyle(style.name === selectedStyle ? null : style.name)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                    selectedStyle === style.name
                      ? "bg-[#F59E0B] border-[#F59E0B] text-white"
                      : "bg-white border-[#dddddd] text-[#111827] hover:border-[#111827]"
                  }`}
                >
                  <style.icon className="w-3.5 h-3.5" />
                  {style.name}
                </button>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate("/signup")}
                className="bg-[#F59E0B] hover:bg-[#D97706] text-white px-8 py-4 rounded-lg text-base font-semibold transition-colors"
              >
                Get Started Free
              </button>
              <button
                onClick={() => navigate("/signin")}
                className="bg-white border border-[#111827] text-[#111827] px-8 py-4 rounded-lg text-base font-semibold hover:bg-[#f7f7f7] transition-colors"
              >
                Sign In
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats strip ────────────────────────────────── */}
      <section className="border-y border-[#ebebeb] py-10 bg-[#f7f7f7]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-2xl font-bold text-[#111827]">{stat.value}</span>
                  {stat.icon && <stat.icon className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B]" />}
                </div>
                <div className="text-sm text-[#6a6a6a] mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────── */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#F59E0B] text-sm font-semibold mb-2 uppercase tracking-wide">Features</p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] mb-4" data-testid="features-title">
              Everything You Need
            </h2>
            <p className="text-[#6a6a6a] text-lg max-w-2xl mx-auto" data-testid="features-description">
              Comprehensive travel tools powered by AI to make your journey seamless and memorable.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="bg-white border border-[#ebebeb] rounded-3xl p-6 hover:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-all duration-200 group"
                data-testid={`feature-card-${i}`}
              >
                <div className="w-11 h-11 bg-[#FFFBEB] rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#F59E0B] transition-colors">
                  <feature.icon className="w-5 h-5 text-[#F59E0B] group-hover:text-white transition-colors" />
                </div>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-base font-semibold text-[#111827]">{feature.title}</h3>
                  <span className="text-[10px] font-bold text-[#F59E0B] bg-[#FFFBEB] px-2 py-0.5 rounded-full ml-2 flex-shrink-0">
                    {feature.tag}
                  </span>
                </div>
                <p className="text-sm text-[#6a6a6a] leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#f7f7f7]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#F59E0B] text-sm font-semibold mb-2 uppercase tracking-wide">How It Works</p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#111827] mb-4">
              Plan Your Perfect Trip
            </h2>
            <p className="text-[#6a6a6a] text-lg max-w-xl mx-auto" data-testid="planner-description">
              Tell us your preferences and let AI create a personalized itinerary just for you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "01", title: "Set Your Preferences", desc: "Enter your destination, budget, travel style, and trip duration." },
              { step: "02", title: "AI Builds Your Plan", desc: "Our multi-agent AI researches, drafts, and validates your itinerary against real-world constraints." },
              { step: "03", title: "Travel & Adjust", desc: "Track expenses, write journal entries, and let Atlas AI answer questions on the go." },
            ].map((item) => (
              <div key={item.step} className="bg-white border border-[#ebebeb] rounded-3xl p-6">
                <div className="text-3xl font-bold text-[#F59E0B] mb-3 font-mono">{item.step}</div>
                <h3 className="font-semibold text-[#111827] mb-2">{item.title}</h3>
                <p className="text-sm text-[#6a6a6a] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <button
              onClick={() => navigate("/signup")}
              className="inline-flex items-center gap-2 bg-[#1E3A8A] hover:bg-blue-800 text-white px-8 py-4 rounded-lg text-base font-semibold transition-colors"
              data-testid="button-generate-itinerary"
            >
              Start Planning
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Why TripMate ───────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-[#1E3A8A] rounded-3xl p-10 md:p-16 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to travel smarter?
            </h2>
            <p className="text-[#929292] text-lg mb-8 max-w-xl mx-auto">
              Join thousands of travelers who plan faster, spend smarter, and explore deeper with TripMate.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
              <button
                onClick={() => navigate("/signup")}
                className="bg-[#F59E0B] hover:bg-[#D97706] text-white px-8 py-4 rounded-lg text-base font-semibold transition-colors"
              >
                Get Started Free
              </button>
              <button
                onClick={() => navigate("/signin")}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-lg text-base font-semibold transition-colors"
              >
                Sign In
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[#929292] text-sm">
              {["No credit card required", "Free to start", "Cancel anytime"].map((point) => (
                <span key={point} className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#00a699]" />
                  {point}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer id="support" className="border-t border-[#ebebeb] py-14 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            <div className="md:col-span-2">
              <TripMateLogo size="md" className="mb-4" />
              <p className="text-sm text-[#6a6a6a] max-w-xs leading-relaxed">
                Your intelligent travel companion powered by AI. Plan smarter, travel better, and create unforgettable memories.
              </p>
            </div>

            <div>
              <h3 className="text-[#111827] font-semibold text-sm mb-4">Features</h3>
              <ul className="space-y-2.5 text-sm text-[#6a6a6a]">
                {["Trip Planner", "Travel Journal", "Weather Forecast", "Language Translator", "Emergency Services"].map((f) => (
                  <li key={f}><a href="#" className="hover:text-[#111827] transition-colors">{f}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[#111827] font-semibold text-sm mb-4">Support</h3>
              <ul className="space-y-2.5 text-sm text-[#6a6a6a]">
                <li><a href="/app/feedback" className="hover:text-[#111827] transition-colors">Help Center</a></li>
                <li><a href="/privacy" className="hover:text-[#111827] transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-[#111827] transition-colors">Terms of Service</a></li>
                <li><a href="/app/feedback" className="hover:text-[#111827] transition-colors">Contact Us</a></li>
              </ul>
            </div>
          </div>

          {/* Team */}
          <div className="border-t border-[#ebebeb] pt-10 mb-10">
            <h3 className="text-[#111827] font-semibold text-center mb-6">Meet the Team</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {[
                {
                  icon: Lightbulb,
                  name: "Sai Naidu .B",
                  role: "Product Visionary & UX Designer",
                  bio: "Conceptualized the core features and user experience that make TripMate intuitive and powerful.",
                  color: "bg-[#FFFBEB]",
                  iconColor: "text-[#F59E0B]",
                },
                {
                  icon: Code,
                  name: "Dhamarunath .K",
                  role: "Lead Developer",
                  bio: "Architected and implemented the entire technical infrastructure, from backend systems to deployment.",
                  color: "bg-[#f0fff4]",
                  iconColor: "text-[#00a699]",
                },
              ].map((member) => (
                <div key={member.name} className="flex items-start gap-4 bg-[#f7f7f7] rounded-3xl p-5">
                  <div className={`w-10 h-10 ${member.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <member.icon className={`w-5 h-5 ${member.iconColor}`} />
                  </div>
                  <div>
                    <div className="font-semibold text-[#111827] text-sm">{member.name}</div>
                    <div className="text-[#F59E0B] text-xs font-medium mb-1">{member.role}</div>
                    <p className="text-xs text-[#6a6a6a] leading-relaxed">{member.bio}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[#ebebeb] pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[#6a6a6a]">
            <p>© 2025 TripMate. All rights reserved.</p>
            <p>Made with ❤️ for travelers worldwide.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
