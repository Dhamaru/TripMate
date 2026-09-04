import { Request, Response, NextFunction } from "express";
import { TripModel } from "@shared/schema";
import { NotFoundError, BadRequestError } from "../errors";
import { nanoid } from "nanoid";
import { socketService } from "../services/SocketService";
import { notifyTripParticipants } from "../notifications";
import { ACTIVITY_FIELD_NAMES } from "../schemas/itinerary.schemas";

// Was a hand-maintained {time, title, location, notes, latitude,
// longitude} list that fell out of sync with updateActivitySchema the
// last time the accepted field set was widened (latitude/longitude were
// even renamed to lat/lon elsewhere and never updated here) — every
// other field a real edit sends (cost, type, address, placeName,
// duration, coordinates) validated fine, got a 200 back, and was
// silently never written. Now derived from the schema's own field list
// so the two structurally cannot drift apart again.
const UPDATABLE_ACTIVITY_FIELDS = ACTIVITY_FIELD_NAMES;

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
    if (Object.keys(setFields).length === 0) {
      throw new BadRequestError("No valid fields to update");
    }

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
    const beforeDay = before?.itinerary?.[0];
    const removed = beforeDay?.activities.find((a: any) => a.id === activityId);

    const trip = await TripModel.findOneAndUpdate(
      { ...editorAccessFilter(tripId, String(userId)), "itinerary.dayIndex": dayIndex },
      { $pull: { "itinerary.$[day].activities": { id: activityId } } },
      { new: true, arrayFilters: [{ "day.dayIndex": dayIndex }] },
    );
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    // Guard against a TOCTOU double-notification: if a concurrent request
    // already removed this activity between our pre-read and this write,
    // this request's $pull is a no-op — the day's activity count won't have
    // dropped from what we saw in `before`, so don't re-fire the broadcast.
    const afterDay = trip.itinerary?.find((d) => d.dayIndex === dayIndex);
    const actuallyRemoved =
      removed && beforeDay && (afterDay?.activities.length ?? 0) < beforeDay.activities.length;

    if (actuallyRemoved) {
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

// Reorder replaces the whole itinerary array — the one mutation in this
// file that genuinely can't be expressed as a targeted $push/$pull/$set,
// since the client is sending back a full reordering. It was a bare
// findOneAndUpdate with no concurrency guard at all: two collaborators
// reordering at once would silently clobber each other, worse than the
// arrayFilters-scoped mutations elsewhere in this file. Same
// optimistic-concurrency pattern as modifyItineraryHandler/toggleVote —
// read current updatedAt, CAS the write, retry a few times on conflict.
export const reorderItinerary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itinerary } = req.body;
    const tripId = req.params.id;
    const userId = req.user!._id;
    const accessFilter = editorAccessFilter(tripId, String(userId));

    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await TripModel.findOne(accessFilter, { updatedAt: 1 });
      if (!current) throw new NotFoundError("Trip not found or access denied");

      const trip = await TripModel.findOneAndUpdate(
        { ...accessFilter, updatedAt: current.updatedAt },
        { itinerary },
        { new: true },
      );

      if (trip) {
        socketService.broadcastMutation(
          tripId,
          { type: "itinerary-updated", data: trip.itinerary },
          String(userId),
        );
        res.json(trip);
        return;
      }
      // Lost the race — someone else wrote in between. Retry with a fresh read.
    }
    throw new BadRequestError("Trip was modified by someone else at the same time. Please retry.");
  } catch (error) {
    next(error);
  }
};

// `vote` is the caller's DESIRED final state (1 up / -1 down / 0 clear), not
// a delta — the server is the source of truth for how many net votes an
// activity has and who cast them (`userVotes`, keyed by userId). Previously
// the server blindly $inc'd whatever number the client sent, trusting the
// client's own toggle-diff math; that math lived only in React state, so it
// reset on every reload/new device/direct-API call and the same user could
// inflate the count indefinitely (confirmed live: 3 identical "vote: 1"
// calls in a row produced votes: 3, not 1). `vote: 0` was also a complete
// no-op — $inc by 0 changes nothing and neither push branch fires, so a
// user could never actually clear their vote.
export const toggleVote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dayIndex, activityId, vote } = req.body; // 1 | -1 | 0
    const tripId = req.params.id;
    const userId = String(req.user!._id);
    const desired = vote > 0 ? 1 : vote < 0 ? -1 : 0;

    const accessFilter = {
      _id: tripId,
      $or: [{ userId }, { collaborators: { $elemMatch: { userId } } }],
      itinerary: { $elemMatch: { dayIndex, "activities.id": activityId } },
    };

    // Read-modify-write is required here (need the caller's *previous* vote
    // to compute the delta) — mitigated the same way modifyItineraryHandler
    // is: optimistic concurrency with a retry, not a bare overwrite.
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await TripModel.findOne(accessFilter, {
        itinerary: { $elemMatch: { dayIndex } },
        updatedAt: 1,
      });
      if (!current)
        throw new NotFoundError("Trip not found, day/activity not found, or access denied");

      const activity = current.itinerary?.[0]?.activities.find((a: any) => a.id === activityId);
      if (!activity)
        throw new NotFoundError("Trip not found, day/activity not found, or access denied");

      const userVotes: Record<string, 1 | -1> = { ...(activity.userVotes || {}) };
      const previous = userVotes[userId] || 0;
      if (previous === desired) {
        // No-op — already in the desired state. Nothing to write.
        const trip = await TripModel.findById(tripId);
        res.json(trip);
        return;
      }
      if (desired === 0) delete userVotes[userId];
      else userVotes[userId] = desired;

      const delta = desired - previous;
      const upCount = Object.values(userVotes).filter((v) => v === 1).length;
      const downCount = Object.values(userVotes).filter((v) => v === -1).length;
      const vibeSignals = [
        ...Array(upCount).fill("High Vibe"),
        ...Array(downCount).fill("Low Vibe"),
      ];

      const userVotePath = `itinerary.$[day].activities.$[act].userVotes.${userId}`;
      const mongoUpdate: Record<string, unknown> = {
        $inc: { "itinerary.$[day].activities.$[act].votes": delta },
        $set: { "itinerary.$[day].activities.$[act].vibeSignals": vibeSignals },
      };
      if (desired === 0) {
        mongoUpdate.$unset = { [userVotePath]: "" };
      } else {
        (mongoUpdate.$set as Record<string, unknown>)[userVotePath] = desired;
      }

      const trip = await TripModel.findOneAndUpdate(
        { ...accessFilter, updatedAt: current.updatedAt },
        mongoUpdate,
        { new: true, arrayFilters: [{ "day.dayIndex": dayIndex }, { "act.id": activityId }] },
      );

      if (trip) {
        socketService.broadcastMutation(
          tripId,
          { type: "itinerary-updated", data: trip.itinerary },
          userId,
        );
        res.json(trip);
        return;
      }
      // Lost the race (someone else updated the trip between our read and
      // write) — retry with a fresh read.
    }
    throw new BadRequestError("Trip was modified by someone else at the same time. Please retry.");
  } catch (error) {
    next(error);
  }
};
