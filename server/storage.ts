import {
  UserModel,
  TripModel,
  JournalEntryModel,
  PackingListModel,
  type User,
  type InsertUser,
  type Trip,
  type InsertTrip,
  type JournalEntry,
  type InsertJournalEntry,
  type PackingList,
  type InsertPackingList,
} from "@shared/schema";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  deleteAllUsers(): Promise<boolean>;

  // Trip operations
  getUserTrips(userId: string, options?: { limit?: number; page?: number; sort?: string; status?: string; excludeHeavyFields?: boolean }): Promise<Trip[]>;
  createTrip(trip: InsertTrip): Promise<Trip>;
  getTrip(id: string, userId: string): Promise<Trip | undefined>;
  updateTrip(id: string, userId: string, updates: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: string, userId: string): Promise<boolean>;
  deleteTripUnsafe(id: string): Promise<boolean>;
  deleteAllTrips(userId: string): Promise<boolean>;

  // Journal operations
  getUserJournalEntries(userId: string, options?: { excludeHeavyFields?: boolean; limit?: number; page?: number }): Promise<JournalEntry[]>;
  getTripJournalEntries(tripId: string, userId: string): Promise<JournalEntry[]>;
  getJournalEntry(id: string, userId: string): Promise<JournalEntry | undefined>;
  createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry>;
  updateJournalEntry(id: string, userId: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined>;
  deleteJournalEntry(id: string, userId: string): Promise<boolean>;

  // Packing list operations
  getUserPackingLists(userId: string): Promise<PackingList[]>;
  createPackingList(packingList: InsertPackingList): Promise<PackingList>;
  updatePackingList(id: string, userId: string, updates: Partial<InsertPackingList>): Promise<PackingList | undefined>;
  deletePackingList(id: string, userId: string): Promise<boolean>;
  duplicatePackingList(id: string, userId: string): Promise<PackingList | undefined>;

  // Template operations
  createPackingListTemplate(data: any): Promise<any>;
  getUserPackingListTemplates(userId: string): Promise<any[]>;
  deletePackingListTemplate(id: string, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return await UserModel.findById(id).exec() || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // First try to find by _id (for email/password users where _id === email)
    let user = await UserModel.findById(email).exec();
    if (user) return user;

    // If not found, search by email field (for Google OAuth users)
    user = await UserModel.findOne({ email: email.toLowerCase() }).exec();
    return user || undefined;
  }

  async upsertUser(userData: InsertUser): Promise<User> {
    const user = await UserModel.findByIdAndUpdate(
      userData._id,
      {
        email: userData.email,
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        phoneNumber: userData.phoneNumber,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
    return user!;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const setFields: Record<string, any> = {};
    const unsetFields: Record<string, any> = {};

    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) {
        // Use $unset to remove fields when undefined is explicitly passed
        unsetFields[k] = 1;
      } else {
        setFields[k] = v;
      }
    }

    const updateOps: Record<string, any> = {};
    if (Object.keys(setFields).length > 0) {
      updateOps.$set = setFields;
    }
    if (Object.keys(unsetFields).length > 0) {
      updateOps.$unset = unsetFields;
    }

    if (Object.keys(updateOps).length === 0) {
      // Nothing to update
      return await UserModel.findById(id).exec() || undefined;
    }

    const user = await UserModel.findByIdAndUpdate(
      id,
      updateOps,
      { new: true }
    ).exec();
    return user || undefined;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    return await UserModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    }).exec() || undefined;
  }

  async deleteAllUsers(): Promise<boolean> {
    const result = await UserModel.deleteMany({}).exec();
    return result.acknowledged;
  }

  // Trip operations
  async getUserTrips(userId: string, options?: { limit?: number; page?: number; sort?: string; status?: string; excludeHeavyFields?: boolean }): Promise<Trip[]> {
    const { limit = 10, page = 1, sort = 'createdAt', status, excludeHeavyFields } = options || {};

    let query = TripModel.find({ userId });

    if (status) {
      query = query.where('status').equals(status);
    }

    if (excludeHeavyFields) {
      query = query.select('-aiPlanMarkdown -itinerary -costBreakdown');
    }

    const sortOptions: any = {};
    if (sort === 'createdAt') sortOptions.createdAt = -1;
    else if (sort === 'startDate') sortOptions.startDate = -1;
    else if (sort === 'budget') sortOptions.budget = -1;

    query = query.sort(sortOptions);

    if (limit > 0) {
      query = query.limit(limit).skip((page - 1) * limit);
    }

    return await query.exec();
  }

  async createTrip(trip: InsertTrip): Promise<Trip> {
    const newTrip = new TripModel(trip);
    return await newTrip.save();
  }

  async getTrip(id: string, userId: string): Promise<Trip | undefined> {
    return await TripModel.findOne({ _id: id, userId }).exec() || undefined;
  }

  async updateTrip(id: string, userId: string, updates: Partial<InsertTrip>): Promise<Trip | undefined> {
    return await TripModel.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true }
    ).exec() || undefined;
  }

  async deleteTrip(id: string, userId: string): Promise<boolean> {
    const result = await TripModel.deleteOne({ _id: id, userId }).exec();
    return result.deletedCount > 0;
  }

  async deleteTripUnsafe(id: string): Promise<boolean> {
    const result = await TripModel.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async deleteAllTrips(userId: string): Promise<boolean> {
    const result = await TripModel.deleteMany({ userId }).exec();
    return result.deletedCount > 0;
  }

  // Journal operations
  async getUserJournalEntries(userId: string, options?: { excludeHeavyFields?: boolean; limit?: number; page?: number }): Promise<JournalEntry[]> {
    const { excludeHeavyFields, limit = 0, page = 1 } = options || {};
    let query = JournalEntryModel.find({ userId }).sort({ createdAt: -1 });

    if (excludeHeavyFields) {
      // Simplify: we will handle the "first photo only" logic in the route for now
      // This ensures we get the thumbnail for the "cute and short" card layout.
    }

    if (limit > 0) {
      query = query.limit(limit).skip((page - 1) * limit);
    }

    return await query.lean().exec() as JournalEntry[];
  }

  async getTripJournalEntries(tripId: string, userId: string): Promise<JournalEntry[]> {
    return await JournalEntryModel.find({ tripId, userId }).sort({ createdAt: -1 }).exec();
  }

  async getJournalEntry(id: string, userId: string): Promise<JournalEntry | undefined> {
    return await JournalEntryModel.findOne({ _id: id, userId }).exec() || undefined;
  }

  async createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry> {
    const newEntry = new JournalEntryModel(entry);
    return await newEntry.save();
  }

  async updateJournalEntry(id: string, userId: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined> {
    return await JournalEntryModel.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true }
    ).exec() || undefined;
  }

  async deleteJournalEntry(id: string, userId: string): Promise<boolean> {
    const result = await JournalEntryModel.deleteOne({ _id: id, userId }).exec();
    return result.deletedCount > 0;
  }

  // Packing list operations
  async getUserPackingLists(userId: string): Promise<PackingList[]> {
    return await PackingListModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async createPackingList(packingList: InsertPackingList): Promise<PackingList> {
    const newList = new PackingListModel(packingList);
    return await newList.save();
  }

  async updatePackingList(id: string, userId: string, updates: Partial<InsertPackingList>): Promise<PackingList | undefined> {
    return await PackingListModel.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true }
    ).exec() || undefined;
  }

  async deletePackingList(id: string, userId: string): Promise<boolean> {
    const result = await PackingListModel.deleteOne({ _id: id, userId }).exec();
    return result.deletedCount > 0;
  }

  async duplicatePackingList(id: string, userId: string): Promise<PackingList | undefined> {
    const originalList = await PackingListModel.findOne({ _id: id, userId }).exec();
    if (!originalList) return undefined;

    const newList = new PackingListModel({
      userId,
      tripId: originalList.tripId,
      name: `${originalList.name} (Copy)`,
      season: originalList.season,
      isTemplate: false,
      items: originalList.items.map(item => ({
        ...item,
        packed: false // Reset packed status
      }))
    });

    return await newList.save();
  }

  // Template operations
  async createPackingListTemplate(data: any): Promise<any> {
    const { PackingListTemplateModel } = await import("@shared/schema");
    const template = new PackingListTemplateModel(data);
    return await template.save();
  }

  async getUserPackingListTemplates(userId: string): Promise<any[]> {
    const { PackingListTemplateModel } = await import("@shared/schema");
    return await PackingListTemplateModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async deletePackingListTemplate(id: string, userId: string): Promise<boolean> {
    const { PackingListTemplateModel } = await import("@shared/schema");
    const result = await PackingListTemplateModel.deleteOne({ _id: id, userId }).exec();
    return result.deletedCount === 1;
  }
}

export const storage = new DatabaseStorage();
