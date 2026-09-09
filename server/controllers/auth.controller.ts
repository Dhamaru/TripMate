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
import { purgeUserData } from "../services/userPurge";
import {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  TooManyRequestsError,
  ForbiddenError,
} from "../errors";
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
  "cuisinePreferences",
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

// Deliberate product decision (not the previous default): this app has no
// self-serve email/password signup anymore. A visitor can only get an
// account via Google (already proves inbox ownership) or a Guest session
// (no password to protect). Anyone submitting a plain email here still
// gets an account row created, but it's inert — no password, emailVerified
// false — until they click the emailed confirmation link and set a
// password there, reusing the exact same token mechanism forgotPassword/
// resetPassword already use rather than building a second one. This also
// closes the gap a security-review pass on the Google-auth fix flagged
// (server/auth.ts): signup used to let anyone register any email with a
// password and no proof they own it.
export const signup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, firstName, lastName } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const genericResponse = {
      message: "Check your email to confirm your account and create a password.",
    };

    let user = await UserModel.findOne({ email: normalizedEmail });
    if (user && user.password && user.emailVerified) {
      throw new BadRequestError("An account with this email already exists. Sign in instead.");
    }

    if (!user) {
      // Guest -> real conversion: /signup has no requireAuth (it's meant
      // for anonymous visitors), so a live guest's cookie isn't decoded
      // into req.user automatically here — check it directly. If found,
      // re-key that SAME account instead of creating a new one at a new
      // _id, so every trip/journal/pin/Atlas conversation the guest
      // already made stays attached (same reasoning as the Google path
      // in server/auth.ts — see its comment for the full rationale).
      let guestUserId: string | null = null;
      const cookieToken = req.cookies?.token;
      if (cookieToken) {
        try {
          const decoded = jwt.verify(cookieToken, config.JWT_SECRET) as {
            sub?: string;
            isGuest?: boolean;
          };
          if (decoded?.isGuest && decoded.sub) guestUserId = decoded.sub;
        } catch {
          // Expired/invalid/no guest cookie — fall through to a normal new account.
        }
      }

      if (guestUserId) {
        const guestUser = await UserModel.findById(guestUserId);
        if (guestUser?.isGuest) {
          guestUser.email = normalizedEmail;
          guestUser.firstName = firstName;
          guestUser.lastName = lastName;
          // isGuest stays true and emailVerified stays false until they
          // actually click the link and set a password (resetPassword
          // flips both) — same trust bar as a brand-new signup, not an
          // instant conversion just for submitting an email.
          user = guestUser;
        }
      }

      if (!user) {
        try {
          user = await UserModel.create({
            _id: nanoid(),
            email: normalizedEmail,
            firstName,
            lastName,
            emailVerified: false,
          });
        } catch (err: any) {
          // findOne + create aren't atomic — same TOCTOU as before, same fix.
          if (err?.code === 11000) {
            throw new BadRequestError(
              "An account with this email already exists. Sign in instead.",
            );
          }
          throw err;
        }
      }
    }

    // The raw token only ever needs to exist in the emailed URL — storing
    // it verbatim in Mongo means any DB read (backup, snapshot, breach)
    // hands over a working account-takeover token. Store its hash instead,
    // same pattern SessionModel.tokenHash already uses.
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = hashResetToken(resetToken);
    user.resetPasswordExpires = new Date(Date.now() + 3_600_000);
    await user.save();
    // Fire-and-forget — don't block the response on external email
    // delivery (same reasoning as the new-login alert below: a slow or
    // unreachable SMTP/Resend endpoint shouldn't turn into a slow or
    // failed signup response).
    import("../email")
      .then(({ sendVerifyAccountEmail }) => sendVerifyAccountEmail(user!.email!, resetToken))
      .catch(() => {});

    // Test-only: the raw token only ever exists in the emailed link (the
    // hash is what's stored) — the test suite has no inbox to read it
    // from, so expose it here exactly like sendPasswordResetEmail already
    // logs the real reset URL to the console as a "Dev/Test Helper".
    // Gated strictly to NODE_ENV==="test", never development/production.
    if (config.NODE_ENV === "test") {
      return res.status(200).json({ ...genericResponse, _devToken: resetToken });
    }
    res.status(200).json(genericResponse);
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
      // Stamped here too, not just on subsequent requests (requireAuth) —
      // a guest who signs in and never makes another authenticated call
      // needs a real baseline, or the purge query's lastSeenAt < cutoff
      // would never match a document where the field was never set.
      lastSeenAt: new Date(),
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

    // Explicit product decision, not the previous default: this app
    // deliberately reveals "no account exists" instead of a generic error.
    // That's normally an anti-enumeration anti-pattern — here it's a
    // trusted-circle app (friends/family) where the clarity ("you need to
    // sign up with Google") matters more than hiding the email list from
    // an attacker who'd have to already be probing this specific app.
    if (!user) throw new UnauthorizedError("No account exists with this email.");

    // Same bucket for two real cases: a brand-new signup that never
    // finished confirming (no password yet), and — because emailVerified
    // defaults false on any document that predates this field — every
    // account that already had a password before this verification
    // requirement existed. Both get the same "confirm your email" gate
    // and a fresh confirmation link, reusing signup's exact mechanism.
    if (!user.password || !user.emailVerified) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      user.resetPasswordToken = hashResetToken(resetToken);
      user.resetPasswordExpires = new Date(Date.now() + 3_600_000);
      await user.save();
      import("../email")
        .then(({ sendVerifyAccountEmail }) => sendVerifyAccountEmail(user.email!, resetToken))
        .catch(() => {});
      throw new UnauthorizedError(
        "Please confirm your email first — we've sent a new confirmation link.",
      );
    }

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
      throw new UnauthorizedError("Incorrect password.");
    }

    // Reset lockout on success
    if ((user.failedLoginAttempts ?? 0) > 0) user.failedLoginAttempts = 0;
    if (user.lockUntil) user.lockUntil = undefined;
    await user.save();

    // New-login alert: check BEFORE issuing this signin's own session row,
    // otherwise it would always find itself and never fire. Only real
    // password-based signins get this check (not signup/guest, which are
    // an account's first session, not a new one alongside existing ones).
    // ponytail: exact User-Agent match is a coarse "new device" signal — a
    // browser version bump changes the UA string and can trigger a false
    // alert. Upgrade path if that proves noisy: parse UA into
    // browser+OS+device-class and compare that instead of the raw string.
    const userAgent = req.headers["user-agent"] || "unknown device";
    const isKnownDevice = user.email
      ? await SessionModel.exists({ userId: user.id, userAgent, revoked: false })
      : true;

    const token = await issueSession(req, user.id);
    setAuthCookie(req, res, token);

    if (!isKnownDevice && user.email) {
      const { sendNewLoginAlertEmail } = await import("../email");
      sendNewLoginAlertEmail(user.email, req.ip || "unknown", userAgent).catch(() => {});
    }

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
    // Clicking the emailed link and setting a password IS the inbox-
    // ownership proof — this endpoint is now also where a brand-new
    // email/password signup completes (see signup below), reusing the
    // exact same token mechanism instead of building a second one.
    user.emailVerified = true;
    // If this account was a guest mid-conversion (signup re-keyed the
    // guest's own row onto the submitted email instead of creating a new
    // one — see signup's comment), this is the moment it actually
    // becomes a real account. A no-op for every other caller (a normal
    // forgot-password reset on an already-real account), since isGuest
    // is already false there.
    user.isGuest = false;
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
    if (!user) throw new UnauthorizedError("Invalid user or credentials");
    if (!user.password) {
      // A Google-only account has never had a password to change — the
      // old generic "Invalid user or credentials" here read as a
      // security refusal, not "there's nothing to compare against yet",
      // and the client bug that swallowed this message entirely (fixed
      // this session, see Profile.tsx) meant a Google user clicking
      // "Update Password" always got an unexplained failure.
      throw new BadRequestError(
        "This account doesn't have a password yet — use 'Forgot password?' on the sign-in page to set one.",
      );
    }
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
    // Guest accounts can't upload an avatar — up to 5MB base64-in-Mongo
    // per anonymous one-click account, zero demo value for a trial
    // session (product/security review this session).
    if (req.user?.isGuest) {
      throw new ForbiddenError("Sign in with Google to set a profile photo.");
    }
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
    // erasure gap, and orphaned data that could resurface elsewhere). Now
    // shared with server/scripts/purgeGuests.ts via purgeUserData — see
    // server/services/userPurge.ts for why this is one implementation, not
    // two copies that could silently drift.
    const deletedUserId = req.user!._id;
    await purgeUserData(deletedUserId);
    clearAuthCookie(res);
    req.session.destroy(() => res.json({ message: "Account deleted successfully" }));
  } catch (error) {
    next(error);
  }
};
