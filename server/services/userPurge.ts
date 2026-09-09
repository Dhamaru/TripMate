// Extracted from auth.controller.ts's deleteAccount — that handler and
// server/scripts/purgeGuests.ts (the guest-inactivity cleanup job) both
// need the exact same "delete every row this account owns, everywhere"
// cascade. One shared implementation instead of two copies that would
// silently drift the next time a new userId-keyed model is added — that
// exact drift already happened once (deleteAccount's cascade missed
// MapPin/AgentJob/TripSuggestion/UserMemory on its first pass).
import {
  UserModel,
  TripModel,
  JournalEntryModel,
  PackingListModel,
  PackingListTemplateModel,
  AtlasConversationModel,
  NotificationModel,
  MapPinModel,
  FeedbackModel,
  SessionModel,
  ImportPlanRequestLogModel,
} from "@shared/schema";
import { AgentJob } from "../models/AgentJob";
import { TripSuggestion } from "../models/TripSuggestion";
import { UserMemoryModel } from "./UserMemoryService";

/** Deletes every row a user owns across every collection, then the user
 * document itself. Does NOT check permissions or require a password —
 * callers (an authenticated deleteAccount request, or a scheduled purge
 * job) are responsible for deciding a user should be deleted at all. */
export async function purgeUserData(userId: string): Promise<void> {
  await Promise.all([
    TripModel.deleteMany({ userId }),
    JournalEntryModel.deleteMany({ userId }),
    PackingListModel.deleteMany({ userId }),
    PackingListTemplateModel.deleteMany({ userId }),
    AtlasConversationModel.deleteMany({ userId }),
    NotificationModel.deleteMany({ userId }),
    FeedbackModel.deleteMany({ userId }),
    SessionModel.deleteMany({ userId }),
    MapPinModel.deleteMany({ userId }),
    ImportPlanRequestLogModel.deleteMany({ userId }),
    // CrowdDensityModel deliberately excluded — ICrowdDensity has no
    // userId field at all (anonymous by design), a userId-keyed delete
    // against it is a permanent, silent no-op.
    AgentJob.deleteMany({ userId }),
    TripSuggestion.deleteMany({ userId }),
    UserMemoryModel.deleteMany({ userId }),
    // A trip this user was invited onto as a collaborator belongs to
    // someone else and stays — but their userId shouldn't linger forever
    // in that trip's collaborators array as a phantom participant.
    TripModel.updateMany(
      { "collaborators.userId": userId },
      { $pull: { collaborators: { userId } } },
    ),
  ]);
  await UserModel.findByIdAndDelete(userId);
}
