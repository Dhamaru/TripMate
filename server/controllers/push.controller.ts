import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { PushSubscriptionModel } from "@shared/schema";
import { config } from "../config";
import { BadRequestError } from "../errors";

export const getVapidPublicKey = (_req: Request, res: Response) => {
  // Not a secret — the public key is meant to travel to every browser
  // that subscribes (that's literally what the Push API does with it).
  res.json({ publicKey: config.VAPID_PUBLIC_KEY || null });
};

// The server POSTs to this URL on every notification, so it must only ever be
// a real browser push service, never an address the client picked.
const PUSH_HOSTS =
  /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;

export function isPushServiceUrl(endpoint: unknown): boolean {
  try {
    const url = new URL(String(endpoint));
    return url.protocol === "https:" && PUSH_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

export const subscribe = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = String(req.user?._id || req.user?.id);
  const { endpoint, keys } = req.body?.subscription || req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new BadRequestError("A valid push subscription (endpoint + keys) is required");
  }
  if (!isPushServiceUrl(endpoint)) {
    throw new BadRequestError("Unsupported push service");
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
});

export const unsubscribe = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const userId = String(req.user?._id || req.user?.id);
  const { endpoint } = req.body || {};
  if (!endpoint) throw new BadRequestError("endpoint is required");
  await PushSubscriptionModel.deleteOne({ endpoint, userId });
  res.json({ ok: true });
});
