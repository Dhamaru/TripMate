// Lifetime caps for guest accounts on the app's expensive AI paths.
// generationLimiter/aiLimiter (rateLimit.middleware.ts) bound REQUEST
// RATE, which assumes the account persists across the window — for a
// guest, it doesn't: a fresh `POST /auth/guest` is one click, so a rate
// window resets for free by re-guesting. A lifetime counter on the
// account document doesn't have that hole. Real (non-guest) accounts are
// untouched — these middlewares are a no-op for them.
import { Request, Response, NextFunction } from "express";
import fs from "fs";
import { UserModel } from "@shared/schema";

const GUEST_AI_CALL_CAP = 15;
const GUEST_GENERATION_CAP = 1;

const UPGRADE_MESSAGE = (what: string) => ({
  success: false,
  code: "GUEST_QUOTA_EXCEEDED",
  error: `You've used your trial ${what}. Sign in with Google to keep going — your trip comes with you.`,
  upgrade: true,
});

/** Atomic check-and-increment: the $lt condition is IN the query, not a
 * separate read-then-write, so two concurrent requests from the same
 * guest can't both slip through by reading the count before either
 * write lands. */
async function checkAndIncrement(
  userId: string,
  field: "guestAiCalls" | "guestGenerations",
  cap: number,
): Promise<boolean> {
  const updated = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      $or: [{ [field]: { $lt: cap } }, { [field]: { $exists: false } }],
    },
    { $inc: { [field]: 1 } },
  );
  return !!updated;
}

/** Refunds the unit charged by checkAndIncrement when the request never
 * reached real AI work — a 4xx (bad body, controller-side validation
 * that a route-level validate() didn't catch) means nothing was ever
 * generated, so it shouldn't burn a guest's cap-of-1 trial (live-QA
 * finding this session — reproduced on orchestrator/run and
 * generate-itinerary, which validate inside the controller instead of a
 * route-level validate() this middleware could be moved after).
 *
 * Deliberately does NOT refund on 5xx: a 500 can happen after the model
 * was already called and billed (e.g. it returned unparseable output) —
 * refunding those would let a guest retry a real, paid generation
 * indefinitely by forcing failures (security-review finding this
 * session). A 5xx guest failure is a genuine loss of their one trial,
 * same as it would be for a paying user; that's a product tradeoff to
 * revisit only if it turns out to bite real guests often, not a bug. */
function refundOnClientError(
  req: Request,
  res: Response,
  userId: string,
  field: "guestAiCalls" | "guestGenerations",
) {
  res.on("finish", () => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      UserModel.updateOne({ _id: userId }, { $inc: { [field]: -1 } }).catch(() => {});
    }
  });
}

/** Non-middleware form of the same check, for call sites that can't use
 * a plain HTTP status response — e.g. an SSE stream, where EventSource
 * can't read a 402 body at all and just fires a generic connection
 * error, silently swallowing the upgrade message (security/QA review
 * finding this session). Returns the same shape guestAiQuota would have
 * sent as a 402 body, or null if the caller is clear to proceed. */
export async function checkGuestAiQuota(
  userId: string,
): Promise<ReturnType<typeof UPGRADE_MESSAGE> | null> {
  const ok = await checkAndIncrement(userId, "guestAiCalls", GUEST_AI_CALL_CAP);
  return ok ? null : UPGRADE_MESSAGE("Atlas messages");
}

export async function guestAiQuota(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isGuest) return next();
  try {
    const ok = await checkAndIncrement(req.user._id, "guestAiCalls", GUEST_AI_CALL_CAP);
    if (!ok) return res.status(402).json(UPGRADE_MESSAGE("Atlas messages"));
    refundOnClientError(req, res, req.user._id, "guestAiCalls");
    next();
  } catch (err) {
    next(err);
  }
}

export async function guestGenerationQuota(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isGuest) return next();
  try {
    const ok = await checkAndIncrement(req.user._id, "guestGenerations", GUEST_GENERATION_CAP);
    if (!ok) return res.status(402).json(UPGRADE_MESSAGE("AI trip generation"));
    refundOnClientError(req, res, req.user._id, "guestGenerations");
    next();
  } catch (err) {
    next(err);
  }
}

const GUEST_JOURNAL_PHOTO_CAP = 5;

/** Atomically reserves `count` units of the guest's lifetime photo cap —
 * same $expr-in-the-query trick as checkAndIncrement, generalized to a
 * variable increment (a batch upload adds more than 1 at once). The
 * condition and the write are one query, so two concurrent requests
 * can't both read "4 used" and each add more, landing past the cap
 * (TOCTOU found by security review this session — the previous version
 * counted JournalEntryModel.find() results, read-then-decide, no
 * atomicity). */
async function reservePhotoQuota(userId: string, count: number): Promise<boolean> {
  const updated = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      $expr: {
        $lte: [{ $add: [{ $ifNull: ["$guestJournalPhotos", 0] }, count] }, GUEST_JOURNAL_PHOTO_CAP],
      },
    },
    { $inc: { guestJournalPhotos: count } },
  );
  return !!updated;
}

/** Cheap pre-multer optimization only — rejects a guest already at/over
 * cap before spending a disk write, using the same counter the atomic
 * post-upload reservation uses (not a live JournalEntryModel scan).
 * Not the real bound: this reads without reserving, so it can't stop a
 * batch that pushes past the cap — guestJournalPhotoQuotaPostUpload
 * (below), which does reserve atomically, is what actually enforces
 * the cap. */
export async function guestJournalPhotoQuota(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isGuest) return next();
  try {
    const user = await UserModel.findById(req.user._id, { guestJournalPhotos: 1 }).lean();
    if ((user?.guestJournalPhotos ?? 0) >= GUEST_JOURNAL_PHOTO_CAP) {
      return res.status(402).json(UPGRADE_MESSAGE("journal photo limit"));
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Runs AFTER multer, so req.files is populated — atomically reserves
 * this batch's photo count against the guest's lifetime cap; deletes
 * the just-written files and rejects if the reservation fails. */
export async function guestJournalPhotoQuotaPostUpload(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user?.isGuest) return next();
  const uploaded = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (uploaded.length === 0) return next();
  try {
    const ok = await reservePhotoQuota(req.user._id, uploaded.length);
    if (!ok) {
      for (const f of uploaded) {
        fs.unlink(f.path, (err) => {
          if (err) console.error(`[guestJournalPhotoQuota] failed to delete ${f.path}:`, err);
        });
      }
      return res.status(402).json(UPGRADE_MESSAGE("journal photo limit"));
    }
    // Reservation succeeded — if the entry itself then fails to save
    // (e.g. a Mongoose validation error in createEntry), give the
    // reserved units back so a failed save doesn't permanently cost a
    // guest photos they never actually got to keep, same reasoning as
    // refundOnClientError above. Note: this does NOT clean up the
    // now-orphaned files multer already wrote to disk on that failure
    // path — a pre-existing gap in createEntry/updateEntry unrelated to
    // guest quotas (neither cleans up req.files on a later validation
    // error), out of scope here.
    res.on("finish", () => {
      if (res.statusCode >= 400 && res.statusCode < 500) {
        UserModel.updateOne(
          { _id: req.user!._id },
          { $inc: { guestJournalPhotos: -uploaded.length } },
        ).catch(() => {});
      }
    });
    next();
  } catch (err) {
    for (const f of uploaded) {
      fs.unlink(f.path, (unlinkErr) => {
        if (unlinkErr)
          console.error(`[guestJournalPhotoQuota] failed to delete ${f.path}:`, unlinkErr);
      });
    }
    next(err);
  }
}
