import { Request, Response, NextFunction } from "express";
import { PushSubscriptionModel } from "@shared/schema";
import { config } from "../config";
import { BadRequestError } from "../errors";

export const getVapidPublicKey = (_req: Request, res: Response) => {
  // Not a secret — the public key is meant to travel to every browser
  // that subscribes (that's literally what the Push API does with it).
  res.json({ publicKey: config.VAPID_PUBLIC_KEY || null });
};

export const subscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.user?._id || req.user?.id);
    const { endpoint, keys } = req.body?.subscription || req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new BadRequestError("A valid push subscription (endpoint + keys) is required");
    }
    // Upsert on endpoint: re-subscribing (e.g. the browser silently rotated
    // the endpoint) updates in place instead of piling up duplicate rows,
    // and correctly re-points an endpoint that switched to a new account
    // on a shared device.
    await PushSubscriptionModel.findOneAndUpdate(
      { endpoint },
      { userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      { upsert: true, new: true },
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const unsubscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.user?._id || req.user?.id);
    const { endpoint } = req.body || {};
    if (!endpoint) throw new BadRequestError("endpoint is required");
    await PushSubscriptionModel.deleteOne({ endpoint, userId });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
