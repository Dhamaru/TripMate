import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface WeatherWidgetProps {
  location?: string;
  coords?: { lat: number; lon: number } | null;
  className?: string;
}

interface WeatherData {
  current: {
    temperature: number;
    condition: string;
    humidity: number;
    windSpeed: number;
    wind_kph?: number;
    windDeg?: number;
    windDir?: string;
    icon?: string;
    isDay?: boolean;
    uv_index?: number;
    visibility?: number;
    pressure?: number;
    // Server sends these pre-formatted (e.g. "6:30 AM"), not Unix
    // timestamps — a `new Date(sunrise * 1000)` on the client silently
    // produced "Invalid Date" for every real (non-fallback) weather
    // response.
    sunrise?: string;
    sunset?: string;
  };
  forecast: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
    icon?: string;
  }>;
  hourly?: Array<{ hour: string; temp: number; condition: string; icon?: string }>;
  // The server (AiUtilitiesService.weather()) never actually sends a
  // `summary` field — only `recommendations`. The block that used to key
  // off `summary` was permanently dead, which meant the one context line
  // meant to accompany a fallback estimate (e.g. "Weather data unavailable
  // — shown estimate only") never rendered anywhere.
  recommendations?: string[];
  source?: "openweather" | "ai" | "fallback" | "fallback-route";
}

const CACHE_KEY = "weatherWidgetCacheV1";
const UNIT_KEY = "weatherUnit";
const TTL_MS = 10 * 60 * 1000;

function toF(c: number) {
  return Math.round((c * 9) / 5 + 32);
}

function getClothingSuggestions(
  temp: number,
  condition: string,
  uvi: number = 0,
): { icon: string; text: string }[] {
  const suggestions = [];
  const cond = condition.toLowerCase();

  // Temperature based
  if (temp < 10) suggestions.push({ icon: "fa-mitten", text: "Wear a warm coat & gloves" });
  else if (temp < 18) suggestions.push({ icon: "fa-tshirt", text: "Light jacket or sweater" });
  else if (temp > 25) suggestions.push({ icon: "fa-sun", text: "Light breathable clothes" });

  // Condition based
  if (cond.includes("rain") || cond.includes("drizzle"))
    suggestions.push({ icon: "fa-umbrella", text: "Take an umbrella" });
  if (cond.includes("snow"))
    suggestions.push({ icon: "fa-snowflake", text: "Snow boots recommended" });
  if (cond.includes("clear") && uvi > 5)
    suggestions.push({ icon: "fa-glasses", text: "Sunglasses & Sunscreen" });
  if (cond.includes("wind") || cond.includes("storm"))
    suggestions.push({ icon: "fa-wind", text: "Windbreaker recommended" });

  // Fallback
  if (suggestions.length === 0) suggestions.push({ icon: "fa-smile", text: "Enjoy your day!" });

  return suggestions.slice(0, 2); // Return top 2
}

// isDay reflects the actual local time at the queried destination (from the
// weather API's own day/night signal), not the browser's clock or the app's
// dark-mode setting — a clear night should never show the bright daytime
// surface just because the condition text says "Clear".
//
// Was a raw-Tailwind-palette gradient per condition (bg-gradient-to-br
// from-orange-500 via-amber-600 to-red-600, etc.) -- DESIGN.md explicitly
// bans a gradient block standing in for real content on a first-viewport
// hero element, which this card is. Replaced with a flat ink-role surface:
// same per-condition/day-night variety, no gradient, every color a named
// token instead of a Tailwind palette class.
function getBackgroundGradient(condition: string, temp: number, isDay: boolean = true): string {
  const cond = condition.toLowerCase();
  if (cond.includes("rain") || cond.includes("drizzle"))
    return "bg-[var(--ink-lodging)] text-white";
  if (cond.includes("cloud"))
    return isDay ? "bg-[var(--ink-lodging)] text-white" : "bg-[var(--ink)] text-white";
  if (cond.includes("clear") || cond.includes("sun")) {
    if (!isDay) return "bg-[var(--ink)] text-white";
    return temp > 25 ? "bg-[var(--ink-culture)] text-white" : "bg-[var(--ink-blue)] text-white";
  }
  // Every child element in this card hardcodes text-white (title, temp,
  // condition, etc.) rather than reading from this function's text color --
  // a light "frosty" surface here would make all of that unreadable. Keep
  // snow dark like every other condition; --ink-transit differentiates it
  // from rain/cloud without needing a readability special-case.
  if (cond.includes("snow")) return "bg-[var(--ink-transit)] text-white";
  if (cond.includes("storm") || cond.includes("thunder"))
    return "bg-[var(--ink-nightlife)] text-white";
  return isDay ? "bg-[var(--ink-blue)] text-white" : "bg-[var(--ink)] text-white"; // Default
}

export function WeatherWidget({ location, coords = null, className = "" }: WeatherWidgetProps) {
  const [unit, setUnit] = useState<"C" | "F">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem(UNIT_KEY) === "F" ? "F" : "C",
  );
  const {
    data: weather,
    isLoading,
    error,
    refetch,
  } = useQuery<WeatherData>({
    queryKey: ["/api/v1/weather", location || "", coords ? `${coords.lat},${coords.lon}` : ""],
    enabled: !!location || !!coords,
    queryFn: async ({ queryKey }) => {
      const [, loc, coordStr] = queryKey as [string, string, string];
      const cacheKey = coordStr ? `coords:${coordStr}` : `loc:${String(loc).trim().toLowerCase()}`;
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        const cache = raw
          ? (JSON.parse(raw) as Record<string, { ts: number; data: WeatherData }>)
          : {};
        const entry = cache[cacheKey];
        if (entry && Date.now() - entry.ts < TTL_MS) {
          return entry.data;
        }
      } catch {}
      try {
        const lang =
          typeof navigator !== "undefined" ? String(navigator.language || "en").slice(0, 2) : "en";
        const units = "metric";
        const url = coordStr
          ? `/api/v1/weather?lat=${encodeURIComponent(coordStr.split(",")[0])}&lon=${encodeURIComponent(coordStr.split(",")[1])}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}`
          : `/api/v1/weather?location=${encodeURIComponent(loc)}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}`;

        const res = await apiRequest("GET", url);
        const data = await res.json();

        try {
          const raw = localStorage.getItem(CACHE_KEY);
          const cache = raw
            ? (JSON.parse(raw) as Record<string, { ts: number; data: WeatherData }>)
            : {};
          cache[cacheKey] = { ts: Date.now(), data };
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch {}
        return data;
      } catch (e) {
        // Previously fabricated month-indexed placeholder temperatures here
        // (e.g. always 33°C in August regardless of location) and returned
        // them as if real, with no indication in the UI that the data was
        // fake. Let the error surface instead — the error/retry state below
        // already handles this correctly, same as WeatherCard.tsx.
        throw e;
      }
    },
  });

  if (isLoading || (!location && !coords)) {
    return (
      <Card className={`bg-card border ${className}`} data-testid="weather-widget-loading">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-foreground">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-12 w-12 rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center">
                <Skeleton className="h-4 w-16 mb-1" />
                <Skeleton className="h-4 w-12 mx-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !weather || !weather.current) {
    return (
      <Card className={`bg-card border ${className}`} data-testid="weather-widget-error">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-foreground">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Unable to load weather data</p>
          {error && (
            <p className="text-xs text-muted-foreground mt-2" data-testid="weather-error-message">
              {(error as Error).message}
            </p>
          )}
          <div className="mt-3">
            <button
              onClick={() => refetch()}
              className="px-3 py-1 rounded bg-[#1D4E89] hover:bg-blue-800 text-white text-sm"
              data-testid="button-weather-retry"
            >
              Retry
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function toggleUnit() {
    const next = unit === "C" ? "F" : "C";
    setUnit(next);
    try {
      localStorage.setItem(UNIT_KEY, next);
    } catch {}
  }

  const bgClass = getBackgroundGradient(
    weather.current.condition,
    weather.current.temperature,
    weather.current.isDay !== false,
  );
  const clothing = getClothingSuggestions(
    weather.current.temperature,
    weather.current.condition,
    weather.current.uv_index,
  );

  return (
    <Card
      className={`border-none shadow-lg overflow-hidden transition-all duration-500 ${bgClass} ${className}`}
      data-testid="weather-widget"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
            <i className="fas fa-location-arrow text-sm opacity-80"></i>
            Weather Today
          </CardTitle>
          <div className="flex items-center gap-2">
            {(weather.source === "ai" || weather.source === "fallback") && (
              <span
                className="px-2 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-100 text-xs"
                title="No live weather provider configured — this forecast is an estimate from typical seasonal patterns, not real data for this location"
                data-testid="weather-estimated-badge"
              >
                Estimated
              </span>
            )}
            <button
              onClick={toggleUnit}
              className="px-3 py-1 rounded-full bg-white/20 border border-white/30 text-white text-xs hover:bg-white/30 backdrop-blur-sm transition-colors"
              aria-label="Toggle units"
            >
              °{unit}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {weather.recommendations && weather.recommendations.length > 0 && (
          <div
            className="mb-6 bg-black/20 p-3 rounded-lg backdrop-blur-sm"
            data-testid="weather-summary"
          >
            <p className="text-sm text-white/90 leading-relaxed max-w-lg">
              {weather.recommendations.join(" · ")}
            </p>
          </div>
        )}

        {/* Main Stats */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p
              className="text-6xl font-bold text-white tracking-tighter"
              data-testid="weather-temperature"
              aria-live="polite"
            >
              {unit === "C"
                ? Math.round(weather.current.temperature)
                : toF(weather.current.temperature)}
              °
            </p>
            <p className="text-lg text-white/90 font-medium mt-1" data-testid="weather-condition">
              {weather.current.condition}
            </p>
            <div className="flex gap-3 text-sm text-white/80 mt-2">
              <span>
                H: {unit === "C" ? weather.forecast[0]?.high : toF(weather.forecast[0]?.high || 0)}°
              </span>
              <span>
                L: {unit === "C" ? weather.forecast[0]?.low : toF(weather.forecast[0]?.low || 0)}°
              </span>
            </div>
          </div>
          {weather.current.icon && (
            <div className="text-white/90 text-8xl drop-shadow-md">
              <i className={weather.current.icon} data-testid="weather-icon"></i>
            </div>
          )}
        </div>

        {/* Clothing Guide (New) */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {clothing.map((item, i) => (
            <div
              key={i}
              className="bg-white/10 backdrop-blur-md rounded-lg p-3 flex items-center gap-3 border border-white/10"
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <i className={`fas ${item.icon}`}></i>
              </div>
              <span className="text-sm text-white font-medium">{item.text}</span>
            </div>
          ))}
        </div>

        {/* Advanced Metrics (New) */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-6">
          <div className="bg-black/10 rounded-lg p-2 text-center backdrop-blur-sm">
            <i className="fas fa-wind text-white/60 mb-1"></i>
            <p className="text-xs text-white/60">Wind</p>
            {/* windSpeed is m/s from OpenWeather; wind_kph is the already-
                converted value. Reading windSpeed under a "km/h" label
                understated real wind speed by ~3.6x. */}
            <p className="text-sm font-bold text-white">
              {weather.current.wind_kph ?? weather.current.windSpeed} km/h
            </p>
          </div>
          <div className="bg-black/10 rounded-lg p-2 text-center backdrop-blur-sm">
            <i className="fas fa-tint text-white/60 mb-1"></i>
            <p className="text-xs text-white/60">Humidity</p>
            <p className="text-sm font-bold text-white">{weather.current.humidity}%</p>
          </div>
          <div className="bg-black/10 rounded-lg p-2 text-center backdrop-blur-sm">
            <i className="fas fa-sun text-white/60 mb-1"></i>
            <p className="text-xs text-white/60">UV Index</p>
            <p className="text-sm font-bold text-white">{weather.current.uv_index ?? "N/A"}</p>
          </div>
          <div className="bg-black/10 rounded-lg p-2 text-center backdrop-blur-sm hidden sm:block">
            <i className="fas fa-eye text-white/60 mb-1"></i>
            <p className="text-xs text-white/60">Visibility</p>
            {/* Server already converts meters -> km; dividing by 1000 again
                here displayed e.g. 0.01 km instead of 10 km. */}
            <p className="text-sm font-bold text-white">{weather.current.visibility ?? 0} km</p>
          </div>
          <div className="bg-black/10 rounded-lg p-2 text-center backdrop-blur-sm hidden md:block">
            <i className="fas fa-arrow-up text-white/60 mb-1"></i>
            <p className="text-xs text-white/60">Sunrise</p>
            <p className="text-sm font-bold text-white">{weather.current.sunrise || "--"}</p>
          </div>
          <div className="bg-black/10 rounded-lg p-2 text-center backdrop-blur-sm hidden md:block">
            <i className="fas fa-arrow-down text-white/60 mb-1"></i>
            <p className="text-xs text-white/60">Sunset</p>
            <p className="text-sm font-bold text-white">{weather.current.sunset || "--"}</p>
          </div>
        </div>

        {/* Forecast */}
        <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm">
          <p className="text-xs font-semibold text-white/80 mb-3 uppercase tracking-wider">
            7-Day Forecast
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 text-xs text-center">
            {weather.forecast.map((day, index) => (
              <div
                key={index}
                data-testid={`weather-forecast-${index}`}
                aria-live="polite"
                className="flex flex-col items-center"
              >
                <p className="text-white/70 mb-1">
                  {(() => {
                    const raw = String((day as any).day || (day as any).date || "");
                    if (raw) return raw.split(" ")[0].slice(0, 3);
                    // Derive from index: today, tomorrow, then weekday names
                    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                    const d = new Date();
                    d.setDate(d.getDate() + index);
                    return index === 0 ? "Now" : days[d.getDay()];
                  })()}
                </p>
                {day.icon && <i className={`${day.icon} text-white text-lg my-1`}></i>}
                <div className="flex flex-col">
                  <span className="font-bold text-white">
                    {unit === "C" ? day.high : toF(day.high)}°
                  </span>
                  <span className="text-white/50">{unit === "C" ? day.low : toF(day.low)}°</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
