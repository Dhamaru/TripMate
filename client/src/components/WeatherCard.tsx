import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";

type BackendWeather = {
  current?: {
    temperature?: number; conditions?: string; condition?: string; humidity?: number;
    wind_kph?: number; windSpeed?: number; icon?: string; feels_like?: number;
    uv_index?: number | null; visibility?: number | null; sunrise?: string; sunset?: string;
  };
  forecast?: Array<{ date?: string; day?: string; high?: number; low?: number; conditions?: string; condition?: string; icon?: string }>;
  advice?: string[];
  recommendations?: string[];
  source?: string;
};

type Unit = "C" | "F";
const CACHE_KEY = "weatherCacheV1";
const UNIT_KEY = "weatherUnit";
const TTL_MS = 5 * 60 * 1000;

const memCache: Map<string, { ts: number; data: BackendWeather }> = new Map();

function readCache(location: string): { ts: number; data: BackendWeather } | null {
  const k = location.trim().toLowerCase();
  const inMem = memCache.get(k);
  if (inMem) return inMem;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, { ts: number; data: BackendWeather }>;
    const entry = obj[k];
    if (!entry) return null;
    memCache.set(k, entry);
    return entry;
  } catch { return null; }
}

function writeCache(location: string, data: BackendWeather) {
  const k = location.trim().toLowerCase();
  const entry = { ts: Date.now(), data };
  memCache.set(k, entry);
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const obj = raw ? JSON.parse(raw) as Record<string, { ts: number; data: BackendWeather }> : {};
    obj[k] = entry;
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

function toF(c: number): number { return Math.round(c * 9 / 5 + 32); }
function kmhToMph(kmh: number): number { return Math.round(kmh * 0.621371); }

export function WeatherCard({ destination }: { destination?: string }) {
  const [unit, setUnit] = useState<Unit>(() => { try { return localStorage.getItem(UNIT_KEY) === "F" ? "F" : "C"; } catch { return "C"; } });
  const [offline, setOffline] = useState<boolean>(!navigator.onLine);
  const [weather, setWeather] = useState<BackendWeather | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState<boolean>(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const onOnline = () => { setOffline(false); revalidate(); };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!destination || !destination.trim()) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const cached = readCache(destination);
      if (cached && (Date.now() - cached.ts) < TTL_MS) {
        setWeather(cached.data);
        setError(null);
        setLoading(false);
        setRevalidating(true);
        fetchWeather(destination).then((fresh) => {
          if (fresh) writeCache(destination, fresh);
          setWeather(fresh);
          setRevalidating(false);
        }).catch(() => setRevalidating(false));
      } else {
        setLoading(true);
        setError(null);
        fetchWeather(destination)
          .then((data) => {
            if (data) writeCache(destination, data);
            setWeather(data);
            setLoading(false);
          })
          .catch((e) => {
            setError(String(e?.message || 'Failed to load weather'));
            setLoading(false);
          });
      }
    }, 400);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [destination]);

  function revalidate() {
    if (!destination || !destination.trim()) return;
    setRevalidating(true);
    fetchWeather(destination).then((fresh) => {
      if (fresh) writeCache(destination, fresh);
      setWeather(fresh);
      setRevalidating(false);
    }).catch(() => setRevalidating(false));
  }

  async function fetchWeather(loc: string): Promise<BackendWeather | null> {
    try {
      const lang = typeof navigator !== 'undefined' ? String(navigator.language || 'en').slice(0, 2) : 'en';
      const url = `/api/v1/weather?location=${encodeURIComponent(loc)}&units=${encodeURIComponent(unit === 'F' ? 'imperial' : 'metric')}&lang=${encodeURIComponent(lang)}`;

      const res = await apiRequest('GET', url);
      const j = await res.json();

      return j as BackendWeather;
    } catch (e: any) {
      console.warn('[weather:card:error]', e?.message || e);
      throw e;
    }
  }

  function toggleUnit() {
    const next = unit === "C" ? "F" : "C";
    setUnit(next);
    try { localStorage.setItem(UNIT_KEY, next); } catch {}
  }

  const currentView = useMemo(() => {
    const c = weather?.current || {};
    const tempC = Number(c.temperature ?? 0);
    const feelsC = Number(c.feels_like ?? tempC);
    const windKph = Number(c.wind_kph ?? ((c.windSpeed ?? 0) * 3.6));
    const cond = String(c.conditions ?? (c.condition ?? ''));
    const icon = String(c.icon ?? '');
    const humidity = Number(c.humidity ?? 0);
    const visKm = c.visibility != null ? Number(c.visibility) : null;
    const uv = c.uv_index != null ? Number(c.uv_index) : null;
    return {
      temperature: unit === 'C' ? tempC : toF(tempC),
      feelsLike: unit === 'C' ? feelsC : toF(feelsC),
      wind: unit === 'C' ? Math.round(windKph) : kmhToMph(windKph),
      windUnit: unit === 'C' ? 'km/h' : 'mph',
      conditions: cond,
      icon,
      humidity,
      visibility: visKm != null && visKm > 0 ? (unit === 'C' ? visKm : Math.round(visKm * 0.621371)) : null,
      visUnit: unit === 'C' ? 'km' : 'mi',
      uv,
      sunrise: c.sunrise || '',
      sunset: c.sunset || '',
    };
  }, [weather, unit]);

  const days = useMemo(() => {
    const arr = Array.isArray(weather?.forecast) ? weather!.forecast! : [];
    return arr.slice(0, 7).map((d, i) => {
      const label = d.date ? d.date : (d.day || `Day ${i + 1}`);
      return { label, high: unit === 'C' ? Number(d.high ?? 0) : toF(Number(d.high ?? 0)), low: unit === 'C' ? Number(d.low ?? 0) : toF(Number(d.low ?? 0)), icon: String(d.icon || ''), conditions: String(d.conditions ?? (d.condition ?? '')) };
    });
  }, [weather, unit]);

  if (!destination || !destination.trim()) {
    return (
      <Card className="bg-card border-border" role="region" aria-label="Weather" data-testid="weather-card-empty">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No destination set — add a destination to view weather</p>
          <div className="mt-2">
            <Button className="bg-[#1D4E89] hover:bg-blue-600">Edit Trip</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading && !weather) {
    return (
      <Card className="bg-card border-border" role="region" aria-label="Weather loading" data-testid="weather-card-loading">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <Skeleton className="h-10 w-24 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-12 w-12 rounded-full" />
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="text-center">
                <Skeleton className="h-4 w-12 mx-auto mb-1" />
                <Skeleton className="h-3 w-10 mx-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !weather) {
    return (
      <Card className="bg-card border-border" role="region" aria-label="Weather error" data-testid="weather-card-error">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load weather data</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <div className="mt-3"><Button onClick={() => revalidate()} className="bg-[#1D4E89] hover:bg-blue-600">Retry</Button></div>
        </CardContent>
      </Card>
    );
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <Card className="bg-card border-border overflow-hidden" role="region" aria-label="Weather" data-testid="weather-card">
      <CardContent className="p-4 space-y-4">
        {/* Top: main temp + stats + label */}
        <div className="flex items-start justify-between gap-4">
          {/* Left: icon + temp + stats */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {currentView.icon ? (
              <i className={`${currentView.icon} text-4xl text-blue-400 flex-shrink-0`} aria-label="weather-icon" />
            ) : (
              <div className="w-10 h-10 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground leading-none" aria-label="current-temperature">
                  {currentView.temperature}°
                </span>
                <button
                  onClick={toggleUnit}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Toggle units"
                >
                  {unit === 'C' ? 'C' : 'F'}<span className="text-muted-foreground/40 mx-0.5">/</span>{unit === 'C' ? 'F' : 'C'}
                </button>
              </div>
              <div className="mt-1 space-y-0.5">
                <div className="text-xs text-muted-foreground">Humidity: {currentView.humidity}%</div>
                <div className="text-xs text-muted-foreground">Wind: {currentView.wind} {currentView.windUnit}</div>
                {currentView.visibility != null && (
                  <div className="text-xs text-muted-foreground">Visibility: {currentView.visibility} {currentView.visUnit}</div>
                )}
              </div>
            </div>
          </div>

          {/* Right: label + day + condition */}
          <div className="text-right flex-shrink-0">
            <div className="flex items-center justify-end gap-1.5 mb-1">
              {offline && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">offline</span>}
              {revalidating && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">updating…</span>}
            </div>
            <div className="text-base font-semibold text-foreground">Weather</div>
            <div className="text-xs text-muted-foreground">{today}</div>
            <div className="text-xs text-muted-foreground">{currentView.conditions || '—'}</div>
            {(currentView.uv != null || currentView.sunrise || currentView.sunset) && (
              <div className="mt-1 space-y-0.5">
                {currentView.uv != null && <div className="text-[10px] text-muted-foreground">UV: {Math.round(currentView.uv)}</div>}
                {currentView.sunrise && <div className="text-[10px] text-muted-foreground">↑ {currentView.sunrise}</div>}
                {currentView.sunset && <div className="text-[10px] text-muted-foreground">↓ {currentView.sunset}</div>}
              </div>
            )}
          </div>
        </div>

        {/* 7-day forecast */}
        {days.length > 0 && (
          <div className="grid grid-cols-7 gap-1 border-t border-border pt-3">
            {days.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1 py-1" aria-label={`forecast-day-${i}`}>
                <div className="text-[10px] font-medium text-muted-foreground">{d.label}</div>
                {d.icon
                  ? <i className={`${d.icon} text-sm text-blue-400`} aria-label="day-icon" />
                  : <div className="h-4" />
                }
                <div className="text-[10px] text-foreground font-medium">{d.high}°</div>
                <div className="text-[10px] text-muted-foreground">{d.low}°</div>
              </div>
            ))}
          </div>
        )}

        {/* Tips */}
        {(weather?.advice || weather?.recommendations || []).length > 0 && (
          <ul className="border-t border-border pt-2 space-y-0.5" aria-label="advice-list">
            {(weather?.advice || weather?.recommendations || []).slice(0, 3).map((a, i) => (
              <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 items-start">
                <span className="text-amber-500 mt-0.5">•</span>{String(a)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
