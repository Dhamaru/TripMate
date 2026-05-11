import { Router } from "express";
import { weatherHandler } from "../agent/tools/handlers/weatherHandler";
import { optionalAuth } from "../middleware/auth";

const router = Router();

router.get("/", optionalAuth, async (req, res) => {
    try {
        const { location, city, lat, lon, units } = req.query;
        let locString = location || city;
        if (!locString && lat && lon) {
            locString = `${lat},${lon}`;
        }
        if (!locString) {
            return res.status(400).json({ error: "Missing location parameter" });
        }
        
        const result = await weatherHandler({ 
            location: locString as string, 
            units: (units as string) || 'metric' 
        });
        
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }
        
        res.json(result.data);
    } catch (err) {
        console.error("Weather route error:", err);
        res.status(500).json({ error: "Failed to fetch weather data" });
    }
});

router.get("/forecast", optionalAuth, async (req, res) => {
    try {
        const { lat, lon, city } = req.query;
        let latitude = lat;
        let longitude = lon;

        if (city && (!lat || !lon)) {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city as string)}&count=1`);
            const geoData = await geoRes.json();
            if (geoData.results?.length > 0) {
                latitude = geoData.results[0].latitude;
                longitude = geoData.results[0].longitude;
            }
        }

        if (!latitude || !longitude) {
            return res.status(400).json({ error: "Missing location coordinates" });
        }

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (err) {
        console.error("Weather proxy error:", err);
        res.status(500).json({ error: "Failed to fetch weather data" });
    }
});

export default router;
