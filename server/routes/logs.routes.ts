import { Router } from "express";
import logger from "../logger";

const router = Router();

router.post("/logs/info", (req, res) => {
  logger.info(`[client] ${req.body?.event}`, req.body?.payload);
  res.status(204).send();
});

router.post("/logs/error", (req, res) => {
  logger.error(`[client] ${req.body?.event}`, req.body?.payload);
  res.status(204).send();
});

export default router;
