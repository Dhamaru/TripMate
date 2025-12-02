import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";

type BackendWeather = {
  current?: { temperature?: number; conditions?: string; condition?: string; humidity?: number; wind_kph?: number; windSpeed?: number; icon?: string; feels_like?: number };
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
  const [unit, setUnit] = useState<Unit>(() => (localStorage.getItem(UNIT_KEY) === "F" ? "F" : "C"));
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
      if (typeof console !== 'undefined') console.log(`[weather:card:request] ${url}`);
      const res = await apiRequest('GET', url);
      const j = await res.json();
      if (typeof console !== 'undefined') console.log(`[weather:card:response] source=${String(j?.source || '')} forecast=${Array.isArray(j?.forecast) ? j.forecast.length : 0}`);
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
    const windKph = Number(c.wind_kph ?? (weather?.current?.windSpeed ?? 0));
    const cond = String(c.conditions ?? (c.condition ?? ''));
    const icon = String(c.icon ?? '');
    const humidity = Number(c.humidity ?? 0);
    return {
      temperature: unit === 'C' ? tempC : toF(tempC),
      feelsLike: unit === 'C' ? feelsC : toF(feelsC),
      wind: unit === 'C' ? windKph : kmhToMph(windKph),
      windUnit: unit === 'C' ? 'km/h' : 'mph',
      conditions: cond,
      icon,
      humidity,
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
      <Card className="bg-ios-card border-ios-gray" role="region" aria-label="Weather" data-testid="weather-card-empty">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ios-gray">No destination set — add a destination to view weather</p>
          <div className="mt-2">
            <Button className="bg-ios-blue hover:bg-blue-600">Edit Trip</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading && !weather) {
    return (
      <Card className="bg-ios-card border-ios-gray" role="region" aria-label="Weather loading" data-testid="weather-card-loading">
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
      <Card className="bg-ios-card border-ios-gray" role="region" aria-label="Weather error" data-testid="weather-card-error">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ios-gray">Unable to load weather data</p>
          <p className="text-xs text-ios-gray mt-1">{error}</p>
          <div className="mt-3"><Button onClick={() => revalidate()} className="bg-ios-blue hover:bg-blue-600">Retry</Button></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-ios-card border-ios-gray" role="region" aria-label="Weather" data-testid="weather-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold text-white">Weather</CardTitle>
          <div className="flex items-center gap-2">
            {offline && (
              <span className="text-xs px-2 py-1 rounded bg-ios-darker border border-ios-gray text-ios-gray" aria-label="offline-badge">offline</span>
            )}
            {revalidating && (
              <span className="text-xs px-2 py-1 rounded bg-ios-darker border border-ios-gray text-ios-gray" aria-label="revalidating-badge">updating…</span>
            )}
            <Button variant="outline" className="bg-ios-darker border-ios-gray text-white hover:bg-ios-card px-2 py-1 text-xs" onClick={toggleUnit} aria-label="Toggle units">°{unit}</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-3xl font-bold text-white" aria-label="current-temperature">{currentView.temperature}°{unit}</div>
            <div className="text-sm text-ios-gray" aria-label="current-conditions">{currentView.conditions || '—'}</div>
            <div className="text-xs text-ios-gray mt-1" aria-label="current-details">feels like {currentView.feelsLike}°{unit} • humidity {currentView.humidity}% • wind {currentView.wind} {currentView.windUnit}</div>
          </div>
          {currentView.icon && (
            <i className={`${currentView.icon} text-ios-blue text-3xl`} aria-label="weather-icon"></i>
          )}
        </div>
        {days.length > 0 && (
          <div className="grid grid-cols-7 gap-2 text-center">
            {days.map((d, i) => (
              <div key={i} className="rounded-xl bg-ios-darker p-2" aria-label={`forecast-day-${i}`}>
                <div className="text-xs text-ios-gray">{d.label}</div>
                {d.icon && <i className={`${d.icon} text-ios-blue text-base`} aria-label="day-icon"></i>}
                <div className="text-xs text-white">{d.high} / {d.low}°{unit}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <ul className="list-disc ml-6 text-xs text-ios-gray" aria-label="advice-list">
            {(weather?.advice || weather?.recommendations || []).slice(0, 4).map((a, i) => (
              <li key={i}>{String(a)}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
