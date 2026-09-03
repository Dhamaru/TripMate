import { Router } from "express";
import { optionalAuth } from "../middleware/auth";
import { apiProxyLimiter, placesPhotoLimiter } from "../middleware/rateLimit.middleware";
import { config } from "../config";

const router = Router();

router.use(apiProxyLimiter);
router.use(optionalAuth);

// Google's own JS SDK exposes API keys client-side too, but this key is
// unrestricted-by-referrer (used server-side for several other providers) —
// embedding it directly in imageUrl handed to an unauthenticated caller
// (live-confirmed: GET /search returns it in plain JSON) let anyone extract
// and reuse it against TripMate's billing account. Route photos through this
// server instead, same pattern as tools.controller.ts's getDestinationImage.
// placesPhotoLimiter on top of the router-wide apiProxyLimiter: this route
// makes one billed Google call per request on an unauthenticated path, so it
// gets its own tighter ceiling rather than sharing the general 60/min quota
// with cheap text-search requests.
router.get("/photo", placesPhotoLimiter, async (req, res) => {
  try {
    const ref = String(req.query.ref || "");
    if (!ref) return res.status(400).json({ error: "ref is required" });
    const key = config.GOOGLE_API_KEY;
    if (!key) return res.status(404).end();

    const upstream = await fetch(
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${encodeURIComponent(ref)}&key=${key}`,
      { redirect: "follow" },
    );
    if (!upstream.ok) return res.status(404).end();
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return res.status(404).end();

    const buffer = await upstream.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Places photo proxy error:", err);
    res.status(500).end();
  }
});

router.get("/search", async (req, res) => {
  try {
    const { query: queryParam, q, pageSize = 10, lat, lon, type } = req.query;
    const query = (queryParam || q) as string;
    if (!query) return res.status(400).json({ error: "Search query is required" });

    const key = config.GOOGLE_API_KEY;
    if (!key) {
      console.warn("[Places] GOOGLE_API_KEY is missing, returning empty results");
      return res.json({ items: [] });
    }

    const clampedPageSize = Math.min(Math.max(Number(pageSize) || 10, 1), 20);
    const latNum = Number(lat);
    const lonNum = Number(lon);
    const hasBias =
      lat !== undefined && lon !== undefined && !Number.isNaN(latNum) && !Number.isNaN(lonNum);

    // "city" (trip origin/destination pickers) used to append
    // `&type=locality` to Text Search below — verified against Google's
    // raw API that this does nothing: Text Search's `type` param doesn't
    // filter when a free-text query is present, so "Vijaya" still returned
    // Vijaya Super Speciality Hospital, Vijaya Dairy Parlour, etc. (live
    // production behavior, confirmed). Text Search also does full-text
    // relevance matching, not prefix matching — a real city-picker needs
    // Places Autocomplete instead (`types=(cities)` is properly enforced
    // there, and prefix-matches "Vijaya" -> Vijayawada/Vijayapura/etc,
    // verified against Google's raw endpoint). Every other picker in the
    // app (restaurants, activities, attractions) keeps Text Search below —
    // this branch is opt-in, not a global switch.
    if (type === "city") {
      const biasParam = hasBias ? `&location=${latNum},${lonNum}&radius=50000` : "";
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=(cities)${biasParam}&key=${key}`,
      );
      // Autocomplete has its own, tighter per-key quota than Text Search
      // and a CDN layer in front of it — an error response here (429/503)
      // can come back as plain text/HTML, not JSON. .json() on that
      // throws and surfaces as an unhandled 500 instead of the empty
      // result a search box should degrade to.
      if (!response.ok) {
        console.warn(`[Places] Google Autocomplete HTTP ${response.status}`);
        return res.json({ items: [] });
      }
      const data = await response.json().catch(() => ({}));
      if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error(
          `[Places] Google Autocomplete returned ${data.status}: ${data.error_message || "no message"}`,
        );
      }
      const results = (data.predictions || []).slice(0, clampedPageSize).map((p: any) => ({
        id: p.place_id,
        name: p.structured_formatting?.main_text || p.description,
        address: p.structured_formatting?.secondary_text,
        display_name: p.description,
      }));
      return res.json({ items: results });
    }

    // Optional proximity bias — Text Search doesn't restrict to a radius,
    // it just re-ranks toward the given point, which is exactly what we
    // want here: a search bar biased toward the user's real location or a
    // trip's destination should still surface a good match far away, just
    // rank the nearby one first when both are plausible. 50km keeps the
    // bias city-scale rather than pinpoint-scale.
    const biasParam = hasBias ? `&location=${latNum},${lonNum}&radius=50000` : "";

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query as string)}${biasParam}&key=${key}`,
    );
    const data = await response.json();

    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error(
        `[Places] Google API returned ${data.status}: ${data.error_message || "no message"}`,
      );
    }

    // Transform for frontend consumption if needed
    // Google Text Search caps at 20/page anyway, but clamp explicitly
    // rather than trust the caller's raw pageSize (NaN-safe: falls back to
    // the default when the query value doesn't parse).
    const results = (data.results || []).slice(0, clampedPageSize).map((p: any) => ({
      id: p.place_id,
      name: p.name,
      address: p.formatted_address,
      rating: p.rating,
      user_ratings_total: p.user_ratings_total,
      price_level: p.price_level,
      imageUrl: p.photos?.[0]
        ? `/api/v1/places/photo?ref=${encodeURIComponent(p.photos[0].photo_reference)}`
        : null,
      location: p.geometry.location,
      display_name: p.name || p.formatted_address,
    }));

    res.json({ items: results });
  } catch (err) {
    console.error("Places search error:", err);
    res.status(500).json({ error: "Failed to search places" });
  }
});

// Free-text tourism type from the client, interpolated into an Overpass QL
// query string — unescaped, this is a query-injection point (an attacker
// closes the ["tourism"="..."] filter early and appends arbitrary Overpass
// QL). Restrict to OSM's actual tourism=* value set instead of accepting
// anything.
const ALLOWED_TOURISM_TYPES = new Set([
  "attraction",
  "museum",
  "gallery",
  "viewpoint",
  "zoo",
  "theme_park",
  "artwork",
  "picnic_site",
  "camp_site",
  "hotel",
  "hostel",
  "guest_house",
  "information",
  "monument",
]);

router.get("/nearby", async (req, res) => {
  try {
    const { lat, lon, type = "attraction" } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "lat and lon are required" });
    const tourismType = ALLOWED_TOURISM_TYPES.has(String(type)) ? String(type) : "attraction";

    const overpassQuery = `[out:json][timeout:25];(node["tourism"="${tourismType}"](${Number(lat) - 0.05},${Number(lon) - 0.05},${Number(lat) + 0.05},${Number(lon) + 0.05}););out body;`;

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: overpassQuery,
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
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent("tourist attractions in " + String(location))}&key=${key}`,
    );
    const data = await response.json();

    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error(
        `[Places] Google API returned ${data.status}: ${data.error_message || "no message"}`,
      );
    }

    const clampedPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 20);
    const results = (data.results || []).slice(0, clampedPageSize);

    res.json({ items: results });
  } catch (err) {
    console.error("Attractions search error:", err);
    res.status(500).json({ error: "Failed to get attractions" });
  }
});

export default router;
