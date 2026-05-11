import { Router } from "express";
import { createEntry, getEntries, updateEntry, deleteEntry } from "../controllers/journal.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate";
import { createJournalEntrySchema, updateJournalEntrySchema } from "../schemas/journal.schemas";

const router = Router();

router.use(requireAuth);

router.post("/journal", validate(createJournalEntrySchema), createEntry);
router.get("/journal", getEntries);
router.put("/journal/:id", validate(updateJournalEntrySchema), updateEntry);
router.delete("/journal/:id", deleteEntry);

export default router;
