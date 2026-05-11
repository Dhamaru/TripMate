import { Router } from "express";
import { generatePackingList, createPackingList, getPackingLists } from "../controllers/packing.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

router.post("/trips/:id/packing", generatePackingList);
router.post("/packing", createPackingList);
router.get("/packing", getPackingLists);

export default router;
