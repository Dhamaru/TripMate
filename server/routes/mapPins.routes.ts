import { Router } from "express";
import * as mapPinController from "../controllers/mapPin.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate";
import { createMapPinSchema } from "../schemas/geo.schemas";

const router = Router();

router.use(requireAuth);

router.get("/", mapPinController.getPins);
router.post("/", validate(createMapPinSchema), mapPinController.createPin);
router.delete("/:id", mapPinController.deletePin);

export default router;
