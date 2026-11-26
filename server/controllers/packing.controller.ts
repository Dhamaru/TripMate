import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { PackingListModel, PackingListTemplateModel, TripModel } from "@shared/schema";
import {
  NotFoundError,
  InternalServerError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from "../errors";
import logger from "../logger";
import { MasterOrchestrator } from "../agent/multiAgent/MasterOrchestrator";
import { OrchestratorInput } from "../agent/multiAgent/types";
import { socketService } from "../services/SocketService";
import { notifyTripParticipants } from "../notifications";

const orchestrator = new MasterOrchestrator();

export const getPackingListTemplates = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const templates = await PackingListTemplateModel.find({ userId }).sort({ createdAt: -1 });
    res.json(templates);
  },
);

export const createPackingListTemplate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const { name, items } = req.body;
    if (!name) throw new BadRequestError("Template name is required");

    const template = await PackingListTemplateModel.create({
      userId,
      name,
      items: Array.isArray(items) ? items : [],
    });
    res.status(201).json(template);
  },
);

export const deletePackingListTemplate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const result = await PackingListTemplateModel.deleteOne({ _id: req.params.id, userId });
    if (result.deletedCount === 0) throw new NotFoundError("Template not found");
    res.status(204).send();
  },
);

// Who may change a list: its creator, the trip's owner, or an editor on the
// trip. (The trip owner used to be refused on a list a collaborator made.)
async function canEditList(list: { userId?: string; tripId?: unknown }, userId: string) {
  if (list.userId === userId) return true;
  if (!list.tripId) return false;
  return !!(await TripModel.exists({
    _id: list.tripId,
    $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
  }));
}

export const generatePackingList = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: tripId } = req.params;
    const userId = req.user?._id || req.user?.id;

    const trip = await TripModel.findOne({
      _id: tripId,
      $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
    });
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    const input: OrchestratorInput = {
      userId: String(userId),
      tripId: String(tripId),
      trigger: "packing_request",
      context: {
        trip: {
          id: String(tripId),
          destination: trip.destination,
          startDate: trip.startDate ? trip.startDate.toISOString() : new Date().toISOString(),
          endDate: trip.endDate ? trip.endDate.toISOString() : new Date().toISOString(),
          budget: trip.budget || 0,
          currency: trip.currency || "INR",
          travelStyle: trip.travelStyle || "standard",
          travelMedium: trip.transportMode || "flight",
          companions: trip.groupSize || 1,
        },
        currentPage: "packing",
      },
    };

    socketService.broadcastAtlasThinking(tripId as string, true);
    const result = await orchestrator.run(input);
    socketService.broadcastAtlasThinking(tripId as string, false);
    const packingAgentResult = result.results.find((r) => r.agent === "PackingAgent");

    if (!packingAgentResult || !packingAgentResult.success || !packingAgentResult.data) {
      throw new InternalServerError("Failed to generate packing list via AI agent");
    }

    const packingData = packingAgentResult.data as any;

    // PackingAgent's output shape (categories[].items[] with
    // label/checked/essential) doesn't match PackingListModel's schema
    // (a flat items[] with required name/packed/is_mandatory) — under
    // Mongoose strict mode, writing the agent's shape directly silently
    // dropped every field and left the required `name` unset, so the
    // saved list was always empty. Flatten to the schema's real shape.
    const items = (packingData.categories || []).flatMap((cat: any) =>
      (cat.items || []).map((item: any) => ({
        name: item.label,
        quantity: item.quantity ?? 1,
        packed: item.checked || false,
        category: cat.name,
        is_mandatory: item.essential || false,
      })),
    );

    const packingList = await PackingListModel.findOneAndUpdate(
      { tripId, userId: trip.userId }, // Keep it under the owner's userId or allow shared?
      // For now, let's keep it linked to the trip and the original owner to avoid duplicates,
      // but allow collaborators to see/edit it via tripId.
      {
        tripId,
        userId: trip.userId,
        name: `${trip.destination} Packing List`,
        items,
      },
      { upsert: true, new: true, runValidators: true },
    );

    logger.info(`[packing] Generated packing list via Orchestrator for trip ${tripId}`);
    socketService.broadcastMutation(
      tripId as string,
      { type: "packing-updated", data: packingList },
      String(userId),
    );
    await notifyTripParticipants(trip, String(userId), {
      type: "packing-updated",
      title: "Packing list ready",
      message: `A packing list was generated for your trip to ${trip.destination}.`,
      link: `/app/packing?tripId=${tripId}`,
      tripId: String(tripId),
      groupKey: `packing-updated:${tripId}`,
    });
    res.json({ success: true, data: packingList });
  },
);

export const createPackingList = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const { tripId, name, season, items, isTemplate } = req.body;

    if (tripId) {
      const trip = await TripModel.findOne({
        _id: tripId,
        $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
      });
      if (!trip) throw new ForbiddenError("Trip not found or access denied");
    }

    // Explicit field construction, not a req.body spread — mass-assignment
    // defense-in-depth alongside the Zod schema/validate.ts stripping, so
    // this stays safe even if a route ever drops its validate() middleware.
    const packingList = await PackingListModel.create({
      tripId,
      name,
      season,
      items,
      isTemplate,
      userId,
    });
    res.status(201).json(packingList);
  },
);

export const getPackingLists = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const tripId = req.query.tripId;

    let query: any;
    if (tripId) {
      // Check if user has access to this trip
      const trip = await TripModel.findOne({
        _id: tripId,
        $or: [{ userId }, { "collaborators.userId": userId }],
      });
      if (!trip) throw new ForbiddenError("Trip access denied");
      query = { tripId };
    } else {
      // Own lists plus the lists of every trip the user is on: the packing
      // page loads this and picks the trip's list on the client, so a
      // collaborator used to see nothing and save a duplicate list.
      const tripIds = await TripModel.find({
        $or: [{ userId }, { "collaborators.userId": userId }],
      }).distinct("_id");
      query = { $or: [{ userId }, { tripId: { $in: tripIds.map(String) } }] };
    }

    const lists = await PackingListModel.find(query).sort({ createdAt: -1 });
    res.json(lists);
  },
);

export const updatePackingItem = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: listId, itemId } = req.params;
    const { packed, quantity, name } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const list = await PackingListModel.findById(listId, { userId: 1, tripId: 1 }).lean();
    if (!list) throw new NotFoundError("Packing list not found");
    if (!(await canEditList(list as any, String(userId)))) {
      throw new ForbiddenError("Insufficient permissions");
    }

    // Atomic, by item id: save() rewrote items by array position, so a
    // concurrent removal landed edits on the wrong slot and could leave a
    // nameless row that failed validation on every later save.
    const set: Record<string, unknown> = {};
    if (packed !== undefined) set["items.$.packed"] = packed;
    if (quantity !== undefined) set["items.$.quantity"] = quantity;
    if (name !== undefined) set["items.$.name"] = name;
    const updated = await PackingListModel.findOneAndUpdate(
      { _id: listId, "items._id": itemId },
      { $set: set },
      { new: true, runValidators: true },
    );
    if (!updated) throw new NotFoundError("Item not found");

    if (updated.tripId) {
      socketService.broadcastMutation(
        updated.tripId.toString(),
        { type: "packing-updated", data: updated },
        String(userId),
      );
    }
    res.json(updated);
  },
);

export const deletePackingList = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const list = await PackingListModel.findById(req.params.id);
    if (!list) throw new NotFoundError("Packing list not found");

    // Only owner can delete? Or anyone with editor role?
    // Let's say only packing list owner or trip owner can delete.
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const trip = list.tripId ? await TripModel.findById(list.tripId) : null;

    if (list.userId !== userId.toString() && trip?.userId !== userId.toString()) {
      throw new ForbiddenError("Only the owner can delete this packing list");
    }

    await PackingListModel.deleteOne({ _id: req.params.id });
    if (list.tripId) {
      socketService.broadcastMutation(
        list.tripId.toString(),
        { type: "packing-deleted", data: { id: req.params.id } },
        String(userId),
      );
    }
    res.status(204).send();
  },
);

export const updatePackingList = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const list = await PackingListModel.findById(id, { userId: 1, tripId: 1 }).lean();
    if (!list) throw new NotFoundError("Packing list not found");
    if (!(await canEditList(list as any, String(userId)))) {
      throw new ForbiddenError("Insufficient permissions");
    }

    const set: Record<string, unknown> = {};
    for (const field of ["name", "season", "items"] as const) {
      if (field in req.body) set[field] = req.body[field];
    }
    // The client saves the whole list. With the version it loaded, a save
    // made after someone else's save is refused instead of erasing theirs.
    const base = req.body.baseUpdatedAt ? new Date(req.body.baseUpdatedAt) : null;
    const updated = await PackingListModel.findOneAndUpdate(
      { _id: id, ...(base && !isNaN(base.getTime()) ? { updatedAt: base } : {}) },
      { $set: set },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new ConflictError(
        "Someone else just changed this list. Reload to see their changes, then save again.",
      );
    }

    if (updated.tripId) {
      socketService.broadcastMutation(
        updated.tripId.toString(),
        { type: "packing-updated", data: updated },
        String(userId),
      );
    }

    res.json(updated);
  },
);

export const duplicatePackingList = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const source = await PackingListModel.findById(id);
    if (!source) throw new NotFoundError("Packing list not found");

    // Same read-access rule as getPackingLists: owner, or any collaborator
    // on the trip (not just editors — duplicating just makes you a new,
    // independent copy, it doesn't mutate the original).
    if (source.userId !== userId.toString()) {
      if (source.tripId) {
        const trip = await TripModel.findOne({
          _id: source.tripId,
          $or: [{ userId }, { "collaborators.userId": userId }],
        });
        if (!trip) throw new ForbiddenError("Trip access denied");
      } else {
        throw new ForbiddenError("Insufficient permissions");
      }
    }

    const copy = await PackingListModel.create({
      name: `${source.name} (Copy)`,
      season: source.season,
      // Intentionally not carrying tripId over — a duplicate starts as
      // a standalone personal list so it doesn't silently overwrite the
      // trip's shared list on next save.
      userId,
      items: source.items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        category: item.category,
        is_mandatory: item.is_mandatory,
        packed: false,
      })),
    });

    res.status(201).json(copy);
  },
);

export const togglePackingItem = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: listId, itemId } = req.params;
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const list = await PackingListModel.findById(listId);
    if (!list) throw new NotFoundError("Packing list not found");
    if (!(await canEditList(list as any, String(userId)))) {
      throw new ForbiddenError("Insufficient permissions");
    }

    const item = (list.items as any).id(itemId);
    if (!item) throw new NotFoundError("Item not found");

    // Flip only if the value is still what we read (atomic, by item id).
    const updated = await PackingListModel.findOneAndUpdate(
      // Older items may have no `packed` field at all (the default is only
      // applied in memory), so "unpacked" means "not true".
      {
        _id: listId,
        items: { $elemMatch: { _id: itemId, packed: item.packed ? true : { $ne: true } } },
      },
      { $set: { "items.$.packed": !item.packed } },
      { new: true },
    );
    if (!updated) {
      throw new ConflictError("This item just changed. Reload the list and try again.");
    }

    if (updated.tripId) {
      socketService.broadcastMutation(
        updated.tripId.toString(),
        { type: "packing-updated", data: updated },
        String(userId),
      );
    }

    res.json((updated.items as any).id(itemId));
  },
);
