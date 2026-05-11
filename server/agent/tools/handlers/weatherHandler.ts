// Weather Handler — Open-Meteo (free, no API key)

import type { ToolResult } from '../../types';
import { cacheService, CACHE_TTL } from '../../../cache';

interface WeatherData {
    avgHighTemp: number;
    avgLowTemp: number;
    precipitationChance: number;
    conditionsSummary: string;
    packingFlag: string;
    current: {
        temperature: number;
        humidity: number;
        windSpeed: number;
        condition: string;
    };
    forecast: Array<{
        date: string;
        high: number;
        low: number;
        precipitationChance: number;
        condition: string;
    }>;
}

async function geocodeLocation(location: string): Promise<{ lat: number; lon: number; name: string } | null> {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.results || data.results.length === 0) return null;
        const r = data.results[0];
        return { lat: r.latitude, lon: r.longitude, name: r.name || location };
    } catch {
        return null;
    }
}

function mapWeatherCode(code: number): string {
    if (code === 0) return 'Clear sky';
    if (code <= 3) return 'Partly cloudy';
    if (code <= 48) return 'Foggy';
    if (code <= 55) return 'Drizzle';
    if (code <= 65) return 'Rain';
    if (code <= 67) return 'Freezing rain';
    if (code <= 75) return 'Snowfall';
    if (code <= 77) return 'Snow grains';
    if (code <= 82) return 'Rain showers';
    if (code <= 86) return 'Snow showers';
    if (code >= 95) return 'Thunderstorm';
    return 'Unknown';
}

function derivePackingFlag(avgHigh: number, precipChance: number): string {
    const flags: string[] = [];
    if (avgHigh >= 30) flags.push('HOT');
    else if (avgHigh >= 20) flags.push('WARM');
    else if (avgHigh >= 10) flags.push('COOL');
    else flags.push('COLD');

    if (precipChance > 50) flags.push('RAINY');
    else if (precipChance > 20) flags.push('CHANCE_OF_RAIN');

    return flags.join(' | ');
}

export async function weatherHandler(args: { location: string; units?: string }): Promise<ToolResult> {
    const start = Date.now();
    try {
        const cacheKey = `weather:${args.location.toLowerCase()}:${args.units ?? 'metric'}`;
        const cached = cacheService.get<WeatherData>(cacheKey);
        if (cached) {
            return { success: true, data: cached, durationMs: 0 };
        }

        let geo: { lat: number, lon: number, name: string } | null = null;
        
        // Check if location is already coordinates (lat,lon)
        const coordMatch = args.location.match(/^([-+]?\d+(\.\d+)?)\s*,\s*([-+]?\d+(\.\d+)?)$/);
        if (coordMatch) {
            geo = { 
                lat: parseFloat(coordMatch[1]), 
                lon: parseFloat(coordMatch[3]), 
                name: args.location 
            };
        } else {
            geo = await geocodeLocation(args.location);
        }

        if (!geo) {
            return { success: false, error: `Could not geocode location: ${args.location}`, durationMs: Date.now() - start };
        }

        const isImperial = args.units === 'imperial';
        const tempUnit = isImperial ? 'fahrenheit' : 'celsius';
        const windUnit = isImperial ? 'mph' : 'kmh';

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}`;

        const res = await fetch(url);
        if (!res.ok) {
            return { success: false, error: `Open-Meteo API error: ${res.status}`, durationMs: Date.now() - start };
        }

        const data = await res.json();
        const current = data.current || {};
        const daily = data.daily || {};

        const forecast = (daily.time || []).slice(0, 7).map((date: string, i: number) => ({
            date,
            high: Math.round(daily.temperature_2m_max?.[i] ?? 0),
            low: Math.round(daily.temperature_2m_min?.[i] ?? 0),
            precipitationChance: daily.precipitation_probability_max?.[i] ?? 0,
            condition: mapWeatherCode(daily.weather_code?.[i] ?? 0),
        }));

        const highs = forecast.length > 0 ? forecast.map((f: { high: number }) => f.high) : [0];
        const lows = forecast.length > 0 ? forecast.map((f: { low: number }) => f.low) : [0];
        const precipChances = forecast.length > 0 ? forecast.map((f: { precipitationChance: number }) => f.precipitationChance) : [0];

        const avgHighTemp = Math.round(highs.reduce((a: number, b: number) => a + b, 0) / highs.length);
        const avgLowTemp = Math.round(lows.reduce((a: number, b: number) => a + b, 0) / lows.length);
        const precipitationChance = Math.round(precipChances.reduce((a: number, b: number) => a + b, 0) / (precipChances.length || 1));

        const conditions = forecast.map((f: { condition: string }) => f.condition);
        const conditionCounts = conditions.reduce((acc: Record<string, number>, c: string) => {
            acc[c] = (acc[c] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const conditionsSummary = Object.entries(conditionCounts)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([c]) => c)
            .join(', ') || 'Unknown';

        const result: WeatherData = {
            avgHighTemp,
            avgLowTemp,
            precipitationChance,
            conditionsSummary,
            packingFlag: derivePackingFlag(avgHighTemp, precipitationChance),
            current: {
                temperature: Math.round(current.temperature_2m ?? 0),
                humidity: current.relative_humidity_2m ?? 0,
                windSpeed: Math.round(current.wind_speed_10m ?? 0),
                condition: mapWeatherCode(current.weather_code ?? 0),
            },
            forecast,
        };

        cacheService.set(cacheKey, result, CACHE_TTL.WEATHER);
        return { success: true, data: result, durationMs: Date.now() - start };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Weather fetch failed', durationMs: Date.now() - start };
    }
}
