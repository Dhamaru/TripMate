import { Router } from "express";
import * as packingController from "../controllers/packing.controller";
import * as journalController from "../controllers/journal.controller";
import * as journalAiController from "../controllers/journal_ai.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { createPackingListSchema, updatePackingItemSchema } from "../schemas/packing.schemas";
import { createJournalEntrySchema, updateJournalEntrySchema } from "../schemas/journal.schemas";

const router = Router();

// Secure all shared routes (Packing/Journal)
router.use(requireAuth);

// Packing Routes
router.get("/packing", packingController.getPackingLists);
router.post("/packing", validate(createPackingListSchema), packingController.createPackingList);
router.put("/packing/:id/item/:itemId", validate(updatePackingItemSchema), packingController.updatePackingItem);
router.delete("/packing/:id", packingController.deletePackingList);
// Packing AI — generate smart list for a trip
router.post("/packing/generate/:id", packingController.generatePackingList);

// Journal Routes
router.get("/journal", journalController.getEntries);
router.post("/journal", validate(createJournalEntrySchema), journalController.createEntry);
router.put("/journal/:id", validate(updateJournalEntrySchema), journalController.updateEntry);
router.delete("/journal/:id", journalController.deleteEntry);
// Journal AI endpoints
router.post("/journal/:id/contextualize", journalAiController.contextualizeEntry);
router.post("/journal/:id/enhance", journalAiController.enhanceEntry);
router.post("/journal/:id/enhance/confirm", journalAiController.confirmEnhancement);
router.post("/journal/recap/:tripId", journalAiController.generateRecap);

export default router;
