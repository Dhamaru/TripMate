// Deletes guest accounts (and everything they own, via the same cascade
// deleteAccount uses) that have been inactive for 7+ days — matching the
// guest session/JWT lifetime exactly (JWT_EXPIRY = "7d" in
// auth.controller.ts), so nothing still-reachable is ever purged. Before
// this script existed, guest data had no cleanup path at all: once the
// 7-day cookie expired there was no password to sign back in with, so
// the account became permanently unreachable but was never deleted —
// unbounded growth in a database with no accountability behind any of it
// (security review finding this session).
//
// Run manually with `npm run guests:purge`, or wire to a scheduled job
// (e.g. a Render Cron Job hitting this same script). Unlike db:clear,
// this is SAFE to run in production — that's the point of it — so there
// is no NODE_ENV guard. Pass --dry-run to see what would be deleted
// without deleting anything, recommended for the first real run.
import { UserModel } from "@shared/schema";
import { connectDB } from "../db";
import { purgeUserData } from "../services/userPurge";

const INACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function purgeGuests() {
  const dryRun = process.argv.includes("--dry-run");
  await connectDB();

  const cutoff = new Date(Date.now() - INACTIVITY_WINDOW_MS);
  // lastSeenAt is only stamped by guestSignin/requireAuth going forward —
  // any guest created before that shipped has no lastSeenAt at all, and
  // $lt never matches a missing field, so they'd never be purged (found
  // by security review this session). Fall back to createdAt for those.
  const staleGuests = await UserModel.find(
    {
      isGuest: true,
      $or: [
        { lastSeenAt: { $lt: cutoff } },
        { lastSeenAt: { $exists: false }, createdAt: { $lt: cutoff } },
      ],
    },
    { _id: 1, email: 1, lastSeenAt: 1 },
  ).lean();

  if (staleGuests.length === 0) {
    console.log("[guests:purge] No stale guest accounts found.");
    process.exit(0);
  }

  console.log(
    `[guests:purge] ${staleGuests.length} guest account(s) inactive since before ${cutoff.toISOString()}${dryRun ? " (dry run — nothing will be deleted)" : ""}:`,
  );
  for (const g of staleGuests) {
    console.log(`  - ${g._id} (last seen ${g.lastSeenAt?.toISOString() ?? "never"})`);
  }

  if (dryRun) {
    process.exit(0);
  }

  let purged = 0;
  for (const g of staleGuests) {
    try {
      await purgeUserData(g._id);
      purged++;
    } catch (err) {
      console.error(`[guests:purge] Failed to purge ${g._id}:`, err);
    }
  }

  console.log(`[guests:purge] Purged ${purged}/${staleGuests.length} guest account(s).`);
  process.exit(0);
}

purgeGuests().catch((err) => {
  console.error("[guests:purge] Fatal error:", err);
  process.exit(1);
});
