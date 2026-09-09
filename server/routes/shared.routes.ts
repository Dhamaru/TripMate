import { Router } from "express";
import * as packingController from "../controllers/packing.controller";
import * as journalAiController from "../controllers/journal_ai.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import {
  createPackingListSchema,
  createPackingListTemplateSchema,
  updatePackingItemSchema,
  updatePackingListSchema,
} from "../schemas/packing.schemas";
import { aiLimiter, generationLimiter } from "../middleware/rateLimit.middleware";
import { guestAiQuota, guestGenerationQuota } from "../middleware/guestQuota.middleware";

const router = Router();

// Secure all shared routes (Packing/Journal)
router.use(requireAuth);

// Packing templates — must be registered before the /packing-lists/:id
// routes below, or Express would match "templates" as the :id param.
router.get("/packing-lists/templates", packingController.getPackingListTemplates);
router.post(
  "/packing-lists/templates",
  validate(createPackingListTemplateSchema),
  packingController.createPackingListTemplate,
);
router.delete("/packing-lists/templates/:id", packingController.deletePackingListTemplate);

// Packing Routes
router.get("/packing", packingController.getPackingLists);
router.get("/packing-lists", packingController.getPackingLists);
router.post("/packing", validate(createPackingListSchema), packingController.createPackingList);
router.post(
  "/packing-lists",
  validate(createPackingListSchema),
  packingController.createPackingList,
);
router.put("/packing/:id", validate(updatePackingListSchema), packingController.updatePackingList);
router.put(
  "/packing-lists/:id",
  validate(updatePackingListSchema),
  packingController.updatePackingList,
);
router.post("/packing/:id/duplicate", packingController.duplicatePackingList);
router.post("/packing-lists/:id/duplicate", packingController.duplicatePackingList);
router.patch("/packing/:id/items/:itemId/toggle", packingController.togglePackingItem);
router.put(
  "/packing-lists/:id/item/:itemId",
  validate(updatePackingItemSchema),
  packingController.updatePackingItem,
);
router.delete("/packing/:id", packingController.deletePackingList);
router.delete("/packing-lists/:id", packingController.deletePackingList);
// Packing AI — generate smart list for a trip. Previously had no rate
// limiter at all (security review finding this session).
router.post(
  "/packing/generate/:id",
  aiLimiter,
  guestAiQuota,
  packingController.generatePackingList,
);
router.post(
  "/packing-lists/generate/:id",
  aiLimiter,
  guestAiQuota,
  packingController.generatePackingList,
);

// Journal CRUD is registered in journal.routes.ts (mounted earlier at the
// same /api/v1 prefix, so it wins for these exact paths) — duplicate
// registrations previously here were dead/unreachable and have been
// removed. Only journal's AI endpoints, unique to this router, live here.
router.post("/journal/augment", aiLimiter, guestAiQuota, journalAiController.augmentEntry);
router.post(
  "/journal/:id/contextualize",
  aiLimiter,
  guestAiQuota,
  journalAiController.contextualizeEntry,
);
router.post("/journal/:id/enhance", aiLimiter, guestAiQuota, journalAiController.enhanceEntry);
router.post(
  "/journal/:id/enhance/confirm",
  aiLimiter,
  guestAiQuota,
  journalAiController.confirmEnhancement,
);
router.post(
  "/journal/recap/:tripId",
  generationLimiter,
  guestGenerationQuota,
  journalAiController.generateRecap,
);

export default router;
