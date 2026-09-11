// One-time, run-once-ever startup tasks — gated by MigrationModel so a
// redeploy or a Render free-tier spin-down/wake cycle never re-runs one.
// Called from server/index.ts's startServer(), after the DB connects and
// before the server accepts requests.
import { JournalEntryModel, NotificationModel, UserModel, MigrationModel } from "@shared/schema";

// Same exclusion the public stats/landing-page counts already use — a
// throwaway QA/example account or a guest session shouldn't get a "we
// fixed things" notice about an account they're not really using.
const QA_EMAIL_RE = /@(example\.com|tripmate\.dev)$/i;

async function runOnce(key: string, task: () => Promise<string>) {
  const already = await MigrationModel.findOne({ key });
  if (already) return;
  try {
    const result = await task();
    await MigrationModel.create({ key });
    console.log(`[Migration] ${key}: ${result}`);
  } catch (err) {
    // Don't record the key on failure — worth another attempt next boot
    // rather than silently never running.
    console.error(`[Migration] ${key} failed, will retry next startup:`, err);
  }
}

// Journal photos moved from disk (ephemeral on Render — wiped on every
// redeploy and on 15-minute idle spin-down) to a base64 data URI stored
// directly on the document. Existing entries created before this fix still
// reference the old /api/v1/journal/photo/:filename shape; those files are
// already gone or will be within minutes, with no way to recover the
// original bytes from here. Tell each affected user once so they know to
// re-open and re-save (or re-upload into) those specific entries.
async function notifyLegacyJournalPhotoUsers(): Promise<string> {
  const affected = await JournalEntryModel.find({
    photos: { $regex: "^/api/v1/journal/photo/" },
  }).select("userId");
  const userIds = [...new Set(affected.map((e) => e.userId))];
  if (userIds.length === 0) return "no affected entries";

  const users = await UserModel.find({ _id: { $in: userIds } }).select("_id email isGuest");
  const realUsers = users.filter((u) => !u.isGuest && !QA_EMAIL_RE.test(u.email || ""));

  await NotificationModel.insertMany(
    realUsers.map((u) => ({
      userId: u._id,
      type: "announcement",
      title: "Action needed: some journal photos may be lost",
      message:
        "We found and fixed a bug where journal photos could disappear after a server update. Some of your existing entries may have lost their photo — please open Journal, check any older entries, and re-upload the photo if it's missing. New uploads are now stored safely and won't be affected again.",
      link: "/app/journal",
    })),
  );
  return `notified ${realUsers.length} user(s) across ${userIds.length} affected account(s)`;
}

// One-time welcome/changelog notice for the acceptance-review fix round —
// explicitly requested as a check that the notification pipeline reaches
// real users end to end, not just a trip-scoped event.
async function broadcastFixAnnouncement(): Promise<string> {
  const users = await UserModel.find({
    isGuest: { $ne: true },
    email: { $not: QA_EMAIL_RE },
  }).select("_id");
  if (users.length === 0) return "no real users to notify";

  await NotificationModel.insertMany(
    users.map((u) => ({
      userId: u._id,
      type: "announcement",
      title: "Welcome back — TripMate just got a round of fixes",
      message:
        "Thanks for using TripMate! We just shipped a batch of fixes: destination photos on the homepage, a dark-mode display bug, safer trip voting, offline map tiles, a Windows desktop app with auto-update, and journal photos now stored more reliably. Please refresh the app (or update the desktop app if you installed it) to get the latest version.",
      link: "/app/home",
    })),
  );
  return `broadcast to ${users.length} real user(s)`;
}

export async function runStartupMigrations() {
  await runOnce("2026-09-11-notify-legacy-journal-photos", notifyLegacyJournalPhotoUsers);
  await runOnce("2026-09-11-broadcast-fix-announcement", broadcastFixAnnouncement);
}
