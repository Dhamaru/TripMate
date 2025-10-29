import { pgTable, text, integer, timestamp, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Trips table
export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  destination: text("destination").notNull(),
  budget: integer("budget"),
  days: integer("days").notNull(),
  groupSize: text("group_size").notNull(),
  travelStyle: text("travel_style").notNull(),
  status: text("status").notNull().default("planning"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  itinerary: jsonb("itinerary"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTripSchema = createInsertSchema(trips, {
  destination: z.string().min(1, "Destination is required"),
  days: z.number().min(1, "Days must be at least 1"),
  groupSize: z.string().min(1, "Group size is required"),
  travelStyle: z.string().min(1, "Travel style is required"),
  status: z.enum(["planning", "active", "completed"]).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof trips.$inferSelect;

// Journal entries table
export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tripId: integer("trip_id").references(() => trips.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  photos: text("photos").array(),
  location: text("location"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries, {
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

// Packing lists table
export const packingLists = pgTable("packing_lists", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tripId: integer("trip_id").references(() => trips.id),
  name: text("name").notNull(),
  items: jsonb("items").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPackingListSchema = createInsertSchema(packingLists, {
  name: z.string().min(1, "Name is required"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPackingList = z.infer<typeof insertPackingListSchema>;
export type PackingList = typeof packingLists.$inferSelect;
