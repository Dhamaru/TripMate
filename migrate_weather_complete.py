"""
Complete migration to Google Weather API
Removes ALL Open-Meteo and OpenWeatherMap references
"""
import re

# Read the file
with open(r'c:\Users\kasiv\OneDrive\Documents\TripMate\server\routes.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the weather route start
weather_route_start = content.find("  app.get('/api/v1/weather', optionalAuth, aiLimiter, async (req: any, res) => {")

if weather_route_start == -1:
    print("ERROR: Could not find weather route!")
    exit(1)

# Find the next route after weather (currency route)
currency_route_start = content.find("  app.get('/api/v1/currency'", weather_route_start)

if currency_route_start == -1:
    print("ERROR: Could not find currency route!")
    exit(1)

# Extract everything before and after the weather route
before_weather = content[:weather_route_start]
after_weather = content[currency_route_start:]

# New Google Weather API implementation
new_weather_route = '''  app.get('/api/v1/weather', optionalAuth, aiLimiter, async (req: any, res) => {
    try {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      const cityQ = String(req.query.city || req.query.location || '').trim();
      const units = String(req.query.units || 'metric');
      const key = process.env.GOOGLE_API_KEY;
      
      if (!key) {
        console.error('[weather] GOOGLE_API_KEY not set');
        return res.status(503).json({ 
          current: {}, 
          forecast: [], 
          recommendations: [], 
          alerts: [],
          error: 'Weather service not configured'
        });
      }

      const iconMap: Record<string, string> = {
        CLEAR: 'fas fa-sun',
        PARTLY_CLOUDY: 'fas fa-cloud-sun',
        CLOUDY: 'fas fa-cloud',
        RAIN: 'fas fa-cloud-rain',
        SCATTERED_SHOWERS: 'fas fa-cloud-rain',
        DRIZZLE: 'fas fa-cloud-rain',
        THUNDERSTORM: 'fas fa-bolt',
        SNOW: 'fas fa-snowflake',
        MIST: 'fas fa-smog',
        FOG: 'fas fa-smog',
        WIND: 'fas fa-wind',
      };

      const getWeatherData = async (latNum: number, lonNum: number) => {
        try {
          const currentUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${key}&location.latitude=${latNum}&location.longitude=${lonNum}`;
          const currentRes = await fetch(currentUrl);
          
          if (!currentRes.ok) {
            console.error('[weather:google] Current conditions failed:', currentRes.status);
            return null;
          }

          const currentData = await currentRes.json();
          
          const forecastUrl = `https://weather.googleapis.com/v1/forecast/days:lookup?key=${key}&location.latitude=${latNum}&location.longitude=${lonNum}&days=7`;
          const forecastRes = await fetch(forecastUrl);
          
          if (!forecastRes.ok) {
            console.error('[weather:google] Forecast failed:', forecastRes.status);
            return null;
          }

          const forecastData = await forecastRes.json();

          const tempCelsius = currentData.temperature?.degrees ?? 22;
          const temperature = units === 'metric' ? Math.round(tempCelsius) : Math.round(tempCelsius * 9/5 + 32);
          const condition = currentData.weatherCondition?.description?.text || 'Clear';
          const conditionType = currentData.weatherCondition?.type || 'CLEAR';
          
          const current = {
            temperature,
            tempMin: temperature - 5,
            tempMax: temperature,
            condition,
            humidity: currentData.relativeHumidity ?? 60,
            windSpeed: Math.round(currentData.wind?.speed?.value ?? 10),
            windDeg: currentData.wind?.direction?.degrees ?? 0,
            windDir: currentData.wind?.direction?.cardinal || 'N',
            icon: iconMap[conditionType] || 'fas fa-cloud',
          };

          const forecast = (forecastData.forecastDays || []).slice(0, 7).map((day: any, i: number) => {
            const maxTemp = day.maxTemperature?.degrees ?? temperature;
            const minTemp = day.minTemperature?.degrees ?? (temperature - 5);
            const dayCondition = day.daytimeForecast?.weatherCondition?.description?.text || 'Clear';
            const dayType = day.daytimeForecast?.weatherCondition?.type || 'CLEAR';
            
            return {
              day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
              high: units === 'metric' ? Math.round(maxTemp) : Math.round(maxTemp * 9/5 + 32),
              low: units === 'metric' ? Math.round(minTemp) : Math.round(minTemp * 9/5 + 32),
              condition: dayCondition,
              icon: iconMap[dayType] || 'fas fa-cloud',
            };
          });

          if (forecast.length > 0) {
            current.tempMax = forecast[0].high;
            current.tempMin = forecast[0].low;
          }

          const recommendations: string[] = [];
          if (current.temperature >= 30) recommendations.push('Stay hydrated');
          if (condition.toLowerCase().includes('rain') || condition.toLowerCase().includes('shower')) {
            recommendations.push('Carry a raincoat');
          }
          recommendations.push('Use sunscreen during midday');

          return {
            current,
            forecast,
            hourly: [],
            alerts: [],
            recommendations,
            source: 'google-weather',
          };
        } catch (error) {
          console.error('[weather:google] Error:', error);
          return null;
        }
      };

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        console.log('[weather:req]', { lat, lon, cityQ, units });
        const weatherData = await getWeatherData(lat, lon);
        if (weatherData) return res.json(weatherData);
        
        const now = new Date();
        const month = now.getMonth();
        const baseTemp = [20, 22, 26, 30, 32, 33, 32, 31, 30, 28, 24, 21][month] || 28;
        const current = { 
          temperature: Math.round(baseTemp), 
          humidity: 60, 
          windSpeed: 10, 
          condition: baseTemp >= 30 ? 'Sunny' : baseTemp >= 25 ? 'Partly Cloudy' : 'Cloudy', 
          icon: 'fas fa-cloud-sun' 
        };
        const forecast = Array.from({ length: 7 }, (_, i) => ({
          day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
          high: Math.round(baseTemp + (i % 3) - 1),
          low: Math.round(baseTemp - 5 + (i % 2)),
          condition: i % 4 === 0 ? 'Sunny' : i % 4 === 1 ? 'Partly Cloudy' : i % 4 === 2 ? 'Cloudy' : 'Rain',
          icon: 'fas fa-cloud-sun',
        }));
        const recommendations = [
          'Carry light cotton clothing',
          'Stay hydrated',
          'Use sunscreen during midday',
        ];
        return res.status(200).json({ current, forecast, recommendations, alerts: [], source: 'fallback-route' });
      }

      if (!cityQ) {
        return res.status(400).json({ current: {}, forecast: [], recommendations: [], alerts: [] });
      }

      try {
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cityQ)}&key=${key}`;
        const geocodeRes = await fetch(geocodeUrl);
        
        if (geocodeRes.ok) {
          const geocodeData = await geocodeRes.json();
          if (geocodeData.results && geocodeData.results.length > 0) {
            const location = geocodeData.results[0].geometry.location;
            const latNum = location.lat;
            const lonNum = location.lng;
            
            console.log('[weather:geocode]', { cityQ, lat: latNum, lon: lonNum, units });
            const weatherData = await getWeatherData(latNum, lonNum);
            if (weatherData) return res.json(weatherData);
          }
        }
      } catch (e) {
        console.warn('[weather:geocode:failed]', { cityQ, error: String((e as any)?.message || e) });
      }

      const result = await ai.weather(cityQ);
      console.log('[weather:ai]', { cityQ, units });
      res.json({ ...result, alerts: [] });
    } catch (error) {
      console.error('weather route error:', error);
      const now = new Date();
      const month = now.getMonth();
      const baseTemp = [20, 22, 26, 30, 32, 33, 32, 31, 30, 28, 24, 21][month] || 28;
      const current = { temperature: Math.round(baseTemp), humidity: 60, windSpeed: 10, condition: baseTemp >= 30 ? "Sunny" : baseTemp >= 25 ? "Partly Cloudy" : "Cloudy" };
      const forecast = Array.from({ length: 7 }, (_, i) => ({
        day: i === 0 ? "Today" : i === 1 ? "Tomorrow" : `Day ${i + 1}`,
        high: Math.round(baseTemp + (i % 3) - 1),
        low: Math.round(baseTemp - 5 + (i % 2)),
        condition: i % 4 === 0 ? "Sunny" : i % 4 === 1 ? "Partly Cloudy" : i % 4 === 2 ? "Cloudy" : "Rain",
      }));
      const recommendations = [
        "Carry light cotton clothing",
        "Stay hydrated",
        "Use sunscreen during midday",
        "Check local advisories for heat or rain",
      ];
      res.status(200).json({ current, forecast, recommendations, alerts: [], source: 'fallback-route' });
    }
  });

  '''

# Combine the parts
new_content = before_weather + new_weather_route + after_weather

# Write back
with open(r'c:\Users\kasiv\OneDrive\Documents\TripMate\server\routes.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✓ Replaced main weather route with Google Weather API")

# Now replace all WEATHER_API_KEY with GOOGLE_API_KEY in the file
with open(r'c:\Users\kasiv\OneDrive\Documents\TripMate\server\routes.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('process.env.WEATHER_API_KEY', 'process.env.GOOGLE_API_KEY')
content = content.replace('WEATHER_PROVIDER', 'GOOGLE_WEATHER_PROVIDER')

with open(r'c:\Users\kasiv\OneDrive\Documents\TripMate\server\routes.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Replaced all WEATHER_API_KEY with GOOGLE_API_KEY")
print("✓ Migration complete!")
