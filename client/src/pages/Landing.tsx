import { TripMateLogo } from "@/components/TripMateLogo";
import {
  Route,
  BookOpen,
  CloudSun,
  Languages,
  Banknote,
  Shield,
  Mountain,
  Armchair,
  Landmark,
  Utensils,
  Menu,
  X,
  Lightbulb,
  Code,
  MapPin,
  ArrowRight,
  Check,
  Bot,
  WifiOff,
  Clock,
  Wallet,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

const features = [
  {
    icon: Route,
    title: "Smart Trip Planner",
    description:
      "AI-powered itinerary generation based on your preferences, budget, and travel style.",
    tag: "AI-Powered",
    tint: "icon-tint-amber",
  },
  {
    icon: Bot,
    title: "Atlas AI Assistant",
    description:
      "A 24/7 AI travel agent built into every page — ask it to check weather, convert currency, translate a phrase, or replan your itinerary, all by chat.",
    tag: "24/7 AI",
    tint: "icon-tint-green",
  },
  {
    icon: BookOpen,
    title: "Travel Journal",
    description:
      "Capture memories with photos, notes, and stories. Create beautiful travel recaps.",
    tag: "Memories",
    tint: "icon-tint-blue",
  },
  {
    icon: CloudSun,
    title: "Weather Insights",
    description:
      "7-day forecasts, weather alerts, and packing recommendations for any destination.",
    tag: "Real-time",
    tint: "icon-tint-blue",
  },
  {
    icon: Languages,
    title: "Smart Translator",
    description: "Instant translation for 10+ languages with phonetic pronunciation guides.",
    tag: "Offline",
    tint: "icon-tint-purple",
  },
  {
    icon: Banknote,
    title: "Currency Converter",
    description: "Real-time exchange rates for 20+ currencies with offline rate caching.",
    tag: "Live Rates",
    tint: "icon-tint-green",
  },
  {
    icon: Shield,
    title: "Emergency Services",
    description: "Locate nearby hospitals, police, and embassies with one-tap SOS calling.",
    tag: "Safety",
    tint: "icon-tint-red",
  },
  {
    icon: WifiOff,
    title: "Offline Maps",
    description:
      "Download any region before you fly and keep navigating, searching, and dropping pins with zero signal — no data plan needed abroad.",
    tag: "No Signal Needed",
    tint: "icon-tint-orange",
  },
];

const travelStyles = [
  { icon: Mountain, name: "Adventure" },
  { icon: Armchair, name: "Relaxation" },
  { icon: Landmark, name: "Cultural" },
  { icon: Utensils, name: "Culinary" },
];

const navLinks = [
  { name: "Features", href: "#features" },
  { name: "How It Works", href: "#how-it-works" },
  { name: "Support", href: "#support" },
];

function DestinationCard({
  d,
}: {
  d: { destination: string; imageUrl: string; tripCount: number };
}) {
  // Some stored trip images point at an expired/rotated API key or a
  // since-invalidated Google photo_reference (live-confirmed on real data)
  // — hide that one card on load failure rather than showing a broken
  // image icon in a public showcase.
  const [failed, setFailed] = useState(false);
  const [, navigate] = useLocation();
  if (failed) return null;
  return (
    <button
      // A real destination someone already planned for is a stronger
      // signup prompt than a generic CTA — clicking one carries it
      // straight into the signup destination field, same as typing it
      // into the hero search.
      onClick={() => navigate(`/signup?destination=${encodeURIComponent(d.destination.trim())}`)}
      className="stamp-press relative flex-shrink-0 w-64 h-40 rounded-2xl overflow-hidden group border border-[hsl(var(--border))] text-left hover:-translate-y-1 hover:border-[var(--amber)]/50 transition-[transform,border-color] duration-300"
    >
      <img
        src={d.imageUrl}
        alt={d.destination}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
      <div className="absolute bottom-3.5 left-4 right-4">
        <p className="text-white font-semibold text-sm truncate">{d.destination}</p>
        <p className="text-white/70 text-xs mt-0.5 font-mono-data">
          {d.tripCount} {d.tripCount === 1 ? "trip" : "trips"} planned
        </p>
      </div>
    </button>
  );
}

/** Mouse-parallax stack of three real product surfaces (itinerary day, Atlas
 * chat, budget line) rendered as tilted passport pages — the hero's one
 * authored motion moment, and evidence rather than decoration (no fabricated
 * screenshots, just the app's own real components restated in miniature). */
function HeroCardStack() {
  const ref = useRef<HTMLDivElement>(null);
  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const rotateX = useSpring(rawRotateX, { stiffness: 150, damping: 22 });
  const rotateY = useSpring(rawRotateY, { stiffness: 150, damping: 22 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rawRotateY.set(px * 14);
    rawRotateX.set(py * -14);
  }
  function handleMouseLeave() {
    rawRotateX.set(0);
    rawRotateY.set(0);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative h-[380px] hidden lg:block"
      style={{ perspective: 1400 }}
      aria-hidden="true"
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative w-full h-full"
      >
        {/* back: Atlas chat exchange */}
        <div
          className="absolute top-2 right-2 w-64 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
          style={{ transform: "translateZ(-70px) translateX(10px) rotate(4deg)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full icon-tint-green flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-[hsl(var(--foreground))]">Atlas</span>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed mb-2">
            Weather in Kyoto next Tuesday?
          </p>
          <p className="text-xs text-[hsl(var(--foreground))] leading-relaxed bg-[hsl(var(--muted))] rounded-lg px-3 py-2">
            18°C, light rain after 3pm — pack a compact umbrella for the Fushimi Inari walk.
          </p>
        </div>

        {/* mid: budget line */}
        <div
          className="absolute top-32 left-0 w-56 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
          style={{ transform: "translateZ(-10px) translateX(-10px) rotate(-3deg)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-3.5 h-3.5 text-[var(--amber)]" />
            <span className="label-xs text-[hsl(var(--muted-foreground))]">Budget</span>
          </div>
          <p className="font-display text-2xl font-bold text-[hsl(var(--foreground))] font-mono-data">
            ₹42,600
          </p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
            of ₹55,000 · 6 days
          </p>
        </div>

        {/* front: itinerary day */}
        <div
          className="absolute bottom-0 left-10 w-72 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 perforated-edge"
          style={{ transform: "translateZ(60px) translateX(0px) rotate(2deg)" }}
        >
          <p className="label-xs text-[hsl(var(--muted-foreground))] mb-3">Day 3 · Kyoto</p>
          {[
            { time: "09:00", title: "Fushimi Inari Shrine" },
            { time: "13:30", title: "Nishiki Market lunch" },
            { time: "16:00", title: "Kiyomizu-dera" },
          ].map((item) => (
            <div key={item.time} className="flex items-center gap-3 py-1.5">
              <Clock className="w-3 h-3 text-[hsl(var(--muted-foreground))] flex-shrink-0" />
              <span className="font-mono-data text-[11px] text-[hsl(var(--muted-foreground))] w-10">
                {item.time}
              </span>
              <span className="text-xs text-[hsl(var(--foreground))]">{item.title}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

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
  const [stats, setStats] = useState<{
    tripsPlanned: number;
    destinationsPlanned: number;
    travelers: number;
  } | null>(null);
  const [topDestinations, setTopDestinations] = useState<
    Array<{ destination: string; imageUrl: string; tripCount: number }>
  >([]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate("/app/home");
  }, [isAuthenticated, isLoading, navigate]);

  // Real numbers, not marketing copy — both endpoints already exclude
  // QA/guest accounts and leftover scratch data server-side. Fails
  // silently (the sentence just doesn't render) rather than showing a
  // loading spinner or a fake placeholder number.
  useEffect(() => {
    fetch("/api/v1/public/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setStats(data))
      .catch(() => {});
    fetch("/api/v1/public/top-destinations")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.destinations && setTopDestinations(data.destinations))
      .catch(() => {});
  }, []);

  const goToSignup = () => {
    const params = new URLSearchParams();
    if (destination.trim()) params.set("destination", destination.trim());
    if (selectedStyle) params.set("style", selectedStyle.toLowerCase());
    const qs = params.toString();
    navigate(qs ? `/signup?${qs}` : "/signup");
  };

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
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const q = destination.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      abortRef.current = new AbortController();
      try {
        const res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(q)}`, {
          signal: abortRef.current.signal,
        });
        const json = await res.json().catch(() => []);
        const arr: any[] = Array.isArray(json)
          ? json
          : Array.isArray(json?.results)
            ? json.results
            : [];
        const mapped = arr
          .slice(0, 6)
          .map((it: any) => ({
            name: it.name || it.display_name?.split(",")[0] || "",
            country: it.country || it.display_name?.split(",").slice(-1)[0]?.trim() || "",
          }))
          .filter((s) => s.name);
        setSuggestions(mapped);
        setShowSuggestions(mapped.length > 0);
        setActiveIndex(-1);
      } catch (e: any) {
        if (e?.name !== "AbortError") setSuggestions([]);
      }
    }, 280);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [destination]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] font-sans-clean">
      {/* ── Navigation ─────────────────────────────────── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
          scrolled
            ? "bg-[hsl(var(--background))]/95 backdrop-blur-md border-b border-[hsl(var(--border))]"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <TripMateLogo size="md" />

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] text-sm font-medium transition-colors"
                >
                  {link.name}
                </a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => navigate("/signin")}
                className="stamp-press text-[hsl(var(--foreground))] text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[hsl(var(--muted))] transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate("/signup")}
                className="stamp-press bg-[var(--amber)] hover:bg-[#0F2C52] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                Get Started Free
              </button>
            </div>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-lg transition-colors"
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
              className="md:hidden bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] overflow-hidden"
            >
              <div className="px-4 py-6 space-y-4">
                {navLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="block text-base font-medium text-[hsl(var(--foreground))] hover:text-[var(--amber)] transition-colors"
                  >
                    {link.name}
                  </a>
                ))}
                <div className="pt-2 flex flex-col gap-3">
                  <button
                    onClick={() => navigate("/signin")}
                    className="stamp-press w-full border border-[hsl(var(--border))] text-[hsl(var(--foreground))] py-3 rounded-lg text-sm font-semibold hover:bg-[hsl(var(--muted))] transition-colors"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => navigate("/signup")}
                    className="stamp-press w-full bg-[var(--amber)] text-white py-3 rounded-lg text-sm font-semibold hover:bg-[#0F2C52] transition-colors"
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
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1
              className="font-display text-5xl sm:text-6xl lg:text-6xl font-bold text-[hsl(var(--foreground))] leading-[1.05] tracking-tight mb-6"
              style={{ textWrap: "balance" }}
              data-testid="hero-title"
            >
              Your AI travel companion
            </h1>

            <p
              className="text-lg sm:text-xl text-[hsl(var(--muted-foreground))] mb-10 max-w-xl leading-relaxed"
              data-testid="hero-description"
            >
              Plan, explore, and experience the world with TripMate's intelligent travel assistant.
              From itinerary generation to real-time guidance — your entire journey, handled.
            </p>

            {/* Hero search bar with autocomplete */}
            <div className="max-w-xl mb-8 relative" ref={searchRef}>
              <div className="flex items-center bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-full px-6 py-4 gap-4 focus-within:border-[var(--amber)] transition-colors">
                <MapPin className="w-5 h-5 text-[var(--amber)] flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Where do you want to go?"
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                  }}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.max(i - 1, -1));
                    }
                    if (e.key === "Enter") {
                      if (activeIndex >= 0 && suggestions[activeIndex]) {
                        setDestination(suggestions[activeIndex].name);
                        setShowSuggestions(false);
                      } else {
                        goToSignup();
                      }
                    }
                    if (e.key === "Escape") setShowSuggestions(false);
                  }}
                  className="flex-1 min-w-0 text-[hsl(var(--foreground))] text-base outline-none bg-transparent placeholder:text-[hsl(var(--muted-foreground))]"
                  data-testid="input-destination"
                  autoComplete="off"
                />
                <button
                  onClick={goToSignup}
                  className="stamp-press bg-[var(--amber)] hover:bg-[#0F2C52] text-white rounded-full px-5 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors flex-shrink-0"
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
                    className="absolute left-0 right-0 top-full mt-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl overflow-hidden z-50"
                  >
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${activeIndex === idx ? "bg-[hsl(var(--muted))]" : "hover:bg-[hsl(var(--muted))]"}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          setDestination(s.name);
                          setShowSuggestions(false);
                        }}
                      >
                        <MapPin className="w-4 h-4 text-[var(--amber)] flex-shrink-0" />
                        <div>
                          <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                            {s.name}
                          </span>
                          {s.country && (
                            <span className="text-xs text-[hsl(var(--muted-foreground))] ml-2">
                              {s.country}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Travel style chips */}
            <div className="flex flex-wrap items-center gap-2 mb-10">
              {travelStyles.map((style) => (
                <button
                  key={style.name}
                  onClick={() => setSelectedStyle(style.name === selectedStyle ? null : style.name)}
                  className={`stamp-press flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                    selectedStyle === style.name
                      ? "bg-[var(--amber)] border-[var(--amber)] text-white"
                      : "bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[var(--amber)]"
                  }`}
                >
                  <style.icon className="w-3.5 h-3.5" />
                  {style.name}
                </button>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={goToSignup}
                className="stamp-press bg-[var(--amber)] hover:bg-[#0F2C52] text-white px-8 py-4 rounded-lg text-base font-semibold transition-colors"
              >
                Get Started Free
              </button>
              <button
                onClick={() => navigate("/signin")}
                className="stamp-press bg-transparent border border-[hsl(var(--border))] text-[hsl(var(--foreground))] px-8 py-4 rounded-lg text-base font-semibold hover:bg-[hsl(var(--muted))] transition-colors"
              >
                Sign In
              </button>
            </div>
          </motion.div>

          <HeroCardStack />
        </div>
      </section>

      {/* ── Destination showcase ───────────────────────── */}
      {topDestinations.length > 0 && (
        <section className="py-16 overflow-hidden border-t border-[hsl(var(--border))]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-[hsl(var(--foreground))] mb-2">
              Real trips, real destinations
            </h2>
            {stats && (
              <p className="text-[hsl(var(--muted-foreground))] text-sm">
                <span className="font-mono-data text-[hsl(var(--foreground))]">
                  {stats.tripsPlanned}
                </span>{" "}
                trips planned across{" "}
                <span className="font-mono-data text-[hsl(var(--foreground))]">
                  {stats.destinationsPlanned}
                </span>{" "}
                destinations by{" "}
                <span className="font-mono-data text-[hsl(var(--foreground))]">
                  {stats.travelers}
                </span>{" "}
                travelers — and counting.
              </p>
            )}
          </motion.div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-32 bg-gradient-to-r from-[hsl(var(--background))] to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-32 bg-gradient-to-l from-[hsl(var(--background))] to-transparent z-10" />
            <div className="flex gap-4 w-max animate-marquee">
              {[...topDestinations, ...topDestinations].map((d, i) => (
                <DestinationCard key={`${d.destination}-${i}`} d={d} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Features — a manifest, not a card grid ─────── */}
      <section
        id="features"
        className="py-20 px-4 sm:px-6 lg:px-8 border-t border-[hsl(var(--border))]"
      >
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2
              className="text-3xl md:text-5xl font-bold text-[hsl(var(--foreground))] mb-4"
              style={{ textWrap: "balance" }}
              data-testid="features-title"
            >
              Everything one trip needs
            </h2>
            <p
              className="text-[hsl(var(--muted-foreground))] text-lg max-w-xl mb-4"
              data-testid="features-description"
            >
              Nine tools that would otherwise be nine separate apps — planning, budget, packing,
              memories, and an AI agent that knows your trip.
            </p>
          </motion.div>

          <div>
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: (i % 4) * 0.06 }}
                className={`flex flex-col items-start sm:flex-row gap-4 sm:gap-8 py-6 group ${i > 0 ? "perforated-edge" : ""}`}
                data-testid={`feature-row-${i}`}
              >
                <div className="flex items-center gap-4 sm:w-64 flex-shrink-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${feature.tint} flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}
                  >
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                    {feature.title}
                  </h3>
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed flex-1">
                  {feature.description}
                </p>
                <span className="stamp text-[10px] flex-shrink-0" style={{ color: "var(--amber)" }}>
                  {feature.tag}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────── */}
      <section
        id="how-it-works"
        className="py-20 px-4 sm:px-6 lg:px-8 border-t border-[hsl(var(--border))]"
      >
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2
              className="text-3xl md:text-5xl font-bold text-[hsl(var(--foreground))] mb-4"
              style={{ textWrap: "balance" }}
            >
              Plan your perfect trip
            </h2>
            <p
              className="text-[hsl(var(--muted-foreground))] text-lg max-w-xl mb-14"
              data-testid="planner-description"
            >
              Tell us your preferences and let AI create a personalized itinerary just for you.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Set your preferences",
                desc: "Enter your destination, budget, travel style, and trip duration.",
              },
              {
                step: "02",
                title: "AI builds your plan",
                desc: "Our multi-agent AI researches, drafts, and validates your itinerary against real-world constraints.",
              },
              {
                step: "03",
                title: "Travel & adjust",
                desc: "Track expenses, write journal entries, and let Atlas AI answer questions on the go.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.12 }}
                className={`pt-6 pr-6 ${i > 0 ? "md:border-l md:border-[hsl(var(--border))] md:pl-8" : ""} border-t-2 border-[var(--amber)]`}
              >
                <div className="font-mono-data text-sm text-[var(--amber)] mb-3">{item.step}</div>
                <h3 className="font-semibold text-[hsl(var(--foreground))] mb-2 text-lg">
                  {item.title}
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="mt-14">
            <button
              onClick={() => navigate("/signup")}
              className="stamp-press inline-flex items-center gap-2 bg-[var(--explorer-blue)] hover:bg-[var(--amber)] text-white px-8 py-4 rounded-lg text-base font-semibold transition-colors"
              data-testid="button-generate-itinerary"
            >
              Start Planning
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Ready to travel smarter ─────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-[hsl(var(--border))]">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-3xl p-10 md:p-16 text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-[hsl(var(--foreground))] mb-4">
              Ready to travel smarter?
            </h2>
            <p className="text-[hsl(var(--muted-foreground))] text-lg mb-8 max-w-xl mx-auto">
              Plan faster, spend smarter, and explore deeper with TripMate.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
              <button
                onClick={() => navigate("/signup")}
                className="stamp-press bg-[var(--amber)] hover:bg-[#0F2C52] text-white px-8 py-4 rounded-lg text-base font-semibold transition-colors"
              >
                Get Started Free
              </button>
              <button
                onClick={() => navigate("/signin")}
                className="stamp-press bg-transparent hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] px-8 py-4 rounded-lg text-base font-semibold transition-colors"
              >
                Sign In
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[hsl(var(--muted-foreground))] text-sm">
              {["No credit card required", "Free to start", "Cancel anytime"].map((point) => (
                <span key={point} className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[var(--forest)]" />
                  {point}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer
        id="support"
        className="border-t border-[hsl(var(--border))] py-14 px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            <div className="md:col-span-2">
              <TripMateLogo size="md" className="mb-4" />
              <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-xs leading-relaxed">
                Your intelligent travel companion powered by AI. Plan smarter, travel better, and
                create unforgettable memories.
              </p>
            </div>

            <div>
              <h3 className="text-[hsl(var(--foreground))] font-semibold text-sm mb-4">Features</h3>
              <ul className="space-y-2.5 text-sm text-[hsl(var(--muted-foreground))]">
                {[
                  "Trip Planner",
                  "Atlas AI Assistant",
                  "Travel Journal",
                  "Offline Maps",
                  "Weather Forecast",
                  "Language Translator",
                  "Emergency Services",
                ].map((f) => (
                  <li key={f}>
                    <a
                      href="#features"
                      className="hover:text-[hsl(var(--foreground))] transition-colors"
                    >
                      {f}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[hsl(var(--foreground))] font-semibold text-sm mb-4">Support</h3>
              <ul className="space-y-2.5 text-sm text-[hsl(var(--muted-foreground))]">
                <li>
                  <a
                    href="/app/feedback"
                    className="hover:text-[hsl(var(--foreground))] transition-colors"
                  >
                    Help Center
                  </a>
                </li>
                <li>
                  <a
                    href="/privacy"
                    className="hover:text-[hsl(var(--foreground))] transition-colors"
                  >
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a
                    href="/terms"
                    className="hover:text-[hsl(var(--foreground))] transition-colors"
                  >
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a
                    href="/app/feedback"
                    className="hover:text-[hsl(var(--foreground))] transition-colors"
                  >
                    Contact Us
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Team */}
          <div className="border-t border-[hsl(var(--border))] pt-10 mb-10">
            <h3 className="text-[hsl(var(--foreground))] font-semibold text-center mb-6">
              Meet the Team
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {[
                {
                  icon: Lightbulb,
                  name: "Sai Naidu .B",
                  role: "Product Visionary & UX Designer",
                  bio: "Conceptualized the core features and user experience that make TripMate intuitive and powerful.",
                  tint: "icon-tint-amber",
                },
                {
                  icon: Code,
                  name: "Dhamarunath .K",
                  role: "Lead Developer",
                  bio: "Architected and implemented the entire technical infrastructure, from backend systems to deployment.",
                  tint: "icon-tint-green",
                },
              ].map((member, i) => (
                <motion.div
                  key={member.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.1 }}
                  className="flex items-start gap-4 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-5 hover:border-[var(--amber)]/40 hover:-translate-y-0.5 transition-[transform,border-color] duration-300"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${member.tint}`}
                  >
                    <member.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-[hsl(var(--foreground))] text-sm">
                      {member.name}
                    </div>
                    <div className="text-[var(--amber)] text-xs font-medium mb-1">
                      {member.role}
                    </div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                      {member.bio}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="border-t border-[hsl(var(--border))] pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[hsl(var(--muted-foreground))]">
            <p>© {new Date().getFullYear()} TripMate. All rights reserved.</p>
            <p>Made with ❤️ for travelers worldwide.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
