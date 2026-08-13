import { Router } from "express";
import * as mapPinController from "../controllers/mapPin.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", mapPinController.getPins);
router.post("/", mapPinController.createPin);
router.delete("/:id", mapPinController.deletePin);

export default router;
