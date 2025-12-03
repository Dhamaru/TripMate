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
    icon?: string;
  };
  forecast: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
    icon?: string;
  }>;
  hourly?: Array<{ hour: string; temp: number; condition: string; icon?: string }>;
  summary?: string;
  source?: 'openweather' | 'ai' | 'fallback' | 'fallback-route';
}

const CACHE_KEY = 'weatherWidgetCacheV1';
const UNIT_KEY = 'weatherUnit';
const TTL_MS = 10 * 60 * 1000;

function toF(c: number) { return Math.round(c * 9 / 5 + 32); }

export function WeatherWidget({ location, coords = null, className = '' }: WeatherWidgetProps) {
  const [unit, setUnit] = useState<'C' | 'F'>(() => (typeof localStorage !== 'undefined' && localStorage.getItem(UNIT_KEY) === 'F') ? 'F' : 'C');
  const { data: weather, isLoading, error, refetch } = useQuery<WeatherData>({
    queryKey: ['/api/v1/weather', location || '', coords ? `${coords.lat},${coords.lon}` : ''],
    enabled: !!location || !!coords,
    queryFn: async ({ queryKey }) => {
      const [, loc, coordStr] = queryKey as [string, string, string];
      const cacheKey = coordStr ? `coords:${coordStr}` : `loc:${String(loc).trim().toLowerCase()}`;
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        const cache = raw ? JSON.parse(raw) as Record<string, { ts: number; data: WeatherData }> : {};
        const entry = cache[cacheKey];
        if (entry && (Date.now() - entry.ts) < TTL_MS) {
          return entry.data;
        }
      } catch { }
      try {
        const lang = typeof navigator !== 'undefined' ? String(navigator.language || 'en').slice(0, 2) : 'en';
        const units = 'metric';
        const url = coordStr
          ? `/api/v1/weather?lat=${encodeURIComponent(coordStr.split(',')[0])}&lon=${encodeURIComponent(coordStr.split(',')[1])}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}`
          : `/api/v1/weather?location=${encodeURIComponent(loc)}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}`;
        if (typeof console !== 'undefined') console.log(`[weather:request] ${url}`);
        const res = await apiRequest('GET', url);
        const data = await res.json();
        if (typeof console !== 'undefined') console.log(`[weather:response] source=${String(data?.source || '')} forecast=${Array.isArray(data?.forecast) ? data.forecast.length : 0}`);
        try {
          const raw = localStorage.getItem(CACHE_KEY);
          const cache = raw ? JSON.parse(raw) as Record<string, { ts: number; data: WeatherData }> : {};
          cache[cacheKey] = { ts: Date.now(), data };
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch { }
        return data;
      } catch {
        const now = new Date();
        const month = now.getMonth();
        const base = [20, 22, 26, 30, 32, 33, 32, 31, 30, 28, 24, 21][month] || 28;
        const current = { temperature: Math.round(base), condition: base >= 30 ? 'Sunny' : base >= 25 ? 'Partly Cloudy' : 'Cloudy', humidity: 60, windSpeed: 10 };
        const forecast = Array.from({ length: 7 }, (_, i) => ({ day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`, high: Math.round(base + (i % 3) - 1), low: Math.round(base - 5 + (i % 2)), condition: i % 4 === 0 ? 'Sunny' : i % 4 === 1 ? 'Partly Cloudy' : i % 4 === 2 ? 'Cloudy' : 'Rain' }));
        return { current, forecast, summary: loc ? `Estimated conditions for ${loc}` : 'Estimated conditions', source: 'fallback' } as WeatherData;
      }
    },
  });

  if (isLoading) {
    return (
      <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="weather-widget-loading">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
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

  if (error || !weather) {
    return (
      <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="weather-widget-error">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-ios-gray text-sm">Unable to load weather data</p>
          {error && (
            <p className="text-xs text-ios-gray mt-2" data-testid="weather-error-message">{(error as Error).message}</p>
          )}
          <div className="mt-3">
            <button
              onClick={() => refetch()}
              className="px-3 py-1 rounded bg-ios-blue hover:bg-blue-600 text-white text-sm"
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
    const next = unit === 'C' ? 'F' : 'C';
    setUnit(next);
    try { localStorage.setItem(UNIT_KEY, next); } catch { }
  }

  return (
    <Card className={`bg-ios-card border-ios-gray ${className}`} data-testid="weather-widget">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold text-white">Weather Today</CardTitle>
          <button onClick={toggleUnit} className="px-2 py-1 rounded bg-ios-darker border border-ios-gray text-white text-xs hover:bg-ios-card" aria-label="Toggle units">°{unit}</button>
        </div>
        {weather.source && (
          <div className="mt-2">
            <span className="inline-block text-xs px-2 py-1 rounded bg-ios-darker border border-ios-gray text-ios-gray" data-testid="weather-source">
              Source: {weather.source}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {weather.summary && (
          <div className="mb-4" data-testid="weather-summary">
            <p className="text-sm text-ios-gray">{weather.summary}</p>
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-bold text-white" data-testid="weather-temperature" aria-live="polite">
              {unit === 'C' ? weather.current.temperature : toF(weather.current.temperature)}°{unit}
            </p>
            <p className="text-sm text-ios-gray" data-testid="weather-condition">
              {weather.current.condition}
            </p>
          </div>
          {weather.current.icon && (
            <div className="text-ios-blue text-3xl">
              <i className={weather.current.icon} data-testid="weather-icon"></i>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          {weather.forecast.slice(1, 4).map((day, index) => (
            <div key={index} data-testid={`weather-forecast-${index}`} aria-live="polite">
              <p className="text-ios-gray">{day.day}</p>
              <p className="font-medium text-white">{unit === 'C' ? day.high : toF(day.high)}°{unit}</p>
            </div>
          ))}
        </div>
        {Array.isArray(weather.hourly) && weather.hourly.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-ios-gray mb-1">Next 24 hours</div>
            <div className="grid grid-cols-8 gap-2" aria-label="hourly-temps" aria-live="polite">
              {weather.hourly.slice(0, 24).map((h, i) => (
                <div key={i} className="text-center">
                  <div className="text-[10px] text-ios-gray">{h.hour}</div>
                  <div className="h-10 flex items-end justify-center">
                    <div className="w-4 bg-ios-blue rounded" style={{ height: `${Math.min(100, (unit === 'C' ? h.temp : toF(h.temp)))}%` }} aria-label={`hour-${i}-temp`}></div>
                  </div>
                  <div className="text-[10px] text-white">{unit === 'C' ? h.temp : toF(h.temp)}°{unit}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
