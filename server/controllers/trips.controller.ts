import { Request, Response, NextFunction } from "express";
import { TripModel, UserModel, CrowdDensityModel, ICrowdDensity } from "@shared/schema";
import { AiUtilitiesService } from "../AiUtilitiesService";

import { BadRequestError, NotFoundError, ForbiddenError } from "../errors";
import { socketService } from "../services/SocketService";
import { config } from "../config";
import { insertTripSchema } from "@shared/schema";
import { nanoid } from "nanoid";

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

        const savedTrip = await TripModel.create(tripData);

        // Background Image Fetch
        setImmediate(() => fetchImageForTrip(savedTrip.id, savedTrip.destination));

        res.status(201).json(savedTrip);
    } catch (error) {
        next(error);
    }
};

export const getTrips = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const trips = await TripModel.find({
            $or: [
                { userId },
                { "collaborators.userId": userId }
            ]
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
            $or: [
                { userId },
                { "collaborators.userId": userId }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found");
        res.json(trip);
    } catch (error) {
        next(error);
    }
};

export const updateTrip = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const trip = await TripModel.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [
                    { userId },
                    { collaborators: { $elemMatch: { userId, role: "editor" } } }
                ]
            },
            req.body,
            { new: true }
        );
        if (!trip) throw new ForbiddenError("Trip not found or insufficient permissions");
        
        socketService.broadcastMutation((trip as any)._id.toString(), { type: "trip-updated", data: trip });
        
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

        const trip = await TripModel.findOneAndUpdate(
            { _id: req.params.id, userId },
            updateData,
            { new: true }
        );
        
        if (!trip) throw new NotFoundError("Trip not found");

        socketService.broadcastMutation((trip as any)._id.toString(), { type: "trip-updated", data: trip });

        res.json(trip);
    } catch (error) {
        next(error);
    }
};

export const generateItinerary = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const aiService = new AiUtilitiesService();
        const { origin, destination, days, persons, budget, currency, typeOfTrip, travelMedium, preferences } = req.body;
        
        console.log(`[TripsController] Generating itinerary for ${destination} (${days} days)`);
        
        const plan = await aiService.planTrip({
            destination,
            days: Number(days),
            persons: Number(persons),
            budget: budget ? Number(budget) : undefined,
            currency,
            typeOfTrip,
            travelMedium
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
        
        // Simulating AI result for now - properly implemented in AiUtilities
        res.json({
            hacks: [
                "Pack light to save on domestic transit",
                "Use local e-SIMs for cheaper connectivity",
                "Carry a portable power bank for long explorations"
            ],
            economicalAlternatives: [
                "Try local street food for authentic and cheap meals",
                "Use public transport (buses/trains) instead of taxis"
            ]
        });
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
                const act = firstDay.activities.find(a => a.lat && a.lon);
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
            timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }).limit(5);

        if (reports.length > 0) {
            const spots = reports.map((r: ICrowdDensity) => ({
                name: r.placeId || "Quiet Scenic Spot",
                address: `Near ${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`,
                crowdLevel: r.density < 2 ? "Low" : "Minimal",
                type: "Outdoors",
                bestTime: "Morning",
                reason: "Real-time data indicates very low footfall in this area."
            }));
            return res.json({ spots });
        }

        // Fallback to destination-specific suggestions if no real-time data
        const isVadodara = trip.destination.toLowerCase().includes('vadodara');
        const fallbackSpots = isVadodara ? [
            { name: "Sursagar Lake (Early Morning)", address: "Mandvi, Vadodara", crowdLevel: "Minimal", type: "Nature", bestTime: "6:00 AM - 8:00 AM", reason: "Peaceful atmosphere with cool breeze before city traffic starts." },
            { name: "Ajwa Garden (Weekday)", address: "Ajwa, Gujarat", crowdLevel: "Low", type: "Park", bestTime: "11:00 AM - 3:00 PM", reason: "Quiet and expansive gardens away from the city center." },
            { name: "EME Temple Gardens", address: "Fatehgunj, Vadodara", crowdLevel: "Minimal", type: "Heritage", bestTime: "Afternoon", reason: "Well-maintained army area with lush greenery and calm surroundings." }
        ] : [
            { name: "Local Public Library", address: "City Center", crowdLevel: "Minimal", type: "Education", bestTime: "Morning", reason: "Ideal for remote work or reading in silence." },
            { name: "Botanical Garden", address: "Suburb Area", crowdLevel: "Low", type: "Nature", bestTime: "Afternoon", reason: "Expansive green space with very few visitors during weekdays." }
        ];

        res.json({ spots: fallbackSpots });
    } catch (error) {
        next(error);
    }
};

export const forceUpdateImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const trip = await TripModel.findOne({ _id: req.params.id, userId });
        if (!trip) throw new NotFoundError("Trip not found");

        await TripModel.findByIdAndUpdate(trip.id, { $unset: { imageUrl: 1, imageCaption: 1 } });

        const randomOffset = Math.floor(Math.random() * 5);
        await fetchImageForTrip(trip.id, trip.destination, randomOffset);

        const updated = await TripModel.findById(trip.id);
        res.json(updated);
    } catch (error) {
        next(error);
    }
};

/**
 * Helper to fetch image from Google Places API
 */
async function fetchImageForTrip(tripId: string, destination: string, skipCount: number = 0) {
    try {
        if (!tripId) return;

        let imageUrl: string | null = null;
        let imageCaption: string | null = null;

        // 1. Wikipedia — article images are always the landmark itself, no people
        try {
            // Try exact match first, then first word (e.g. "Kedarnath" from "Kedarnath, Uttarakhand")
            const wikiTitles = [destination, destination.split(',')[0].trim()];
            for (const title of wikiTitles) {
                const wikiRes = await fetch(
                    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=1200&origin=*`,
                    { headers: { 'User-Agent': 'TripMate/2.0.0' } }
                );
                const wikiData = await wikiRes.json();
                const pages = wikiData?.query?.pages || {};
                const page = Object.values(pages)[0] as any;
                // Skip if no image or missing (-1 = not found)
                if (page && page.pageid !== -1 && page.thumbnail?.source) {
                    imageUrl = page.thumbnail.source;
                    imageCaption = page.title || destination;
                    break;
                }
            }
        } catch { /* ignore, try next source */ }

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
                    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&type=tourist_attraction&key=${key}`
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
                    const photoRef = photos[skipCount % Math.max(photos.length, 1)]?.photo_reference || photos[0]?.photo_reference;
                    if (photoRef) {
                        imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoRef}&key=${key}`;
                        imageCaption = place.name || destination;
                        break outer;
                    }
                }
            }
        }

        if (imageUrl) {
            const updated = await TripModel.findByIdAndUpdate(tripId, {
                imageUrl,
                imageCaption
            }, { new: true });

            if (updated) {
                socketService.broadcastMutation(tripId, { type: "trip-updated", data: updated });
            }
        }
    } catch (err) {
        console.error(`[fetchImageForTrip] Failed for trip ${tripId}:`, err);
    }
}

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
        if (!scheduleText || typeof scheduleText !== 'string' || scheduleText.trim().length < 10) {
            throw new BadRequestError("scheduleText is required and must be at least 10 characters.");
        }
        const aiService = new AiUtilitiesService();
        const result = await aiService.parseSchedule({
            scheduleText: scheduleText.slice(0, 3000),
            startDate,
            groupSize: groupSize ? Number(groupSize) : 1,
            budget: budget ? Number(budget) : undefined,
            currency: currency || 'INR',
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
            $or: [
                { userId },
                { "collaborators.userId": userId }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found");

        const aiService = new AiUtilitiesService();
        const forecast = await aiService.getBudgetForecast(trip);
        res.json(forecast);
    } catch (error) {
        next(error);
    }
};
