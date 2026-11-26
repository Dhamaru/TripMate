// Everything an account owns, removed together. Used by account deletion
// and the daily guest clean-up (server/scheduler.ts).
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
  PushSubscriptionModel,
  ImportPlanRequestLogModel,
} from "@shared/schema";
import { AgentJob } from "../models/AgentJob";
import { TripSuggestion } from "../models/TripSuggestion";
import { UserMemoryModel } from "./UserMemoryService";

export async function deleteUserData(deletedUserId: string): Promise<void> {
  // Previously only User + Session rows were removed — every trip, journal
  // entry, packing list, Atlas conversation, notification, and feedback
  // row the account owned was left behind permanently (a GDPR right-to-
  // erasure gap, and orphaned data that could resurface elsewhere, e.g. a
  // deleted user's old trip still matching a collaborator-list query). A
  // first pass at this cascade matched exportUserData's model list, but
  // that list itself was incomplete — MapPin, CrowdDensity, AgentJob, and
  // TripSuggestion all carry a userId field too and were still orphaned.
  // Trips this account owns go away; so do their packing lists (even ones
  // collaborators created), and collaborators' journal entries are kept
  // but detached from the deleted trip.
  const ownedTripIds = (await TripModel.find({ userId: deletedUserId }).distinct("_id")).map(
    String,
  );
  await Promise.all([
    PackingListModel.deleteMany({ tripId: { $in: ownedTripIds } }),
    JournalEntryModel.updateMany(
      { tripId: { $in: ownedTripIds }, userId: { $ne: deletedUserId } },
      { $unset: { tripId: 1, dayIndex: 1 } },
    ),
  ]);
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
    // Device endpoints + keys: a Google account reuses its email as _id,
    // so signing up again would otherwise re-link the old devices.
    PushSubscriptionModel.deleteMany({ userId: deletedUserId }),
    ImportPlanRequestLogModel.deleteMany({ userId: deletedUserId }),
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
}
