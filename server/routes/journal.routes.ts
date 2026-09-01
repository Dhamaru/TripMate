import { Router } from "express";
import {
  createEntry,
  getEntries,
  getEntry,
  updateEntry,
  deleteEntry,
  getJournalPhoto,
} from "../controllers/journal.controller";
import { requireAuth } from "../middleware/auth.middleware";
import multer from "multer";
import path from "path";
import fs from "fs";
import { imageFileFilter } from "../middleware/imageUpload";

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), "server", "uploads", "journal");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `journal-${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: imageFileFilter,
});

router.use(requireAuth);

router.post("/journal", upload.array("photos", 10), createEntry);
router.get("/journal", getEntries);
// Must be registered before /journal/:id, or Express would match "photo"
// as the :id param.
router.get("/journal/photo/:filename", getJournalPhoto);
router.get("/journal/:id", getEntry);
router.put("/journal/:id", upload.array("photos", 10), updateEntry);
router.delete("/journal/:id", deleteEntry);

export default router;
