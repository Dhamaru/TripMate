import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getVapidPublicKey, subscribe, unsubscribe } from "../controllers/push.controller";

const router = Router();

// Public — a signed-out visitor's browser needs this to even offer the
// permission prompt before they've logged in on some flows, and it isn't
// sensitive (see getVapidPublicKey's comment).
router.get("/vapid-public-key", getVapidPublicKey);

router.use(requireAuth);
router.post("/subscribe", subscribe);
router.post("/unsubscribe", unsubscribe);

export default router;
