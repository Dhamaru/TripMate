import { Router } from "express";
import { optionalAuth } from "../middleware/auth";
import { apiProxyLimiter } from "../middleware/rateLimit.middleware";
import { config } from "../config";

const router = Router();

router.use(apiProxyLimiter);
router.use(optionalAuth);

router.get("/search", async (req, res) => {
    try {
        const { query: queryParam, q, pageSize = 10 } = req.query;
        const query = (queryParam || q) as string;
        if (!query) return res.status(400).json({ error: "Search query is required" });

        const key = config.GOOGLE_API_KEY;
        if (!key) {
            console.warn("[Places] GOOGLE_API_KEY is missing, returning empty results");
            return res.json({ items: [] });
        }

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query as string)}&key=${key}`
        );
        const data = await response.json();
        
        // Transform for frontend consumption if needed
        const results = (data.results || []).slice(0, Number(pageSize)).map((p: any) => ({
            id: p.place_id,
            name: p.name,
            address: p.formatted_address,
            rating: p.rating,
            user_ratings_total: p.user_ratings_total,
            price_level: p.price_level,
            imageUrl: p.photos?.[0] ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photos[0].photo_reference}&key=${key}` : null,
            location: p.geometry.location,
            display_name: p.name || p.formatted_address
        }));

        res.json({ items: results });
    } catch (err) {
        console.error("Places search error:", err);
        res.status(500).json({ error: "Failed to search places" });
    }
});

router.get("/nearby", async (req, res) => {
    try {
        const { lat, lon, type = 'attraction' } = req.query;
        if (!lat || !lon) return res.status(400).json({ error: "lat and lon are required" });

        const overpassQuery = `[out:json][timeout:25];(node["tourism"="${type}"](${Number(lat)-0.05},${Number(lon)-0.05},${Number(lat)+0.05},${Number(lon)+0.05}););out body;`;

        const response = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: overpassQuery
        });

        if (!response.ok) throw new Error("Overpass API failed");
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Overpass nearby error:", err);
        res.status(500).json({ error: "Failed to fetch nearby places" });
    }
});

router.get("/tourist-attractions", async (req, res) => {
    try {
        const { location, pageSize = 20 } = req.query;
        if (!location) return res.status(400).json({ error: "Location is required" });

        const key = config.GOOGLE_API_KEY;
        if (!key) return res.json({ results: [] });

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent('tourist attractions in ' + String(location))}&key=${key}`
        );
        const data = await response.json();
        const results = (data.results || []).slice(0, Number(pageSize));

        res.json({ items: results });
    } catch (err) {
        console.error("Attractions search error:", err);
        res.status(500).json({ error: "Failed to get attractions" });
    }
});

export default router;
