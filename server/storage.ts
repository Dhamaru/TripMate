import {
  users,
  trips,
  journalEntries,
  packingLists,
  type User,
  type UpsertUser,
  type Trip,
  type InsertTrip,
  type JournalEntry,
  type InsertJournalEntry,
  type PackingList,
  type InsertPackingList,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

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
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Trip operations
  async getUserTrips(userId: string): Promise<Trip[]> {
    return await db
      .select()
      .from(trips)
      .where(eq(trips.userId, userId))
      .orderBy(desc(trips.createdAt));
  }

  async createTrip(trip: InsertTrip): Promise<Trip> {
    const [newTrip] = await db.insert(trips).values(trip).returning();
    return newTrip;
  }

  async getTrip(id: string, userId: string): Promise<Trip | undefined> {
    const [trip] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)));
    return trip;
  }

  async updateTrip(id: string, userId: string, updates: Partial<InsertTrip>): Promise<Trip | undefined> {
    const [updatedTrip] = await db
      .update(trips)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
      .returning();
    return updatedTrip;
  }

  async deleteTrip(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Journal operations
  async getUserJournalEntries(userId: string): Promise<JournalEntry[]> {
    return await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, userId))
      .orderBy(desc(journalEntries.createdAt));
  }

  async getTripJournalEntries(tripId: string, userId: string): Promise<JournalEntry[]> {
    return await db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.tripId, tripId), eq(journalEntries.userId, userId)))
      .orderBy(desc(journalEntries.createdAt));
  }

  async createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry> {
    const [newEntry] = await db.insert(journalEntries).values(entry).returning();
    return newEntry;
  }

  async updateJournalEntry(id: string, userId: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined> {
    const [updatedEntry] = await db
      .update(journalEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
      .returning();
    return updatedEntry;
  }

  async deleteJournalEntry(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Packing list operations
  async getUserPackingLists(userId: string): Promise<PackingList[]> {
    return await db
      .select()
      .from(packingLists)
      .where(eq(packingLists.userId, userId))
      .orderBy(desc(packingLists.createdAt));
  }

  async createPackingList(packingList: InsertPackingList): Promise<PackingList> {
    const [newList] = await db.insert(packingLists).values(packingList).returning();
    return newList;
  }

  async updatePackingList(id: string, userId: string, updates: Partial<InsertPackingList>): Promise<PackingList | undefined> {
    const [updatedList] = await db
      .update(packingLists)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(packingLists.id, id), eq(packingLists.userId, userId)))
      .returning();
    return updatedList;
  }

  async deletePackingList(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(packingLists)
      .where(and(eq(packingLists.id, id), eq(packingLists.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }
}

export const storage = new DatabaseStorage();
