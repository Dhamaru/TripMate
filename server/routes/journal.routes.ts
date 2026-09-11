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
import { imageFileFilter } from "../middleware/imageUpload";

const router = Router();

// Acceptance-review finding: journal photos were written to Render's web
// service disk (server/uploads/journal), which is ephemeral — wiped on
// every redeploy and on spin-down after 15 minutes idle. A journal photo
// could 404 permanently within minutes of being uploaded, with nothing in
// the UI warning it would happen. Same fix already applied to avatars
// (auth.routes.ts): memoryStorage + a base64 data URI stored directly on
// the Mongo document instead of a file on disk. 5MB/photo (down from the
// old 10MB disk limit — base64 inflates ~33%, and up to 10 photos land in
// one document, which has to stay well under Mongo's 16MB doc cap).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
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
