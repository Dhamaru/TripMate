import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as notificationsController from "../controllers/notifications.controller";

const router = Router();

router.use(requireAuth);
router.get("/", notificationsController.getNotifications);
router.post("/:id/read", notificationsController.markNotificationRead);
router.post("/read-all", notificationsController.markAllNotificationsRead);

export default router;
