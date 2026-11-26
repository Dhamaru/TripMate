import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { MapPinModel } from "@shared/schema";
import { NotFoundError, ForbiddenError } from "../errors";

export const getPins = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const pins = await MapPinModel.find({ userId }).sort({ createdAt: -1 });
  res.json(pins);
});

export const createPin = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { lat, lng, name, note, color } = req.body;
  const pin = await MapPinModel.create({ userId, lat, lng, name, note, color });
  res.status(201).json(pin);
});

export const deletePin = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const pin = await MapPinModel.findById(req.params.id);
  if (!pin) throw new NotFoundError("Pin not found");
  if (pin.userId !== userId.toString()) throw new ForbiddenError("Insufficient permissions");
  await MapPinModel.deleteOne({ _id: req.params.id });
  res.status(204).send();
});
