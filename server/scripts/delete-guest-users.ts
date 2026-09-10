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
} from "@shared/schema";
import { AgentJob } from "../models/AgentJob";
import { TripSuggestion } from "../models/TripSuggestion";
import { UserMemoryModel } from "../services/UserMemoryService";

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(config.MONGODB_URI!);

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
  await Promise.all([
    TripModel.deleteMany({ userId: { $in: ids } }),
    JournalEntryModel.deleteMany({ userId: { $in: ids } }),
    PackingListModel.deleteMany({ userId: { $in: ids } }),
    PackingListTemplateModel.deleteMany({ userId: { $in: ids } }),
    AtlasConversationModel.deleteMany({ userId: { $in: ids } }),
    NotificationModel.deleteMany({ userId: { $in: ids } }),
    FeedbackModel.deleteMany({ userId: { $in: ids } }),
    SessionModel.deleteMany({ userId: { $in: ids } }),
    MapPinModel.deleteMany({ userId: { $in: ids } }),
    (AgentJob as any).deleteMany({ userId: { $in: ids } }),
    (TripSuggestion as any).deleteMany({ userId: { $in: ids } }),
    UserMemoryModel.deleteMany({ userId: { $in: ids } }),
    TripModel.updateMany(
      { "collaborators.userId": { $in: ids } },
      { $pull: { collaborators: { userId: { $in: ids } } } },
    ),
  ]);
  const del = await UserModel.deleteMany({ _id: { $in: ids }, isGuest: true });
  console.log(`Deleted ${del.deletedCount} guest account(s) and their data.`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
