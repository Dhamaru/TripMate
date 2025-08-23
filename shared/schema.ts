import mongoose, { Schema, Document } from 'mongoose';
import { z } from "zod";

// User interface and schema
export interface IUser extends Document {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true },
  firstName: String,
  lastName: String,
  profileImageUrl: String,
}, { timestamps: true });

export const UserModel = mongoose.model<IUser>('User', userSchema);

// Trip interface and schema
export interface ITrip extends Document {
  id: string;
  userId: string;
  destination: string;
  budget?: number;
  days: number;
  groupSize: string;
  travelStyle: string;
  status: 'planning' | 'active' | 'completed';
  startDate?: Date;
  endDate?: Date;
  itinerary?: any;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tripSchema = new Schema({
  userId: { type: String, required: true, ref: 'User' },
  destination: { type: String, required: true },
  budget: Number,
  days: { type: Number, required: true },
  groupSize: { type: String, required: true },
  travelStyle: { type: String, required: true },
  status: { type: String, default: 'planning', enum: ['planning', 'active', 'completed'] },
  startDate: Date,
  endDate: Date,
  itinerary: Schema.Types.Mixed,
  notes: String,
}, { timestamps: true });

export const TripModel = mongoose.model<ITrip>('Trip', tripSchema);

// Journal Entry interface and schema
export interface IJournalEntry extends Document {
  id: string;
  userId: string;
  tripId?: string;
  title: string;
  content: string;
  photos?: string[];
  location?: string;
  latitude?: string;
  longitude?: string;
  createdAt: Date;
  updatedAt: Date;
}

const journalEntrySchema = new Schema({
  userId: { type: String, required: true, ref: 'User' },
  tripId: { type: String, ref: 'Trip' },
  title: { type: String, required: true },
  content: { type: String, required: true },
  photos: [String],
  location: String,
  latitude: String,
  longitude: String,
}, { timestamps: true });

export const JournalEntryModel = mongoose.model<IJournalEntry>('JournalEntry', journalEntrySchema);

// Packing List interface and schema
export interface IPackingList extends Document {
  id: string;
  userId: string;
  tripId?: string;
  name: string;
  items: any[];
  createdAt: Date;
  updatedAt: Date;
}

const packingListSchema = new Schema({
  userId: { type: String, required: true, ref: 'User' },
  tripId: { type: String, ref: 'Trip' },
  name: { type: String, required: true },
  items: { type: [Schema.Types.Mixed], default: [] },
}, { timestamps: true });

export const PackingListModel = mongoose.model<IPackingList>('PackingList', packingListSchema);

// Zod schemas for validation
export const insertUserSchema = z.object({
  id: z.string(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  profileImageUrl: z.string().optional(),
});

export const insertTripSchema = z.object({
  userId: z.string(),
  destination: z.string(),
  budget: z.number().optional(),
  days: z.number(),
  groupSize: z.string(),
  travelStyle: z.string(),
  status: z.enum(['planning', 'active', 'completed']).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  itinerary: z.any().optional(),
  notes: z.string().optional(),
});

export const insertJournalEntrySchema = z.object({
  userId: z.string(),
  tripId: z.string().optional(),
  title: z.string(),
  content: z.string(),
  photos: z.array(z.string()).optional(),
  location: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
});

export const insertPackingListSchema = z.object({
  userId: z.string(),
  tripId: z.string().optional(),
  name: z.string(),
  items: z.array(z.any()).optional(),
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = IUser;
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = ITrip;
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = IJournalEntry;
export type InsertPackingList = z.infer<typeof insertPackingListSchema>;
export type PackingList = IPackingList;