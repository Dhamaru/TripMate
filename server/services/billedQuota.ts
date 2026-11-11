// Daily ceilings on billed Google calls (Places, Photos, Translate).
// Per-IP rate limits live in memory and reset on every restart; these
// counters live in Mongo, so they hold across restarts and across IPs.
// Every billed Google request outside Atlas goes through googleFetch().

import mongoose, { Schema } from "mongoose";
import { config } from "../config";

interface IUsageCounter {
  _id: string; // "<scope>:<YYYY-MM-DD>"
  count: number;
  expiresAt: Date;
}

const usageCounterSchema = new Schema<IUsageCounter>(
  {
    _id: { type: String },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, expires: 0 },
  },
  { versionKey: false },
);

export const UsageCounterModel =
  (mongoose.models.UsageCounter as mongoose.Model<IUsageCounter>) ||
  mongoose.model<IUsageCounter>("UsageCounter", usageCounterSchema);

export type QuotaUser = { _id?: unknown; id?: unknown; isGuest?: boolean } | null | undefined;

/** Add `by` to today's counter for `scope` and return the new total. */
export async function bump(scope: string, by = 1): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const doc = await UsageCounterModel.findOneAndUpdate(
    { _id: `${scope}:${day}` },
    { $inc: { count: by }, $setOnInsert: { expiresAt: new Date(Date.now() + 2 * 86400000) } },
    { upsert: true, new: true },
  ).lean();
  return doc?.count ?? Infinity;
}

/**
 * Reserve one billed Google call for this user (or an anonymous caller).
 * Fails closed: no database connection means no billed call.
 */
export async function takeGoogleQuota(user?: QuotaUser): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    // Per-user cap first: calls refused there must not use up the site-wide
    // budget, or one account hammering past its cap would lock everyone out.
    const uid = user?._id ?? user?.id;
    if (uid) {
      const max = user?.isGuest ? config.GOOGLE_DAILY_GUEST_MAX : config.GOOGLE_DAILY_USER_MAX;
      if ((await bump(`google:user:${String(uid)}`)) > max) return false;
    }
    return (await bump("google:global")) <= config.GOOGLE_DAILY_GLOBAL_MAX;
  } catch (err) {
    console.warn("[billedQuota] counter failed, refusing billed call:", (err as Error).message);
    return false;
  }
}

/** fetch() for a billed Google URL: checks the daily quota and times out after 10s. */
export async function googleFetch(url: string, user?: QuotaUser, init?: RequestInit) {
  if (!(await takeGoogleQuota(user))) return null;
  return fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
}
