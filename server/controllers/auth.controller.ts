import { Request, Response, NextFunction } from "express";
import {
  UserModel,
  SessionModel,
  TripModel,
  JournalEntryModel,
  PackingListModel,
  PackingListTemplateModel,
  AtlasConversationModel,
  NotificationModel,
  MapPinModel,
  FeedbackModel,
} from "@shared/schema";
import { AgentJob } from "../models/AgentJob";
import { TripSuggestion } from "../models/TripSuggestion";
import { UserMemoryModel } from "../services/UserMemoryService";
import { BadRequestError, UnauthorizedError, NotFoundError, TooManyRequestsError } from "../errors";
import { hashPassword, comparePasswords } from "../auth";
import { nanoid } from "nanoid";
import { config } from "../config";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getFrontendBaseUrl } from "../urls";
import { storage } from "../storage";

const JWT_EXPIRY = "7d";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const ALLOWED_PROFILE_FIELDS = new Set([
  "firstName",
  "lastName",
  "phoneNumber",
  "homeCity",
  "dietaryPreferences",
  "interests",
  "preferredTransport",
  "travelStyle",
  "mutedNotificationTypes",
]);

function setAuthCookie(req: Request, res: Response, token: string) {
  const isLocalhost = req.hostname === "localhost" || req.hostname === "127.0.0.1";
  const isSecure = config.NODE_ENV === "production" && !isLocalhost;

  res.cookie("token", token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

function clearAuthCookie(res: Response) {
  res.clearCookie("token", { path: "/" });
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signToken(userId: string, sessionId: string, extra: Record<string, unknown> = {}) {
  return jwt.sign({ sub: userId, sid: sessionId, ...extra }, config.JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
}

/** Issues a token AND its backing SessionModel row in one call — every
 * signin/signup/reset path needs both, and previously only the stateless
 * JWT existed, which meant "log out this other device" was structurally
 * impossible (nothing tracked which tokens were live). */
async function issueSession(req: Request, userId: string, extra: Record<string, unknown> = {}) {
  const sessionId = nanoid();
  const token = signToken(userId, sessionId, extra);
  const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE);
  await SessionModel.create({
    userId,
    sessionId,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    expiresAt,
    revoked: false,
  });
  return token;
}

export const signup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      if (existingUser.password) throw new BadRequestError("User already exists");
      // Google-authed user with no password yet — this is an unauthenticated
      // public endpoint, so we can't just set whatever password the caller
      // supplied (that was a full account-takeover: anyone who knew a
      // Google user's email could set their password here with no proof of
      // ownership). Route through the same email-token flow forgotPassword
      // already uses instead — it proves the caller controls the inbox
      // before any password is set.
      const resetToken = crypto.randomBytes(32).toString("hex");
      // The raw token only ever needs to exist in the emailed URL — storing
      // it verbatim in Mongo means any DB read (backup, snapshot, breach)
      // hands over a working account-takeover token for every pending
      // reset. Store its hash instead, same pattern SessionModel.tokenHash
      // already uses.
      existingUser.resetPasswordToken = hashResetToken(resetToken);
      existingUser.resetPasswordExpires = new Date(Date.now() + 3_600_000);
      await existingUser.save();
      const { sendPasswordResetEmail } = await import("../email");
      await sendPasswordResetEmail(existingUser.email!, resetToken);
      return res.status(200).json({
        message: "This email already has an account. We've sent a link to set a password for it.",
      });
    }

    let user;
    try {
      user = await UserModel.create({
        _id: nanoid(),
        email: normalizedEmail,
        password: await hashPassword(password),
        firstName,
        lastName,
      });
    } catch (err: any) {
      // The findOne check above and this create() aren't atomic — two
      // concurrent signups with the same email can both pass the check.
      // The unique index on email (shared/schema.ts) is what actually
      // closes that race; translate its E11000 into the same user-facing
      // error the findOne branch above already gives, instead of a raw 500.
      if (err?.code === 11000) throw new BadRequestError("User already exists");
      throw err;
    }

    const token = await issueSession(req, user.id);
    setAuthCookie(req, res, token);
    req.login(user, (err) => {
      if (err) console.warn("[Auth] Session init failed (non-fatal):", err?.message);
      res.status(201).json({ user, token });
    });
  } catch (error) {
    next(error);
  }
};

export const guestSignin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const guestId = `guest_${nanoid()}`;
    const user = await UserModel.create({
      _id: guestId,
      email: `${guestId}@tripmate.guest`,
      firstName: "Guest",
      lastName: "Traveler",
      isGuest: true,
    });

    const token = await issueSession(req, user.id, { isGuest: true });
    setAuthCookie(req, res, token);
    req.login(user, (err) => {
      if (err) console.warn("[Auth] Guest session init failed (non-fatal):", err?.message);
      res.json({ user, token });
    });
  } catch (error) {
    next(error);
  }
};

export const signin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const user = await UserModel.findOne({ email: normalizedEmail });

    // Return same error for both "not found" and "wrong password" — prevents user enumeration
    const invalidCreds = () => {
      throw new UnauthorizedError("Invalid credentials");
    };

    if (!user || !user.password) return invalidCreds();

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      throw new TooManyRequestsError("Account temporarily locked. Please try again later.");
    }

    const isMatch = await comparePasswords(password, user.password);
    if (!isMatch) {
      const nextAttempts = (user.failedLoginAttempts ?? 0) + 1;
      if (nextAttempts >= config.ACCOUNT_LOCK_MAX_ATTEMPTS) {
        user.failedLoginAttempts = 0;
        user.lockUntil = new Date(Date.now() + config.ACCOUNT_LOCK_DURATION_MS);
      } else {
        user.failedLoginAttempts = nextAttempts;
      }
      await user.save();
      return invalidCreds();
    }

    // Reset lockout on success
    if ((user.failedLoginAttempts ?? 0) > 0) user.failedLoginAttempts = 0;
    if (user.lockUntil) user.lockUntil = undefined;
    await user.save();

    const token = await issueSession(req, user.id);
    setAuthCookie(req, res, token);
    req.login(user, (err) => {
      if (err) console.warn("[Auth] Session init failed (non-fatal):", err?.message);
      res.json({ user, token });
    });
  } catch (error) {
    next(error);
  }
};

export const signout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.token;
    if (token) {
      // jwt.decode() doesn't check the signature — a forged/tampered cookie
      // with an arbitrary sid would still get its target session revoked.
      // jwt.verify() only proceeds for a token this server actually signed.
      const decoded = jwt.verify(token, config.JWT_SECRET) as { sid?: string };
      if (decoded?.sid) {
        await SessionModel.updateOne({ sessionId: decoded.sid }, { revoked: true });
      }
    }
  } catch {
    // Non-fatal — logging out should still succeed even if the cookie is
    // missing, expired, or fails verification
  }
  clearAuthCookie(res);
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("sid");
      res.json({ message: "Signed out successfully" });
    });
  });
};

export const googleCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const frontendBaseUrl = getFrontendBaseUrl(req);
    const user = req.user as any;
    if (!user) return res.redirect(`${frontendBaseUrl}/signin?error=auth_failed`);

    const userId = user._id || user.id;
    if (!userId) return res.redirect(`${frontendBaseUrl}/signin?error=auth_failed`);

    const token = await issueSession(req, userId);
    setAuthCookie(req, res, token);
    res.redirect(`${frontendBaseUrl}/app/home`);
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    // Always return the same response — prevents email enumeration
    const genericResponse = {
      message: "If this email is registered, a password reset link has been sent.",
    };

    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json(genericResponse);

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = hashResetToken(token);
    user.resetPasswordExpires = new Date(Date.now() + 3_600_000); // 1 hour
    await user.save();

    const { sendPasswordResetEmail } = await import("../email");
    await sendPasswordResetEmail(user.email!, token);

    res.json(genericResponse);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body;
    const user = await UserModel.findOne({
      resetPasswordToken: hashResetToken(token),
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) throw new BadRequestError("Invalid or expired reset token");

    user.password = await hashPassword(password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    // changePassword already revokes the old session on rotation — a
    // forgot-password reset is the same kind of credential rotation and
    // needs the same treatment, or a session an attacker already holds
    // stays valid for up to 7 more days after the "legitimate" reset.
    await SessionModel.updateMany({ userId: user.id }, { revoked: true });

    res.json({ message: "Password has been reset. You can now sign in." });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?._id || (req.user as any)?.id || (req.user as any)?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only allow safe profile fields — prevent privilege escalation
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => ALLOWED_PROFILE_FIELDS.has(key)),
    );

    if (Object.keys(updates).length === 0) {
      throw new BadRequestError("No valid fields to update");
    }

    const user = await UserModel.findByIdAndUpdate(
      req.user!._id,
      { $set: updates },
      { new: true, runValidators: true },
    );
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await UserModel.findById(req.user!._id);
    if (!user || !user.password) throw new UnauthorizedError("Invalid user or credentials");
    const isMatch = await comparePasswords(currentPassword, user.password);
    if (!isMatch) throw new UnauthorizedError("Incorrect current password");
    user.password = await hashPassword(newPassword);
    await user.save();
    // Rotate cookie token after password change — revoke the old session
    // too, not just swap the cookie, so a stolen pre-change token can't
    // keep working after the user thinks they've secured their account.
    const oldToken = req.cookies?.token;
    if (oldToken) {
      try {
        // jwt.decode() doesn't check the signature — the same gap fixed in
        // signout applies here: a forged cookie's sid would target and
        // revoke an arbitrary session. Isolated in its own try/catch (unlike
        // signout, this runs after user.save() already succeeded) so an
        // expired-but-otherwise-fine old cookie doesn't turn a successful
        // password change into an error response.
        const decoded = jwt.verify(oldToken, config.JWT_SECRET) as { sid?: string };
        if (decoded?.sid)
          await SessionModel.updateOne({ sessionId: decoded.sid }, { revoked: true });
      } catch {
        // Non-fatal — the new session issued below still supersedes it
      }
    }
    const token = await issueSession(req, user.id);
    setAuthCookie(req, res, token);
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
};

export const uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // req.file only — a JSON-body `avatar` string fallback used to be
    // accepted here too, but it bypassed multer's imageFileFilter
    // (MIME/extension check) and 5MB size limit entirely, and neither real
    // client caller (CropImage.tsx, Profile.tsx) ever sends the field that
    // way — both always upload real multipart FormData. Removed the dead,
    // unsafe fallback rather than leave an unused hole in the validation.
    if (!req.file) throw new BadRequestError("No avatar provided");
    // Stored as a data URI directly in the User document — see the multer
    // memoryStorage comment in auth.routes.ts for why this isn't written
    // to disk. <img src> renders a data: URI exactly like a normal URL, no
    // client changes needed.
    const avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    // Two fields have historically tracked the user's picture: `avatar`
    // (set by this upload flow) and `profileImageUrl` (set at signup, e.g.
    // from Google OAuth). The sidebar/topbar/bottom-nav (Layout.tsx) read
    // only `profileImageUrl`, so a crop upload that wrote just `avatar`
    // silently diverged from what those surfaces show. Write both so every
    // avatar-reading surface reflects the new picture.
    const user = await UserModel.findByIdAndUpdate(
      req.user!._id,
      { avatar: avatarUrl, profileImageUrl: avatarUrl },
      { new: true },
    );
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const exportUserData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;

    const [
      user,
      trips,
      journalEntries,
      packingLists,
      packingListTemplates,
      atlasConversations,
      notifications,
      feedback,
      mapPins,
      agentJobs,
      tripSuggestions,
      memory,
    ] = await Promise.all([
      UserModel.findById(userId)
        .select("-password -resetPasswordToken -resetPasswordExpires")
        .lean(),
      TripModel.find({ userId }).lean(),
      JournalEntryModel.find({ userId }).lean(),
      PackingListModel.find({ userId }).lean(),
      PackingListTemplateModel.find({ userId }).lean(),
      AtlasConversationModel.find({ userId }).lean(),
      NotificationModel.find({ userId }).lean(),
      FeedbackModel.find({ userId }).lean(),
      MapPinModel.find({ userId }).lean(),
      AgentJob.find({ userId }).lean(),
      TripSuggestion.find({ userId }).lean(),
      UserMemoryModel.findOne({ userId }).lean(),
    ]);

    if (!user) throw new NotFoundError("User not found");

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: user,
      trips,
      journalEntries,
      packingLists,
      packingListTemplates,
      atlasConversations,
      notifications,
      feedback,
      mapPins,
      agentJobs,
      tripSuggestions,
      memory,
    };

    const filename = `tripmate-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password, confirm } = req.body;
    const user = await UserModel.findById(req.user!._id);
    if (!user) throw new NotFoundError("User not found");

    if (user.password) {
      // Password-based account: require current password
      if (!password) throw new BadRequestError("Password required to delete account");
      const isMatch = await comparePasswords(password, user.password);
      if (!isMatch) throw new UnauthorizedError("Incorrect password");
    } else {
      // OAuth account (no password): require explicit confirmation string
      if (confirm !== "DELETE") {
        throw new BadRequestError('Send confirm: "DELETE" to confirm account deletion');
      }
    }

    // Previously only User + Session rows were removed — every trip, journal
    // entry, packing list, Atlas conversation, notification, and feedback
    // row the account owned was left behind permanently (a GDPR right-to-
    // erasure gap, and orphaned data that could resurface elsewhere, e.g. a
    // deleted user's old trip still matching a collaborator-list query). A
    // first pass at this cascade matched exportUserData's model list, but
    // that list itself was incomplete — MapPin, CrowdDensity, AgentJob, and
    // TripSuggestion all carry a userId field too and were still orphaned.
    const deletedUserId = req.user!._id;
    await Promise.all([
      TripModel.deleteMany({ userId: deletedUserId }),
      JournalEntryModel.deleteMany({ userId: deletedUserId }),
      PackingListModel.deleteMany({ userId: deletedUserId }),
      PackingListTemplateModel.deleteMany({ userId: deletedUserId }),
      AtlasConversationModel.deleteMany({ userId: deletedUserId }),
      NotificationModel.deleteMany({ userId: deletedUserId }),
      FeedbackModel.deleteMany({ userId: deletedUserId }),
      SessionModel.deleteMany({ userId: deletedUserId }),
      MapPinModel.deleteMany({ userId: deletedUserId }),
      // CrowdDensityModel deliberately excluded — ICrowdDensity has no
      // userId field at all (it's anonymous by design: lat/lng/density/
      // timestamp/placeId/source only), so a userId-keyed delete against it
      // was a permanent, silent no-op that misrepresented the data model.
      AgentJob.deleteMany({ userId: deletedUserId }),
      TripSuggestion.deleteMany({ userId: deletedUserId }),
      UserMemoryModel.deleteMany({ userId: deletedUserId }),
      // TripModel.deleteMany above only removes trips this account owned —
      // a trip they were invited onto as a collaborator belongs to someone
      // else and stays, but the deleted account's userId was lingering
      // forever in that trip's collaborators array (a phantom participant
      // other real collaborators would still see listed).
      TripModel.updateMany(
        { "collaborators.userId": deletedUserId },
        { $pull: { collaborators: { userId: deletedUserId } } },
      ),
    ]);
    await UserModel.findByIdAndDelete(deletedUserId);
    clearAuthCookie(res);
    req.session.destroy(() => res.json({ message: "Account deleted successfully" }));
  } catch (error) {
    next(error);
  }
};
