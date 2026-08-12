import { Request, Response, NextFunction } from "express";
import {
  UserModel, SessionModel, TripModel, JournalEntryModel,
  PackingListModel, PackingListTemplateModel, AtlasConversationModel,
  NotificationModel, FeedbackModel,
} from "@shared/schema";
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
  "firstName", "lastName", "phoneNumber", "homeCity",
  "dietaryPreferences", "interests", "preferredTransport", "travelStyle",
  "mutedNotificationTypes",
]);

function setAuthCookie(req: Request, res: Response, token: string) {
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
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

function signToken(userId: string, sessionId: string, extra: Record<string, unknown> = {}) {
  return jwt.sign({ sub: userId, sid: sessionId, ...extra }, config.JWT_SECRET, { expiresIn: JWT_EXPIRY });
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
      // Google-authed user setting a password for the first time
      existingUser.password = await hashPassword(password);
      existingUser.firstName = existingUser.firstName || firstName;
      existingUser.lastName = existingUser.lastName || lastName;
      await existingUser.save();
      const token = await issueSession(req, existingUser.id);
      setAuthCookie(req, res, token);
      return res.status(200).json({ user: existingUser, token });
    }

    const user = await UserModel.create({
      _id: nanoid(),
      email: normalizedEmail,
      password: await hashPassword(password),
      firstName,
      lastName,
    });

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
    const invalidCreds = () => { throw new UnauthorizedError("Invalid credentials"); };

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
      const decoded = jwt.decode(token) as { sid?: string } | null;
      if (decoded?.sid) {
        await SessionModel.updateOne({ sessionId: decoded.sid }, { revoked: true });
      }
    }
  } catch {
    // Non-fatal — logging out should still succeed even if revocation lookup fails
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
    const genericResponse = { message: "If this email is registered, a password reset link has been sent." };

    const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json(genericResponse);

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
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
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) throw new BadRequestError("Invalid or expired reset token");

    user.password = await hashPassword(password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

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
      Object.entries(req.body).filter(([key]) => ALLOWED_PROFILE_FIELDS.has(key))
    );

    if (Object.keys(updates).length === 0) {
      throw new BadRequestError("No valid fields to update");
    }

    const user = await UserModel.findByIdAndUpdate(
      req.user!._id,
      { $set: updates },
      { new: true, runValidators: true }
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
      const decoded = jwt.decode(oldToken) as { sid?: string } | null;
      if (decoded?.sid) await SessionModel.updateOne({ sessionId: decoded.sid }, { revoked: true });
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
    let avatarUrl = req.body.avatar as string | undefined;
    if (req.file) avatarUrl = `/uploads/${req.file.filename}`;
    if (!avatarUrl) throw new BadRequestError("No avatar provided");

    const user = await UserModel.findByIdAndUpdate(
      req.user!._id,
      { avatar: avatarUrl },
      { new: true }
    );
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const exportUserData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;

    const [user, trips, journalEntries, packingLists, packingListTemplates, atlasConversations, notifications, feedback] =
      await Promise.all([
        UserModel.findById(userId).select("-password -resetPasswordToken -resetPasswordExpires").lean(),
        TripModel.find({ userId }).lean(),
        JournalEntryModel.find({ userId }).lean(),
        PackingListModel.find({ userId }).lean(),
        PackingListTemplateModel.find({ userId }).lean(),
        AtlasConversationModel.find({ userId }).lean(),
        NotificationModel.find({ userId }).lean(),
        FeedbackModel.find({ userId }).lean(),
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

    await UserModel.findByIdAndDelete(req.user!._id);
    await SessionModel.deleteMany({ userId: req.user!._id });
    clearAuthCookie(res);
    req.session.destroy(() => res.json({ message: "Account deleted successfully" }));
  } catch (error) {
    next(error);
  }
};
