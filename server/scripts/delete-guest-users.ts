/**
 * One-off cleanup: delete every guest account (isGuest: true) and all its
 * cascaded data. Mirrors the deleteAccount cascade in auth.controller.ts.
 *
 *   Dry run (default):  npx tsx server/scripts/delete-guest-users.ts
 *   Apply:              npx tsx server/scripts/delete-guest-users.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { config } from "../config";
import {
  UserModel,
  TripModel,
  JournalEntryModel,
  PackingListModel,
  PackingListTemplateModel,
  AtlasConversationModel,
  NotificationModel,
  FeedbackModel,
  SessionModel,
  MapPinModel,
  connectMongo,
} from "@shared/schema";
import { AgentJob } from "../models/AgentJob";
import { TripSuggestion } from "../models/TripSuggestion";
import { UserMemoryModel } from "../services/UserMemoryService";
import { deleteUserData } from "../services/deleteUserData";

const APPLY = process.argv.includes("--apply");

async function main() {
  // Plain mongoose.connect() here previously connected to the driver's
  // default db ("test"), not the "tripmate" db the app actually uses (that
  // dbName is set inside connectMongo, shared/schema.ts) — the script always
  // reported "Found 0 guest account(s)" against production data as a result.
  await connectMongo(config.MONGODB_URI!);

  const guests = await UserModel.find({ isGuest: true }).select("_id email createdAt").lean();
  console.log(`Found ${guests.length} guest account(s).`);
  if (guests.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const ids = guests.map((g) => String(g._id));

  const counts = Object.fromEntries(
    await Promise.all(
      (
        [
          ["trips", TripModel],
          ["journalEntries", JournalEntryModel],
          ["packingLists", PackingListModel],
          ["packingTemplates", PackingListTemplateModel],
          ["atlasConversations", AtlasConversationModel],
          ["notifications", NotificationModel],
          ["feedback", FeedbackModel],
          ["sessions", SessionModel],
          ["mapPins", MapPinModel],
          ["agentJobs", AgentJob],
          ["tripSuggestions", TripSuggestion],
          ["userMemories", UserMemoryModel],
        ] as const
      ).map(async ([name, model]) => [
        name,
        await (model as any).countDocuments({ userId: { $in: ids } }),
      ]),
    ),
  );
  console.log("Cascaded data to remove:", counts);
  const collabTrips = await TripModel.countDocuments({ "collaborators.userId": { $in: ids } });
  console.log(`Guest ids sitting in other trips' collaborator lists: ${collabTrips}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --apply to execute.");
    await mongoose.disconnect();
    return;
  }

  console.log("\nApplying…");
  // Same cascade as account deletion and the daily guest purge.
  for (const id of ids) await deleteUserData(id);
  console.log(`Deleted ${ids.length} guest account(s) and their data.`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
