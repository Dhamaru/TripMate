import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import path from "path";
import { JournalEntryModel, TripModel } from "@shared/schema";
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from "../errors";
import { socketService } from "../services/SocketService";
import { notifyTripParticipants } from "../notifications";

const MAX_JOURNAL_ENTRIES_RETURNED = 300;

function fileUrls(req: Request): string[] {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || !files.length) return [];
  // Was written to disk and served through the authenticated proxy below —
  // acceptance-review finding: Render's web service disk is ephemeral
  // (wiped on every redeploy and on 15-minute idle spin-down), so a journal
  // photo could 404 permanently within minutes. Stored as a base64 data URI
  // directly on the document now, same fix already applied to avatars
  // (auth.controller.ts's uploadAvatar) — Mongo is the one persistent thing
  // in this stack. <img src> renders a data: URI exactly like a normal URL,
  // no client changes needed, and no per-request auth-and-stream round trip.
  return files.map((f) => `data:${f.mimetype};base64,${f.buffer.toString("base64")}`);
}

// Legacy fallback only — no new upload has written a disk-backed photo
// since the base64 migration above. Kept so any journal entry whose photos
// still reference the old /api/v1/journal/photo/:filename shape (and whose
// disk file happens not to have been wiped yet) keeps working until it's
// naturally replaced; the client already treats a 404 here as a graceful
// placeholder, not a broken-image icon.
export const getJournalPhoto = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const filename = req.params.filename;
    // Filenames are server-generated (multer's diskStorage callback) —
    // still defensively reject anything that isn't a plain filename,
    // since this value flows into a filesystem path below.
    if (!filename || /[\\/]|\.\./.test(filename)) {
      throw new NotFoundError("Photo not found");
    }

    const photoUrl = `/api/v1/journal/photo/${filename}`;
    const entry = await JournalEntryModel.findOne({ photos: photoUrl });
    if (!entry) throw new NotFoundError("Photo not found");

    if (entry.userId !== String(userId)) {
      if (!entry.tripId) throw new ForbiddenError("Insufficient permissions");
      const trip = await TripModel.findOne({
        _id: entry.tripId,
        $or: [{ userId }, { "collaborators.userId": userId }],
      });
      if (!trip) throw new ForbiddenError("Insufficient permissions");
    }

    const filePath = path.join(process.cwd(), "server", "uploads", "journal", filename);
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) next(new NotFoundError("Photo not found"));
    });
  },
);

export const createEntry = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Allowlist: spreading req.body let a client set server-owned fields such
  // as isRecap/recapMeta (or userId) on a new entry.
  const { title, content, location, latitude, longitude, tripId, dayIndex } = req.body;
  const entryData = { title, content, location, latitude, longitude, tripId, dayIndex };
  const uploadedPhotos = fileUrls(req);

  // If tripId is provided, verify access
  let accessTrip: any = null;
  if (entryData.tripId) {
    accessTrip = await TripModel.findOne({
      _id: entryData.tripId,
      $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
    });
    if (!accessTrip) throw new ForbiddenError("Trip access denied");
  }

  const entry = await JournalEntryModel.create({
    ...entryData,
    userId,
    photos: uploadedPhotos,
  });

  if (entry.tripId && accessTrip) {
    socketService.broadcastMutation(
      entry.tripId.toString(),
      { type: "journal-updated", data: entry },
      String(userId),
    );
    await notifyTripParticipants(accessTrip, String(userId), {
      type: "journal-updated",
      title: "New journal entry",
      message: `A new entry was added to the journal for your trip to ${accessTrip.destination}.`,
      link: `/app/journal`,
      tripId: entry.tripId.toString(),
      groupKey: `journal-updated:${entry.tripId.toString()}`,
    });
  }

  res.status(201).json(entry);
});

export const getEntries = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const tripId = req.query.tripId;

  let query: any;
  if (tripId) {
    // Check trip access
    const trip = await TripModel.findOne({
      _id: tripId,
      $or: [{ userId }, { "collaborators.userId": userId }],
    });
    if (!trip) throw new ForbiddenError("Trip access denied");
    query = { tripId };
  } else {
    query = { userId };
  }

  // Performance-audit finding: no limit at all -- same unbounded-growth
  // risk as trips.controller.ts's getTrips, same fix (a safety cap, not
  // a response-shape-breaking cursor rewrite -- see that file's comment
  // for the full reasoning).
  if (req.query.light === "true") {
    // Photos are base64 inside the entry; the list used to ship every one
    // of them (multi-MB responses). Send a URL per photo instead; the
    // browser fetches and caches each one from getEntryPhoto.
    const rows = await JournalEntryModel.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $limit: MAX_JOURNAL_ENTRIES_RETURNED },
      {
        $project: {
          title: 1,
          location: 1,
          createdAt: 1,
          updatedAt: 1,
          userId: 1,
          tripId: 1,
          isRecap: 1,
          dayIndex: 1,
          photoCount: { $size: { $ifNull: ["$photos", []] } },
        },
      },
    ]);
    return res.json(
      rows.map(({ _id, photoCount, ...rest }) => {
        const id = String(_id);
        const v = new Date(rest.updatedAt).getTime() || 0;
        return {
          ...rest,
          id,
          photos: Array.from(
            { length: photoCount },
            (_, i) => `/api/v1/journal/${id}/photos/${i}?v=${v}`,
          ),
        };
      }),
    );
  }
  const entries = await JournalEntryModel.find(query)
    .sort({ createdAt: -1 })
    .limit(MAX_JOURNAL_ENTRIES_RETURNED);
  res.json(entries);
});

/** One photo of an entry as image bytes (same access rule as getEntry). */
export const getEntryPhoto = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id || req.user?.id;
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) throw new NotFoundError("Photo not found");
  const entry = await JournalEntryModel.findById(req.params.id, {
    userId: 1,
    tripId: 1,
    photos: { $slice: [index, 1] },
  }).lean();
  if (!entry) throw new NotFoundError("Photo not found");
  if (entry.userId !== String(userId)) {
    const trip = entry.tripId
      ? await TripModel.exists({
          _id: entry.tripId,
          $or: [{ userId }, { "collaborators.userId": userId }],
        })
      : null;
    if (!trip) throw new NotFoundError("Photo not found");
  }
  const photo = entry.photos?.[0];
  if (!photo) throw new NotFoundError("Photo not found");
  const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(photo);
  if (!m) return res.redirect(photo); // legacy /api/v1/journal/photo/<file> or remote URL
  res.setHeader("Content-Type", m[1]);
  res.setHeader("Cache-Control", "private, max-age=604800");
  res.send(Buffer.from(m[2], "base64"));
});

export const getEntry = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const entry = await JournalEntryModel.findById(req.params.id);
  if (!entry) throw new NotFoundError("Entry not found");

  if (entry.userId !== userId.toString()) {
    if (entry.tripId) {
      const trip = await TripModel.findOne({
        _id: entry.tripId,
        $or: [{ userId }, { "collaborators.userId": userId }],
      });
      // 404, not 403: "exists but not yours" vs "missing" would let anyone
      // probe which entry ids exist (trips already answer 404).
      if (!trip) throw new NotFoundError("Entry not found");
    } else {
      throw new NotFoundError("Entry not found");
    }
  }

  res.json(entry);
});

export const updateEntry = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const entryId = req.params.id;

  const entry = await JournalEntryModel.findById(entryId);
  if (!entry) throw new NotFoundError("Entry not found");

  // Only author can edit? Or trip owner? Or any editor of the trip?
  // Let's allow the author OR any editor of the associated trip.
  if (entry.userId !== userId.toString()) {
    if (entry.tripId) {
      const trip = await TripModel.findOne({
        _id: entry.tripId,
        $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
      });
      if (!trip) throw new ForbiddenError("Insufficient permissions");
    } else {
      throw new ForbiddenError("Insufficient permissions");
    }
  }

  const uploadedPhotos = fileUrls(req);
  // Kept photos come back as positions into the stored array (the photos
  // themselves are base64 and overflow the multipart field limit). Legacy
  // clients still sending photo strings are accepted only for photos this
  // entry already has, so a client can't inject arbitrary photo data.
  const current: string[] = entry.photos || [];
  // Positions only mean something against the list the client loaded.
  if (req.body.photoCount !== undefined && Number(req.body.photoCount) !== current.length) {
    throw new ConflictError("This entry's photos changed while you were editing");
  }
  let keptPhotos: string[] = [];
  try {
    if (req.body.existingPhotoIndexes !== undefined) {
      const idx: unknown = JSON.parse(req.body.existingPhotoIndexes);
      if (!Array.isArray(idx)) throw new Error("bad existingPhotoIndexes");
      keptPhotos = idx
        .filter((i): i is number => Number.isInteger(i))
        .map((i) => current[i])
        .filter(Boolean);
    } else {
      const sent: unknown = JSON.parse(req.body.existingPhotos || "[]");
      if (!Array.isArray(sent)) throw new Error("bad existingPhotos");
      keptPhotos = sent.filter((p): p is string => typeof p === "string" && current.includes(p));
    }
  } catch {
    // Was swallowed, leaving keptPhotos empty — which deleted every photo.
    throw new BadRequestError("Invalid photo list");
  }
  const allPhotos = [...keptPhotos, ...uploadedPhotos];

  // Allowlist only — spreading req.body directly let a client pass
  // userId/tripId in the multipart form and reassign ownership of an
  // entry they only have edit access to. Photos always set (not just
  // when non-empty) so removing every photo actually clears the field
  // instead of silently leaving the old array in place.
  const update: Record<string, unknown> = { photos: allPhotos };
  if (req.body.title !== undefined) update.title = req.body.title;
  if (req.body.content !== undefined) update.content = req.body.content;
  if (req.body.location !== undefined) update.location = req.body.location;
  if (req.body.latitude !== undefined) update.latitude = req.body.latitude;
  if (req.body.longitude !== undefined) update.longitude = req.body.longitude;
  if (req.body.dayIndex !== undefined) update.dayIndex = req.body.dayIndex;

  const updatedEntry = await JournalEntryModel.findByIdAndUpdate(entryId, update, {
    new: true,
    runValidators: true,
  });

  if (updatedEntry?.tripId) {
    socketService.broadcastMutation(
      updatedEntry.tripId.toString(),
      { type: "journal-updated", data: updatedEntry },
      String(userId),
    );
  }

  res.json(updatedEntry);
});

export const deleteEntry = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const entryId = req.params.id;

  const entry = await JournalEntryModel.findById(entryId);
  if (!entry) throw new NotFoundError("Entry not found");

  if (entry.userId !== userId.toString()) {
    if (entry.tripId) {
      const trip = await TripModel.findById(entry.tripId);
      if (trip?.userId !== userId.toString()) {
        throw new ForbiddenError("Only the author or trip owner can delete this entry");
      }
    } else {
      throw new ForbiddenError("Insufficient permissions");
    }
  }

  await JournalEntryModel.deleteOne({ _id: entryId });

  if (entry.tripId) {
    socketService.broadcastMutation(
      entry.tripId.toString(),
      { type: "journal-deleted", data: { id: entryId } },
      String(userId),
    );
  }

  res.status(204).send();
});
