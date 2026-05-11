import { Router } from "express";
import { createEntry, getEntries, updateEntry, deleteEntry } from "../controllers/journal.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

router.post("/journal", createEntry);
router.get("/journal", getEntries);
router.put("/journal/:id", updateEntry);
router.delete("/journal/:id", deleteEntry);

export default router;
