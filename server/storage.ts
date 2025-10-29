import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  users,
  trips,
  journalEntries,
  packingLists,
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
  upsertUser(user: InsertUser): Promise<User>;
  
  // Trip operations
  getUserTrips(userId: string): Promise<Trip[]>;
  createTrip(trip: InsertTrip): Promise<Trip>;
  getTrip(id: number, userId: string): Promise<Trip | undefined>;
  updateTrip(id: number, userId: string, updates: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: number, userId: string): Promise<boolean>;
  
  // Journal operations
  getUserJournalEntries(userId: string): Promise<JournalEntry[]>;
  getTripJournalEntries(tripId: number, userId: string): Promise<JournalEntry[]>;
  createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry>;
  updateJournalEntry(id: number, userId: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined>;
  deleteJournalEntry(id: number, userId: string): Promise<boolean>;
  
  // Packing list operations
  getUserPackingLists(userId: string): Promise<PackingList[]>;
  createPackingList(packingList: InsertPackingList): Promise<PackingList>;
  updatePackingList(id: number, userId: string, updates: Partial<InsertPackingList>): Promise<PackingList | undefined>;
  deletePackingList(id: number, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async upsertUser(userData: InsertUser): Promise<User> {
    const result = await db
      .insert(users)
      .values({
        ...userData,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0]!;
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
    const result = await db.insert(trips).values(trip).returning();
    return result[0]!;
  }

  async getTrip(id: number, userId: string): Promise<Trip | undefined> {
    const result = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)));
    return result[0];
  }

  async updateTrip(id: number, userId: string, updates: Partial<InsertTrip>): Promise<Trip | undefined> {
    const result = await db
      .update(trips)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
      .returning();
    return result[0];
  }

  async deleteTrip(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // Journal operations
  async getUserJournalEntries(userId: string): Promise<JournalEntry[]> {
    return await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, userId))
      .orderBy(desc(journalEntries.createdAt));
  }

  async getTripJournalEntries(tripId: number, userId: string): Promise<JournalEntry[]> {
    return await db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.tripId, tripId), eq(journalEntries.userId, userId)))
      .orderBy(desc(journalEntries.createdAt));
  }

  async createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry> {
    const result = await db.insert(journalEntries).values(entry).returning();
    return result[0]!;
  }

  async updateJournalEntry(id: number, userId: string, updates: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined> {
    const result = await db
      .update(journalEntries)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
      .returning();
    return result[0];
  }

  async deleteJournalEntry(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
      .returning();
    return result.length > 0;
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
    const result = await db.insert(packingLists).values(packingList).returning();
    return result[0]!;
  }

  async updatePackingList(id: number, userId: string, updates: Partial<InsertPackingList>): Promise<PackingList | undefined> {
    const result = await db
      .update(packingLists)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(packingLists.id, id), eq(packingLists.userId, userId)))
      .returning();
    return result[0];
  }

  async deletePackingList(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(packingLists)
      .where(and(eq(packingLists.id, id), eq(packingLists.userId, userId)))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
