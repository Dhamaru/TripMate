import { Router } from "express";
import rateLimit from "express-rate-limit";
import logger from "../logger";

const router = Router();

const logsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
});
router.use(logsLimiter);

function sanitizeEvent(event: unknown): string {
    return String(event ?? "").replace(/[\r\n\t]/g, " ").slice(0, 200);
}

router.post("/logs/info", (req, res) => {
    logger.info(`[client] ${sanitizeEvent(req.body?.event)}`, req.body?.payload);
    res.status(204).send();
});

router.post("/logs/error", (req, res) => {
    logger.error(`[client] ${sanitizeEvent(req.body?.event)}`, req.body?.payload);
    res.status(204).send();
});

export default router;
