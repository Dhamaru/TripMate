import { Router } from "express";
import { addActivity, updateActivity, deleteActivity, reorderItinerary } from "../controllers/itinerary.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate";
import { addActivitySchema, updateActivitySchema, reorderItinerarySchema } from "../schemas/itinerary.schemas";

const router = Router();

router.use(requireAuth);

router.post("/:id/itinerary/activity", validate(addActivitySchema), addActivity);
router.put("/:id/itinerary/activity/:activityId", validate(updateActivitySchema), updateActivity);
router.delete("/:id/itinerary/activity/:activityId", deleteActivity);
router.put("/:id/itinerary/reorder", validate(reorderItinerarySchema), reorderItinerary);

export default router;
