import { Router } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Standard emergency numbers and local safety info
router.get("/:query?", requireAuth, (req, res) => {
    const query = req.params.query?.toLowerCase() || "";
    
    const emergencyInfo = {
        general: {
            police: "100",
            ambulance: "102",
            fire: "101",
            national_emergency: "112"
        },
        search_results: query ? [
            { category: "Medical", name: "Local Hospital", contact: "Contact via local search" },
            { category: "Safety", name: "Tourist Police", contact: "1579" }
        ] : []
    };

    res.json(emergencyInfo);
});

export default router;
