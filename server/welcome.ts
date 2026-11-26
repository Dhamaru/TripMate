// Fired once, right after a brand-new account is created (password signup,
// guest, or a first-time Google sign-in) — see the 3 call sites in
// auth.controller.ts and auth.ts. A separate tiny module rather than 3
// duplicated inline NotificationModel.create calls so the copy can't drift.
import { NotificationModel } from "@shared/schema";

export async function sendWelcomeNotification(userId: string, firstName?: string) {
  try {
    await NotificationModel.create({
      userId,
      type: "announcement",
      title: firstName ? `Welcome to TripMate, ${firstName}!` : "Welcome to TripMate!",
      message:
        "We're glad you're here — let's plan a trip you'll actually look forward to. Start with a destination and rough dates, and we'll help with the rest.",
      link: "/app/planner",
    });
  } catch (err) {
    // Never let a notification failure break account creation.
    console.error("[Welcome] failed to send welcome notification:", err);
  }
}
