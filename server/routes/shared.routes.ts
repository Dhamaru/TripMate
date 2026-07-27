import { Router } from "express";
import * as packingController from "../controllers/packing.controller";
import * as journalController from "../controllers/journal.controller";
import * as journalAiController from "../controllers/journal_ai.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { createPackingListSchema, createPackingListTemplateSchema, updatePackingItemSchema } from "../schemas/packing.schemas";
import { createJournalEntrySchema, updateJournalEntrySchema } from "../schemas/journal.schemas";

const router = Router();

// Secure all shared routes (Packing/Journal)
router.use(requireAuth);

// Packing templates — must be registered before the /packing-lists/:id
// routes below, or Express would match "templates" as the :id param.
router.get("/packing-lists/templates", packingController.getPackingListTemplates);
router.post("/packing-lists/templates", validate(createPackingListTemplateSchema), packingController.createPackingListTemplate);
router.delete("/packing-lists/templates/:id", packingController.deletePackingListTemplate);

// Packing Routes
router.get("/packing", packingController.getPackingLists);
router.get("/packing-lists", packingController.getPackingLists);
router.post("/packing", validate(createPackingListSchema), packingController.createPackingList);
router.post("/packing-lists", validate(createPackingListSchema), packingController.createPackingList);
router.put("/packing/:id", packingController.updatePackingList);
router.put("/packing-lists/:id", packingController.updatePackingList);
router.patch("/packing/:id/items/:itemId/toggle", packingController.togglePackingItem);
router.put("/packing-lists/:id/item/:itemId", validate(updatePackingItemSchema), packingController.updatePackingItem);
router.delete("/packing/:id", packingController.deletePackingList);
router.delete("/packing-lists/:id", packingController.deletePackingList);
// Packing AI — generate smart list for a trip
router.post("/packing/generate/:id", packingController.generatePackingList);
router.post("/packing-lists/generate/:id", packingController.generatePackingList);

// Journal Routes
router.get("/journal", journalController.getEntries);
router.post("/journal", validate(createJournalEntrySchema), journalController.createEntry);
router.post("/journal/augment", journalAiController.augmentEntry);
router.put("/journal/:id", validate(updateJournalEntrySchema), journalController.updateEntry);
router.delete("/journal/:id", journalController.deleteEntry);
// Journal AI endpoints
router.post("/journal/:id/contextualize", journalAiController.contextualizeEntry);
router.post("/journal/:id/enhance", journalAiController.enhanceEntry);
router.post("/journal/:id/enhance/confirm", journalAiController.confirmEnhancement);
router.post("/journal/recap/:tripId", journalAiController.generateRecap);

export default router;
