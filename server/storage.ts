import {
  UserModel,
  TripModel,
  JournalEntryModel,
  PackingListModel,
  type User,
  type UpsertUser,
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
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Trip operations
  getUserTrips(userId: string): Promise<Trip[]>;
  createTrip(trip: InsertTrip): Promise<Trip>;
  getTrip(id: string, userId: string): Promise<Trip | undefined>;
  updateTrip(id: string, userId: string, updates: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: string, userId: string): Promise<boolean>;
  
  // Journal operations
  getUserJournalEntries(userId: string): Promise<JournalEntry[]>;
  getTripJournalEntries(tripId: string, userId: string): Promise<JournalEntry[]>;
  createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry>;
  updateJournalEntry(id: string, userId: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined>;
  deleteJournalEntry(id: string, userId: string): Promise<boolean>;
  
  // Packing list operations
  getUserPackingLists(userId: string): Promise<PackingList[]>;
  createPackingList(packingList: InsertPackingList): Promise<PackingList>;
  updatePackingList(id: string, userId: string, updates: Partial<InsertPackingList>): Promise<PackingList | undefined>;
  deletePackingList(id: string, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const user = await UserModel.findOne({ id });
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const user = await UserModel.findOneAndUpdate(
      { id: userData.id },
      { ...userData, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    return user!;
  }

  // Trip operations
  async getUserTrips(userId: string): Promise<Trip[]> {
    return await TripModel.find({ userId }).sort({ createdAt: -1 });
  }

  async createTrip(trip: InsertTrip): Promise<Trip> {
    const newTrip = new TripModel(trip);
    return await newTrip.save();
  }

  async getTrip(id: string, userId: string): Promise<Trip | undefined> {
    const trip = await TripModel.findOne({ _id: id, userId });
    return trip || undefined;
  }

  async updateTrip(id: string, userId: string, updates: Partial<InsertTrip>): Promise<Trip | undefined> {
    const updatedTrip = await TripModel.findOneAndUpdate(
      { _id: id, userId },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    return updatedTrip || undefined;
  }

  async deleteTrip(id: string, userId: string): Promise<boolean> {
    const result = await TripModel.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }

  // Journal operations
  async getUserJournalEntries(userId: string): Promise<JournalEntry[]> {
    return await JournalEntryModel.find({ userId }).sort({ createdAt: -1 });
  }

  async getTripJournalEntries(tripId: string, userId: string): Promise<JournalEntry[]> {
    return await JournalEntryModel.find({ tripId, userId }).sort({ createdAt: -1 });
  }

  async createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry> {
    const newEntry = new JournalEntryModel(entry);
    return await newEntry.save();
  }

  async updateJournalEntry(id: string, userId: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined> {
    const updatedEntry = await JournalEntryModel.findOneAndUpdate(
      { _id: id, userId },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    return updatedEntry || undefined;
  }

  async deleteJournalEntry(id: string, userId: string): Promise<boolean> {
    const result = await JournalEntryModel.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }

  // Packing list operations
  async getUserPackingLists(userId: string): Promise<PackingList[]> {
    return await PackingListModel.find({ userId }).sort({ createdAt: -1 });
  }

  async createPackingList(packingList: InsertPackingList): Promise<PackingList> {
    const newList = new PackingListModel(packingList);
    return await newList.save();
  }

  async updatePackingList(id: string, userId: string, updates: Partial<InsertPackingList>): Promise<PackingList | undefined> {
    const updatedList = await PackingListModel.findOneAndUpdate(
      { _id: id, userId },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    return updatedList || undefined;
  }

  async deletePackingList(id: string, userId: string): Promise<boolean> {
    const result = await PackingListModel.deleteOne({ _id: id, userId });
    return result.deletedCount > 0;
  }
}

export const storage = new DatabaseStorage();