import { Router } from "express";
import {
    generatePackingList,
    createPackingList,
    getPackingLists,
    updatePackingList,
    deletePackingList,
    updatePackingItem,
    togglePackingItem,
} from "../controllers/packing.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate";
import { createPackingListSchema } from "../schemas/packing.schemas";

const router = Router();

router.use(requireAuth);

router.post("/trips/:id/packing", generatePackingList);
router.post("/packing", validate(createPackingListSchema), createPackingList);
router.get("/packing", getPackingLists);
router.put("/packing/:id", updatePackingList);
router.delete("/packing/:id", deletePackingList);
router.patch("/packing/:id/items/:itemId", updatePackingItem);
router.patch("/packing/:id/items/:itemId/toggle", togglePackingItem);

export default router;
