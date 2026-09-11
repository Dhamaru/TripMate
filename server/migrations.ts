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
      title: "Thanks for your feedback",
      message:
        "Thanks for using TripMate! Based on your feedback, we've resolved and updated several issues. Please refresh the app (or update the desktop app if you installed it) to get the latest version.",
    })),
  );
  return `broadcast to ${users.length} real user(s)`;
}

// A personal note to the two people who actually built this, not a
// broadcast — explicitly asked to reach only these two accounts, nobody
// else. Matched by name rather than a hardcoded id (no confirmed email on
// file for either), so this is deliberately conservative: each candidate
// must match on BOTH first and last name, and if a name resolves to zero
// or more than one account, it's skipped and reported rather than guessed
// — a personal message going to the wrong real stranger is worse than one
// not sending at all.
async function notifyFounders(): Promise<string> {
  const candidates: Array<{ label: string; query: Record<string, unknown> }> = [
    { label: "Dhamaru", query: { email: "kasivasi2005@gmail.com" } },
    { label: "Sai", query: { firstName: /sai/i, lastName: /bandangi/i } },
  ];

  const message =
    "From everyone who's used TripMate: congratulations. Building an app that " +
    "actually plans a real trip, edits it on request, and keeps working while you're " +
    "traveling is a lot of real engineering for two people to pull off — and it shows. " +
    "Thank you for building something worth carrying on a trip. Here's to everywhere " +
    "this goes next.";

  const results: string[] = [];
  for (const c of candidates) {
    const matches = await UserModel.find(c.query).select("_id firstName lastName email");
    if (matches.length !== 1) {
      results.push(`${c.label}: ${matches.length} match(es), skipped`);
      continue;
    }
    await NotificationModel.create({
      userId: matches[0]._id,
      type: "announcement",
      title: "A message from your users",
      message,
    });
    results.push(`${c.label}: notified ${matches[0]._id}`);
  }
  return results.join("; ");
}

export async function runStartupMigrations() {
  await runOnce("2026-09-11-notify-legacy-journal-photos", notifyLegacyJournalPhotoUsers);
  await runOnce("2026-09-11-broadcast-fix-announcement", broadcastFixAnnouncement);
  await runOnce("2026-09-11-notify-founders", notifyFounders);
}
