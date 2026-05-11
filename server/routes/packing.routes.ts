import { Router } from "express";
import { generatePackingList, createPackingList, getPackingLists } from "../controllers/packing.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate";
import { createPackingListSchema } from "../schemas/packing.schemas";

const router = Router();

router.use(requireAuth);

router.post("/trips/:id/packing", generatePackingList);
router.post("/packing", validate(createPackingListSchema), createPackingList);
router.get("/packing", getPackingLists);

export default router;
