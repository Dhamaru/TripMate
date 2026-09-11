import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as notificationsController from "../controllers/notifications.controller";

const router = Router();

router.use(requireAuth);
router.get("/", notificationsController.getNotifications);
router.post("/:id/read", notificationsController.markNotificationRead);
router.post("/read-all", notificationsController.markAllNotificationsRead);
router.delete("/:id", notificationsController.deleteNotification);
// DELETE with a JSON body is legal HTTP but stripped by some proxies/
// clients — POST avoids relying on that for "delete these selected ids".
router.post("/delete", notificationsController.deleteNotifications);

export default router;
