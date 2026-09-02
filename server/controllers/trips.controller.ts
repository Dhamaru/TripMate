import { Request, Response, NextFunction } from "express";
import { TripModel, UserModel, CrowdDensityModel, ICrowdDensity } from "@shared/schema";
import { AiUtilitiesService } from "../AiUtilitiesService";

import { BadRequestError, NotFoundError, ForbiddenError } from "../errors";
import { socketService } from "../services/SocketService";
import { config } from "../config";
import { insertTripSchema } from "@shared/schema";
import { nanoid } from "nanoid";

// AI-generated itineraries (planTrip pipeline) never assign an activity id —
// only the separate "Import My Plan" text parser does. Without an id, edit/
// delete requests hit PUT/DELETE /itinerary/activity/undefined and 404.
// Stamp one on every activity missing one before persisting.
function ensureActivityIds(itinerary: any): any {
  if (!Array.isArray(itinerary)) return itinerary;
  for (const day of itinerary) {
    if (!Array.isArray(day?.activities)) continue;
    for (const activity of day.activities) {
      if (activity && !activity.id) activity.id = nanoid();
    }
  }
  return itinerary;
}

export const createTrip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      console.error("[CreateTrip] Unauthorized attempt - req.user:", !!req.user);
      throw new ForbiddenError("Authentication required to save trips");
    }

    // Guest Limitation: Max 1 Trip
    const user = await UserModel.findById(userId);
    if (user?.isGuest) {
      const existingTripsCount = await TripModel.countDocuments({ userId });
      if (existingTripsCount >= 1) {
        throw new ForbiddenError("Guest limit reached: Max 1 trip allowed.");
      }
    }

    const tripData = insertTripSchema.parse({
      ...req.body,
      userId,
    });
    if (tripData.itinerary) ensureActivityIds(tripData.itinerary);

    const savedTrip = await TripModel.create(tripData);

    // Background Image Fetch
    setImmediate(() => fetchImageForTrip(savedTrip.id, savedTrip.destination));
    // Background coordinate backfill for AI-generated/imported activities
    // that never got geocoded — see backfillActivityCoords for why.
    setImmediate(() => backfillActivityCoords(savedTrip.id, savedTrip.destination));

    res.status(201).json(savedTrip);
  } catch (error) {
    next(error);
  }
};

export const getTrips = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const trips = await TripModel.find({
      $or: [{ userId }, { "collaborators.userId": userId }],
    }).sort({ createdAt: -1 });
    res.json(trips);
  } catch (error) {
    next(error);
  }
};

export const getTrip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const trip = await TripModel.findOne({
      _id: req.params.id,
      $or: [{ userId }, { "collaborators.userId": userId }],
    });
    if (!trip) throw new NotFoundError("Trip not found");

    // Self-heal trips saved before activity ids were stamped at creation.
    let missingIds = false;
    for (const day of trip.itinerary || []) {
      for (const activity of day.activities || []) {
        if (activity && !activity.id) {
          activity.id = nanoid();
          missingIds = true;
        }
      }
    }
    if (missingIds) {
      trip.markModified("itinerary");
      await trip.save();
    }

    // Backfill coordinates for trips created before backfillActivityCoords
    // existed (or whose itinerary was generated before this activity had
    // any coords to begin with) — same self-heal-on-read pattern as the
    // missing-id fix above. Atomic claim on the flag so concurrent views
    // of the same trip (multiple tabs, a fast refresh) can't both kick off
    // a duplicate background job.
    if (!trip.coordsBackfillAttempted) {
      const hasMissingCoords = (trip.itinerary || []).some((day: any) =>
        (day.activities || []).some(
          (act: any) => act && (act.lat == null || act.lon == null) && (act.location || act.title),
        ),
      );
      if (hasMissingCoords) {
        const claimed = await TripModel.updateOne(
          { _id: trip.id, coordsBackfillAttempted: { $ne: true } },
          { $set: { coordsBackfillAttempted: true } },
        );
        if (claimed.modifiedCount > 0) {
          setImmediate(() => backfillActivityCoords(String(trip.id), trip.destination));
        }
      }
    }

    res.json(trip);
  } catch (error) {
    next(error);
  }
};

// Trip fields an owner/editor is allowed to change through this route.
// Deliberately excludes userId (ownership), collaborators, shareId, and
// isPublic — those have their own owner-only endpoints (addCollaborator,
// removeCollaborator, shareTrip) and must not be settable by passing raw
// req.body through here, which previously let any editor collaborator
// reassign trip ownership to themselves or wipe out the collaborator list.
const UPDATABLE_TRIP_FIELDS = new Set([
  "origin",
  "destination",
  "imageUrl",
  "imageCaption",
  "currency",
  "budget",
  "days",
  "groupSize",
  "travelStyle",
  "transportMode",
  "isInternational",
  "status",
  "startDate",
  "endDate",
  "notes",
  "aiPlanMarkdown",
  "isDraft",
  "syncStatus",
  "costBreakdown",
]);

export const updateTrip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    // itinerary/expenses were removed from UPDATABLE_TRIP_FIELDS (see comment
    // above) — this route no longer touches either, so ensureActivityIds
    // on req.body.itinerary would be a no-op that misleadingly implied
    // otherwise. Use the dedicated /itinerary/* and /expenses/* endpoints,
    // which apply their own atomic-op/CAS concurrency protection.
    const updates = Object.fromEntries(
      Object.entries(req.body ?? {}).filter(([key]) => UPDATABLE_TRIP_FIELDS.has(key)),
    );
    const trip = await TripModel.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
      },
      { $set: updates },
      { new: true, runValidators: true },
    );
    if (!trip) throw new ForbiddenError("Trip not found or insufficient permissions");

    socketService.broadcastMutation(
      (trip as any)._id.toString(),
      { type: "trip-updated", data: trip },
      String(userId),
    );

    res.json(trip);
  } catch (error) {
    next(error);
  }
};

export const deleteTrip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const result = await TripModel.deleteOne({ _id: req.params.id, userId });
    if (result.deletedCount === 0) throw new NotFoundError("Trip not found");
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const shareTrip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { isPublic } = req.body;

    const updateData: any = { isPublic };

    if (isPublic) {
      const trip = await TripModel.findOne({ _id: req.params.id, userId });
      if (!trip) throw new NotFoundError("Trip not found");
      if (!trip.shareId) {
        updateData.shareId = nanoid(10);
      }
    }

    const trip = await TripModel.findOneAndUpdate({ _id: req.params.id, userId }, updateData, {
      new: true,
    });

    if (!trip) throw new NotFoundError("Trip not found");

    socketService.broadcastMutation(
      (trip as any)._id.toString(),
      { type: "trip-updated", data: trip },
      String(userId),
    );

    res.json(trip);
  } catch (error) {
    next(error);
  }
};

export const generateItinerary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const aiService = new AiUtilitiesService();
    const {
      origin,
      destination,
      days,
      persons,
      budget,
      currency,
      typeOfTrip,
      travelMedium,
      preferences,
    } = req.body;

    console.log(`[TripsController] Generating itinerary for ${destination} (${days} days)`);

    const plan = await aiService.planTrip({
      destination,
      days: Number(days),
      persons: Number(persons),
      budget: budget ? Number(budget) : undefined,
      currency,
      typeOfTrip,
      travelMedium,
    });

    res.json(plan);
  } catch (error) {
    console.error("[TripsController] generateItinerary Error:", error);
    next(error);
  }
};

export const getHacks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const trip = await TripModel.findOne({ _id: req.params.id, userId });
    if (!trip) throw new NotFoundError("Trip not found");

    const aiService = new AiUtilitiesService();
    const result = await aiService.getTravelHacks(trip.destination, trip.travelStyle);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getQuietPlaces = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const trip = await TripModel.findOne({ _id: req.params.id, userId });
    if (!trip) throw new NotFoundError("Trip not found");

    // Try to find coordinates for the destination to search nearby
    // We'll look at the first activity if available, or just search by destination name in a future enhancement
    let searchLat = 22.3072; // Default Vadodara
    let searchLon = 73.1812;

    if (trip.itinerary && trip.itinerary.length > 0) {
      const firstDay = trip.itinerary[0];
      if (firstDay.activities && firstDay.activities.length > 0) {
        const act = firstDay.activities.find((a) => a.lat && a.lon);
        if (act) {
          searchLat = act.lat!;
          searchLon = act.lon!;
        }
      }
    }

    // Search for low density spots (density < 4) within a ~10km radius (approx 0.1 degrees)
    const radius = 0.1;
    const reports = await CrowdDensityModel.find({
      latitude: { $gte: searchLat - radius, $lte: searchLat + radius },
      longitude: { $gte: searchLon - radius, $lte: searchLon + radius },
      density: { $lt: 4 },
      timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }).limit(5);

    if (reports.length > 0) {
      const spots = reports.map((r: ICrowdDensity) => ({
        name: r.placeId || "Quiet Scenic Spot",
        address: `Near ${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`,
        crowdLevel: r.density < 2 ? "Low" : "Minimal",
        type: "Outdoors",
        bestTime: "Morning",
        reason: "Real-time data indicates very low footfall in this area.",
      }));
      return res.json({ spots });
    }

    // No real-time crowd sensor data for this area — generate destination-specific suggestions
    const aiService = new AiUtilitiesService();
    const spots = await aiService.getQuietPlaceSuggestions(trip.destination);
    res.json({ spots });
  } catch (error) {
    next(error);
  }
};

export const forceUpdateImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const trip = await TripModel.findOne({ _id: req.params.id, userId });
    if (!trip) throw new NotFoundError("Trip not found");

    // Don't clear the existing image up front — fetchImageForTrip only
    // overwrites imageUrl/imageCaption if it actually finds a new one, so
    // a failed search (network blip, no results) no longer leaves the
    // trip with no image at all.
    const previousImageUrl = trip.imageUrl;
    const randomOffset = Math.floor(Math.random() * 5);
    // Wikipedia lookup is deterministic (same article, same thumbnail every
    // time), so on a *refresh* — as opposed to the first-ever fetch for a
    // trip with no image yet — skip it entirely, otherwise the "refresh"
    // silently re-fetches the identical photo and the offset below never
    // gets a chance to matter.
    await fetchImageForTrip(
      trip.id,
      trip.destination,
      randomOffset,
      /* skipWikipedia */ !!previousImageUrl,
    );

    const updated = await TripModel.findById(trip.id);
    const imageChanged = !!updated?.imageUrl && updated.imageUrl !== previousImageUrl;
    res.json({ ...updated?.toJSON(), imageChanged });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to fetch image from Google Places API
 */
async function fetchImageForTrip(
  tripId: string,
  destination: string,
  skipCount: number = 0,
  skipWikipedia: boolean = false,
) {
  try {
    if (!tripId) return;

    let imageUrl: string | null = null;
    let imageCaption: string | null = null;

    // 1. Wikipedia — article images are always the landmark itself, no people.
    // Deterministic (same title always returns the same thumbnail), so a
    // caller that's looking for a *different* photo skips this source.
    if (!skipWikipedia)
      try {
        const firstWord = destination.split(",")[0].trim();
        const wikiTitles = [...new Set([destination, firstWord])];
        for (const title of wikiTitles) {
          // pageimages prop returns the main article image (always the landmark, no people)
          const wikiRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=1200`,
            { headers: { "User-Agent": "TripMate/2.0.0 (kasivasl2005@gmail.com)" } },
          );
          const wikiData = await wikiRes.json();
          const pages = wikiData?.query?.pages || {};
          const page = Object.values(pages)[0] as any;
          if (page && page.pageid !== -1 && page.thumbnail?.source) {
            // Use the thumbnail URL MediaWiki returns as-is — it already honors
            // pithumbsize=1200 (capped to the source image's real size). Forcing
            // the width in the URL to a fixed "1200px-" via regex produces an
            // invalid thumbnail request that Wikimedia rejects with a 400 for
            // any image whose native/allowed size is smaller.
            imageUrl = page.thumbnail.source;
            imageCaption = page.title || firstWord;
            break;
          }
        }

        // If no direct match, try Wikipedia opensearch to find correct article title
        if (!imageUrl) {
          const searchRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(firstWord)}&limit=1&format=json`,
            { headers: { "User-Agent": "TripMate/2.0.0 (kasivasl2005@gmail.com)" } },
          );
          const searchData = await searchRes.json();
          const foundTitle = (searchData?.[1] as string[])?.[0];
          if (foundTitle) {
            const imgRes = await fetch(
              `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(foundTitle)}&prop=pageimages&format=json&pithumbsize=1200`,
              { headers: { "User-Agent": "TripMate/2.0.0 (kasivasl2005@gmail.com)" } },
            );
            const imgData = await imgRes.json();
            const pages2 = imgData?.query?.pages || {};
            const page2 = Object.values(pages2)[0] as any;
            if (page2 && page2.pageid !== -1 && page2.thumbnail?.source) {
              imageUrl = page2.thumbnail.source;
              imageCaption = page2.title || firstWord;
            }
          }
        }
      } catch {
        /* ignore, try next source */
      }

    // 2. Google Places — search specifically for tourist attractions (no generic city queries)
    const key = config.GOOGLE_API_KEY;
    if (!imageUrl && key) {
      const queries = [
        `${destination} tourist attraction landmark`,
        `${destination} temple fort palace heritage site`,
        `${destination} national park scenic viewpoint`,
        `${destination} famous monument`,
      ];

      outer: for (const q of queries) {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&type=tourist_attraction&key=${key}`,
        );
        const data = await res.json();
        const results: any[] = data.results || [];
        // Try skipCount offset first, then all others
        const indices = [...Array(results.length).keys()].sort((a, b) => {
          if (a === skipCount) return -1;
          if (b === skipCount) return 1;
          return a - b;
        });
        for (const i of indices) {
          const place = results[i];
          // Try multiple photo_references per place for variety
          const photos: any[] = place?.photos || [];
          const photoRef =
            photos[skipCount % Math.max(photos.length, 1)]?.photo_reference ||
            photos[0]?.photo_reference;
          if (photoRef) {
            // Stored directly on the Trip document (persisted,
            // served on every future read of this trip) — a raw
            // Google URL here means GOOGLE_API_KEY leaks forever,
            // not just for the one response that generated it.
            // Same proxy already used for /places/search photos.
            imageUrl = `/api/v1/places/photo?ref=${encodeURIComponent(photoRef)}`;
            imageCaption = place.name || destination;
            break outer;
          }
        }
      }
    }

    if (imageUrl) {
      const updated = await TripModel.findByIdAndUpdate(
        tripId,
        {
          imageUrl,
          imageCaption,
        },
        { new: true },
      );

      if (updated) {
        socketService.broadcastMutation(tripId, { type: "trip-updated", data: updated });
      }
    }
  } catch (err) {
    console.error(`[fetchImageForTrip] Failed for trip ${tripId}:`, err);
  }
}

// AI-generated itineraries (planTrip pipeline / multi-agent orchestrator)
// never geocode individual activities — only a place's name/address text
// comes back, no lat/lon. "View on Map" (and the marker on the Map tab)
// has nothing to show for those, only for activities added through a place
// picker (map search, ActivityFormDialog) that already carries coordinates.
// Backfills the rest the same way fetchImageForTrip enriches the trip after
// creation: fire-and-forget in the background (a full itinerary can have
// 20-30+ activities, and Nominatim's usage policy caps the free public
// instance at ~1 req/sec — geocoding inline would make trip creation take
// tens of seconds), one broadcastMutation once done so an already-open trip
// page picks it up live instead of needing a manual refresh.
async function backfillActivityCoords(tripId: string, destination: string) {
  try {
    if (!tripId) return;
    const trip = await TripModel.findById(tripId);
    if (!trip || !Array.isArray(trip.itinerary)) return;

    const missing: any[] = [];
    for (const day of trip.itinerary as any[]) {
      if (!Array.isArray(day?.activities)) continue;
      for (const act of day.activities) {
        if (act && (act.lat == null || act.lon == null) && (act.location || act.title)) {
          missing.push(act);
        }
      }
    }
    if (missing.length === 0) {
      await TripModel.updateOne({ _id: tripId }, { $set: { coordsBackfillAttempted: true } });
      return;
    }

    for (const act of missing) {
      try {
        const query = `${act.location || act.title}, ${destination}`;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
          { headers: { "User-Agent": "TripMate/2.0.0 (kasivasl2005@gmail.com)" } },
        );
        if (res.ok) {
          const results = await res.json();
          if (Array.isArray(results) && results.length > 0) {
            const lat = Number(results[0].lat);
            const lon = Number(results[0].lon);
            if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
              act.lat = lat;
              act.lon = lon;
            }
          }
        }
      } catch {
        // Leave this one activity without coordinates — View on Map simply
        // won't render for it, same graceful degradation as any activity
        // that never had a resolvable location. Not fatal to the batch.
      }
      await new Promise((r) => setTimeout(r, 1100));
    }

    trip.markModified("itinerary");
    trip.coordsBackfillAttempted = true;
    const updated = await trip.save();
    socketService.broadcastMutation(tripId, { type: "trip-updated", data: updated });
  } catch (err) {
    console.error(`[backfillActivityCoords] Failed for trip ${tripId}:`, err);
  }
}

const CATEGORY_QUERY_TERMS: Record<string, string> = {
  hotels: "hotels",
  restaurants: "restaurants",
  "tourist-spots": "tourist attractions",
};

function mapGooglePlace(p: any, _key: string, category?: string) {
  return {
    id: p.place_id,
    name: p.name,
    address: p.formatted_address,
    rating: p.rating,
    // Was embedding the raw GOOGLE_API_KEY directly in every photo URL
    // handed to the client (live-confirmed in production) — same class
    // of leak already fixed on /places/search, just missed here. Route
    // through the same same-origin proxy instead.
    photos: (p.photos || [])
      .slice(0, 3)
      .map((photo: any) => `/api/v1/places/photo?ref=${encodeURIComponent(photo.photo_reference)}`),
    location: p.geometry?.location
      ? { lat: p.geometry.location.lat, lng: p.geometry.location.lng }
      : undefined,
    priceLevel: p.price_level,
    category,
  };
}

async function searchGooglePlaces(query: string, key: string) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`,
  );
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

export const discoverPlaces = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: tripId } = req.params;
    const userId = req.user?._id || req.user?.id;
    const { category, query } = req.body as { category?: string; query?: string };

    const trip = await TripModel.findOne({
      _id: tripId,
      $or: [{ userId }, { "collaborators.userId": userId }],
    });
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    const key = config.GOOGLE_API_KEY;
    if (!key) return res.json({ places: [] });

    const term = CATEGORY_QUERY_TERMS[category || ""] || "places to visit";
    const searchQuery = query
      ? `${query} in ${trip.destination}`
      : `${term} in ${trip.destination}`;
    const results = await searchGooglePlaces(searchQuery, key);

    res.json({ places: results.slice(0, 20).map((p: any) => mapGooglePlace(p, key, category)) });
  } catch (error) {
    next(error);
  }
};

export const getAiRecommendations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: tripId } = req.params;
    const userId = req.user?._id || req.user?.id;
    const { category } = req.body as { category?: string };

    const trip = await TripModel.findOne({
      _id: tripId,
      $or: [{ userId }, { "collaborators.userId": userId }],
    });
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    const key = config.GOOGLE_API_KEY;
    if (!key) return res.json({ recommendations: [] });

    const term = CATEGORY_QUERY_TERMS[category || ""] || "places to visit";
    const searchQuery = `best ${term} in ${trip.destination} for a ${trip.travelStyle || "standard"} trip`;
    const results = await searchGooglePlaces(searchQuery, key);

    res.json({
      recommendations: results.slice(0, 10).map((p: any) => mapGooglePlace(p, key, category)),
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicTrip = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shareId } = req.params;
    const trip = await TripModel.findOne({ shareId, isPublic: true });
    if (!trip) throw new NotFoundError("Public trip not found");
    res.json(trip);
  } catch (error) {
    next(error);
  }
};

export const parseSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scheduleText, startDate, groupSize, budget, currency } = req.body;
    if (!scheduleText || typeof scheduleText !== "string" || scheduleText.trim().length < 10) {
      throw new BadRequestError("scheduleText is required and must be at least 10 characters.");
    }
    const aiService = new AiUtilitiesService();
    const result = await aiService.parseSchedule({
      scheduleText: scheduleText.slice(0, 3000),
      startDate,
      groupSize: groupSize ? Number(groupSize) : 1,
      budget: budget ? Number(budget) : undefined,
      currency: currency || "INR",
    });
    res.json(result);
  } catch (error) {
    console.error("[TripsController] parseSchedule Error:", error);
    next(error);
  }
};

export const getBudgetForecast = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const trip = await TripModel.findOne({
      _id: req.params.id,
      $or: [{ userId }, { "collaborators.userId": userId }],
    });
    if (!trip) throw new NotFoundError("Trip not found");

    const aiService = new AiUtilitiesService();
    const forecast = await aiService.getBudgetForecast(trip);
    res.json(forecast);
  } catch (error) {
    next(error);
  }
};
