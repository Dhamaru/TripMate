import { Router } from "express";
import * as tripsController from "../controllers/trips.controller";

import * as itineraryController from "../controllers/itinerary.controller";
import * as expenseController from "../controllers/expense.controller";
import * as collaboratorController from "../controllers/collaborator.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import {
  generationLimiter,
  aiLimiter,
  importPlanLimiter,
} from "../middleware/rateLimit.middleware";
import { createTripSchema, parseScheduleSchema } from "../schemas/trip.schemas";
import {
  addActivitySchema,
  updateActivitySchema,
  reorderItinerarySchema,
} from "../schemas/itinerary.schemas";
import { addExpenseSchema, updateExpenseSchema } from "../schemas/expense.schemas";
import { addCollaboratorSchema } from "../schemas/collaborator.schemas";

const router = Router();

// Public routes (No auth required)
router.get("/public/:shareId", tripsController.getPublicTrip);

// Secure all other trip routes
router.use(requireAuth);

// Trip CRUD
router.get("/", tripsController.getTrips);
router.post("/", validate(createTripSchema), tripsController.createTrip);
router.get("/:id", tripsController.getTrip);
router.put("/:id", tripsController.updateTrip);
router.delete("/:id", tripsController.deleteTrip);

// Sharing
router.post("/:id/share", tripsController.shareTrip);

// AI Itinerary Generation (Internal/Sync)
router.post("/generate-itinerary", generationLimiter, tripsController.generateItinerary);

// Parse user's own schedule text into structured itinerary
router.post(
  "/parse-schedule",
  requireAuth,
  importPlanLimiter,
  validate(parseScheduleSchema),
  tripsController.parseSchedule,
);

// Expense management
router.post("/:id/expenses", validate(addExpenseSchema), expenseController.addExpense);
router.put(
  "/:id/expenses/:expenseId",
  validate(updateExpenseSchema),
  expenseController.updateExpense,
);
router.delete("/:id/expenses/:expenseId", expenseController.deleteExpense);

// Itinerary management
router.post(
  "/:id/itinerary/activity",
  validate(addActivitySchema),
  itineraryController.addActivity,
);
router.put(
  "/:id/itinerary/activity/:activityId",
  validate(updateActivitySchema),
  itineraryController.updateActivity,
);
router.delete("/:id/itinerary/activity/:activityId", itineraryController.deleteActivity);
router.put(
  "/:id/itinerary/reorder",
  validate(reorderItinerarySchema),
  itineraryController.reorderItinerary,
);
router.post("/:id/itinerary/vote", itineraryController.toggleVote);

// Collaborators management
router.get("/:id/collaborators", collaboratorController.getCollaborators);
router.post(
  "/:id/collaborators",
  validate(addCollaboratorSchema),
  collaboratorController.addCollaborator,
);
router.delete("/:id/collaborators/:collaboratorId", collaboratorController.removeCollaborator);

// AI Suggestions & Content
router.get("/:id/hacks", aiLimiter, tripsController.getHacks);
router.get("/:id/quiet-places", aiLimiter, tripsController.getQuietPlaces);
router.get("/:id/budget-forecast", aiLimiter, tripsController.getBudgetForecast);
router.post("/:id/discover", aiLimiter, tripsController.discoverPlaces);
router.post("/:id/ai-recommendations", aiLimiter, tripsController.getAiRecommendations);
router.post("/:id/image", tripsController.forceUpdateImage);

export default router;
