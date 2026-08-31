import { Request, Response, NextFunction } from "express";
import { TripModel } from "@shared/schema";
import { NotFoundError } from "../errors";
import { nanoid } from "nanoid";
import { socketService } from "../services/SocketService";
import { notifyTripParticipants } from "../notifications";

const UPDATABLE_ACTIVITY_FIELDS = [
  "time",
  "title",
  "location",
  "notes",
  "latitude",
  "longitude",
] as const;

const editorAccessFilter = (tripId: string, userId: string) => ({
  _id: tripId,
  $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
});

export const addActivity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dayIndex, activity } = req.body;
    const tripId = req.params.id;
    const userId = req.user!._id;

    const newActivity = { ...activity, id: nanoid() };

    // Fast path: push atomically into the existing day (the common,
    // race-prone case — multiple collaborators adding to the same day).
    let trip = await TripModel.findOneAndUpdate(
      { ...editorAccessFilter(tripId, String(userId)), "itinerary.dayIndex": dayIndex },
      { $push: { "itinerary.$[day].activities": newActivity } },
      { new: true, arrayFilters: [{ "day.dayIndex": dayIndex }] },
    );

    if (!trip) {
      // Day may not exist yet. Confirm trip exists/access, then try to
      // atomically create the day — the $ne filter is re-evaluated by
      // Mongo at write time, so concurrent creators can't both win.
      const existing = await TripModel.exists(editorAccessFilter(tripId, String(userId)));
      if (!existing) throw new NotFoundError("Trip not found or access denied");

      trip = await TripModel.findOneAndUpdate(
        { ...editorAccessFilter(tripId, String(userId)), "itinerary.dayIndex": { $ne: dayIndex } },
        { $push: { itinerary: { dayIndex, activities: [newActivity] } } },
        { new: true },
      );

      if (!trip) {
        // Either we lost the race (someone else just created the day)
        // or the day already existed all along — the fast path now
        // applies either way.
        trip = await TripModel.findOneAndUpdate(
          { ...editorAccessFilter(tripId, String(userId)), "itinerary.dayIndex": dayIndex },
          { $push: { "itinerary.$[day].activities": newActivity } },
          { new: true, arrayFilters: [{ "day.dayIndex": dayIndex }] },
        );
      }
      if (!trip) throw new NotFoundError("Trip not found or access denied");
    }

    socketService.broadcastMutation(
      tripId,
      { type: "itinerary-updated", data: trip.itinerary },
      String(userId),
    );
    await notifyTripParticipants(trip, String(userId), {
      type: "itinerary-updated",
      title: "Itinerary updated",
      message: `${newActivity.title || "A new activity"} was added to your trip to ${trip.destination}.`,
      link: `/app/trips/${tripId}`,
      tripId,
    });

    res.status(201).json(trip);
  } catch (error) {
    next(error);
  }
};

export const updateActivity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dayIndex, data } = req.body;
    const { id: tripId, activityId } = req.params;
    const userId = req.user!._id;

    const setFields = Object.fromEntries(
      Object.entries(data)
        .filter(([key]) => (UPDATABLE_ACTIVITY_FIELDS as readonly string[]).includes(key))
        .map(([key, value]) => [`itinerary.$[day].activities.$[act].${key}`, value]),
    );

    const trip = await TripModel.findOneAndUpdate(
      {
        ...editorAccessFilter(tripId, String(userId)),
        itinerary: { $elemMatch: { dayIndex, "activities.id": activityId } },
      },
      { $set: setFields },
      {
        new: true,
        arrayFilters: [{ "day.dayIndex": dayIndex }, { "act.id": activityId }],
      },
    );
    if (!trip) throw new NotFoundError("Trip not found, day/activity not found, or access denied");

    const day = trip.itinerary?.find((d) => d.dayIndex === dayIndex);
    const activity = day?.activities.find((a: any) => a.id === activityId);

    socketService.broadcastMutation(
      tripId,
      { type: "itinerary-updated", data: trip.itinerary },
      String(userId),
    );
    await notifyTripParticipants(trip, String(userId), {
      type: "itinerary-updated",
      title: "Itinerary updated",
      message: `${activity?.title || "An activity"} was updated on your trip to ${trip.destination}.`,
      link: `/app/trips/${tripId}`,
      tripId,
    });

    res.json(trip);
  } catch (error) {
    next(error);
  }
};

export const deleteActivity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dayIndex } = req.body;
    const { id: tripId, activityId } = req.params;
    const userId = req.user!._id;

    const before = await TripModel.findOne(
      { ...editorAccessFilter(tripId, String(userId)), "itinerary.dayIndex": dayIndex },
      { itinerary: { $elemMatch: { dayIndex } } },
    );
    const removed = before?.itinerary?.[0]?.activities.find((a: any) => a.id === activityId);

    const trip = await TripModel.findOneAndUpdate(
      { ...editorAccessFilter(tripId, String(userId)), "itinerary.dayIndex": dayIndex },
      { $pull: { "itinerary.$[day].activities": { id: activityId } } },
      { new: true, arrayFilters: [{ "day.dayIndex": dayIndex }] },
    );
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    if (removed) {
      socketService.broadcastMutation(
        tripId,
        { type: "itinerary-updated", data: trip.itinerary },
        String(userId),
      );
      await notifyTripParticipants(trip, String(userId), {
        type: "itinerary-updated",
        title: "Itinerary updated",
        message: `${removed.title || "An activity"} was removed from your trip to ${trip.destination}.`,
        link: `/app/trips/${tripId}`,
        tripId,
      });
    }

    res.json(trip);
  } catch (error) {
    next(error);
  }
};

export const reorderItinerary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itinerary } = req.body;
    const tripId = req.params.id;
    const userId = req.user!._id;

    const trip = await TripModel.findOneAndUpdate(
      editorAccessFilter(tripId, String(userId)),
      { itinerary },
      { new: true },
    );
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    socketService.broadcastMutation(
      tripId,
      { type: "itinerary-updated", data: trip.itinerary },
      String(userId),
    );

    res.json(trip);
  } catch (error) {
    next(error);
  }
};

export const toggleVote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dayIndex, activityId, vote } = req.body; // vote: 1 (up), -1 (down), 0 (clear)
    const tripId = req.params.id;
    const userId = req.user!._id;

    const update: Record<string, unknown> = {
      $inc: { "itinerary.$[day].activities.$[act].votes": vote || 0 },
    };
    if (vote < 0) {
      update.$push = { "itinerary.$[day].activities.$[act].vibeSignals": "Low Vibe" };
    } else if (vote > 0) {
      update.$push = { "itinerary.$[day].activities.$[act].vibeSignals": "High Vibe" };
    }

    const trip = await TripModel.findOneAndUpdate(
      {
        _id: tripId,
        $or: [{ userId }, { collaborators: { $elemMatch: { userId } } }],
        itinerary: { $elemMatch: { dayIndex, "activities.id": activityId } },
      },
      update,
      {
        new: true,
        arrayFilters: [{ "day.dayIndex": dayIndex }, { "act.id": activityId }],
      },
    );
    if (!trip) throw new NotFoundError("Trip not found, day/activity not found, or access denied");

    socketService.broadcastMutation(
      tripId,
      { type: "itinerary-updated", data: trip.itinerary },
      String(userId),
    );
    res.json(trip);
  } catch (error) {
    next(error);
  }
};
