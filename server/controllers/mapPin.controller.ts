import { Request, Response, NextFunction } from "express";
import { MapPinModel } from "@shared/schema";
import { NotFoundError, ForbiddenError } from "../errors";

export const getPins = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const pins = await MapPinModel.find({ userId }).sort({ createdAt: -1 });
        res.json(pins);
    } catch (error) {
        next(error);
    }
};

export const createPin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const { lat, lng, name, note, color } = req.body;
        const pin = await MapPinModel.create({ userId, lat, lng, name, note, color });
        res.status(201).json(pin);
    } catch (error) {
        next(error);
    }
};

export const deletePin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const pin = await MapPinModel.findById(req.params.id);
        if (!pin) throw new NotFoundError("Pin not found");
        if (pin.userId !== userId.toString()) throw new ForbiddenError("Insufficient permissions");
        await MapPinModel.deleteOne({ _id: req.params.id });
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};
