import mongoose, { Schema, Document, Model } from "mongoose";
import { z } from "zod";

const baseToJSON = {
  virtuals: true,
  versionKey: false,
  transform: (_: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
} as const;

export interface IUser extends Document {
  _id: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  phoneNumber?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  isGuest?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    _id: { type: String, required: true },
    email: { type: String },
    password: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    profileImageUrl: { type: String },
    phoneNumber: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    isGuest: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    _id: false,
    toJSON: baseToJSON,
    versionKey: false,
  }
);

userSchema.index({ email: 1 }, { unique: false, sparse: true });

export const UserModel: Model<IUser> = mongoose.model<IUser>("User", userSchema);

export const insertUserSchema = z.object({
  _id: z.string().min(1),
  email: z.string().email().optional(),
  password: z.string().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  profileImageUrl: z.string().url().optional(),
  phoneNumber: z.string().trim().optional(),
  resetPasswordToken: z.string().optional(),
  resetPasswordExpires: z.coerce.date().optional(),
  isGuest: z.boolean().optional(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = IUser;

export interface ISession extends Document {
  userId: string;
  sessionId: string;
  tokenHash: string;
  device?: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

const sessionSchema = new Schema<ISession>(
  {
    userId: { type: String, required: true, ref: "User", index: true },
    sessionId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true },
    device: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true, index: true },
    revoked: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: baseToJSON,
    versionKey: false,
  }
);

sessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

export const SessionModel: Model<ISession> = mongoose.model<ISession>("Session", sessionSchema);

export type TripStatus = "planning" | "active" | "completed";
export type TravelStyle = "budget" | "standard" | "luxury" | "adventure" | "relaxed" | "family" | "cultural" | "culinary";

export interface IExpense {
  id: string;
  amount: number;
  currency: string;
  category: "Accommodation" | "Food" | "Transport" | "Activities" | "Shopping" | "Other";
  description: string;
  date: Date;
}

export interface IItineraryActivity {
  id: string;
  time?: string;
  title: string;
  location?: string;
  notes?: string;
  [key: string]: any; // Flexible for additional fields
}

export interface IItineraryDay {
  dayIndex: number; // 0-based index
  day?: number;     // 1-based day number (from AI)
  date?: Date;
  activities: IItineraryActivity[];
}

export interface ITrip extends Document {
  userId: string;
  destination: string;
  imageUrl?: string;
  currency?: string;
  budget?: number;
  days: number;
  groupSize: number;
  travelStyle: TravelStyle;
  transportMode?: string;
  isInternational?: boolean;
  status: TripStatus;
  startDate?: Date;
  endDate?: Date;
  itinerary?: IItineraryDay[];
  expenses?: IExpense[];
  notes?: string;
  aiPlanMarkdown?: string;
  isDraft?: boolean;
  syncStatus?: "synced" | "pending" | "conflict";
  costBreakdown?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const tripSchema = new Schema<ITrip>(
  {
    userId: { type: String, required: true, ref: "User", index: true },
    destination: { type: String, required: true },
    imageUrl: { type: String },
    currency: { type: String, default: "INR" },
    budget: { type: Number, min: 0 },
    days: { type: Number, required: true, min: 1 },
    groupSize: { type: Number, required: true, min: 1 },
    travelStyle: {
      type: String,
      required: true,
      enum: ["budget", "standard", "luxury", "adventure", "relaxed", "family", "cultural", "culinary"],
      default: "standard",
    },
    transportMode: { type: String },
    isInternational: { type: Boolean, default: false },
    status: {
      type: String,
      required: true,
      enum: ["planning", "active", "completed"],
      default: "planning",
      index: true,
    },
    startDate: { type: Date },
    endDate: { type: Date },
    itinerary: { type: Schema.Types.Mixed },
    expenses: [{
      id: { type: String, required: true },
      amount: { type: Number, required: true },
      currency: { type: String, required: true },
      category: { type: String, required: true },
      description: { type: String, default: "" },
      date: { type: Date, default: Date.now },
    }],
    notes: { type: String },
    aiPlanMarkdown: { type: String },
    costBreakdown: { type: Schema.Types.Mixed }, // JSON object for budget details
  },
  {
    timestamps: true,
    toJSON: baseToJSON,
    versionKey: false,
  }
);

tripSchema.index({ userId: 1, createdAt: -1 });
tripSchema.index({ userId: 1, status: 1 });
tripSchema.index({ destination: 1 }, { sparse: true });

export const TripModel: Model<ITrip> = mongoose.model<ITrip>("Trip", tripSchema);

export const insertTripSchema = z.object({
  userId: z.string().min(1),
  destination: z.string().min(1),
  imageUrl: z.string().url().optional(),
  currency: z.string().default("INR").optional(),
  budget: z.coerce.number().min(0).optional(),
  days: z.coerce.number().int().min(1),
  groupSize: z.coerce.number().int().min(1),
  travelStyle: z.enum([
    "budget",
    "standard",
    "luxury",
    "adventure",
    "relaxed",
    "family",
    "cultural",
    "culinary",
  ]).default("standard"),
  transportMode: z.string().optional(),
  isInternational: z.coerce.boolean().optional(),
  status: z.enum(["planning", "active", "completed"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  itinerary: z.array(z.object({
    dayIndex: z.number().int().min(0).optional(), // Make optional if AI doesn't provide it
    day: z.number().int().min(1).optional(),      // Allow 'day' from AI
    date: z.coerce.date().optional(),
    activities: z.array(z.object({
      id: z.string().optional(), // Inbound from AI might lack ID, but we should generate one
      time: z.string().optional(),
      title: z.string().min(1),
      location: z.string().optional(),
      notes: z.string().optional(),
    }).catchall(z.any())).default([]),
  })).optional(),
  notes: z.string().optional(),
  aiPlanMarkdown: z.string().optional(),
  isDraft: z.boolean().optional(),
  syncStatus: z.enum(["synced", "pending", "conflict"]).optional(),
  costBreakdown: z.record(z.any()).optional(), // Store flexible JSON cost data
  expenses: z.array(z.object({
    id: z.string(),
    amount: z.number(),
    currency: z.string(),
    category: z.enum(["Accommodation", "Food", "Transport", "Activities", "Shopping", "Other"]),
    description: z.string().default(""),
    date: z.coerce.date(),
  })).optional(),
});
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = ITrip;

export interface IJournalEntry extends Document {
  userId: string;
  tripId?: mongoose.Types.ObjectId;
  title: string;
  content: string;
  photos?: string[];
  location?: string;
  latitude?: number;
  longitude?: number;
  createdAt: Date;
  updatedAt: Date;
}

const journalEntrySchema = new Schema<IJournalEntry>(
  {
    userId: { type: String, required: true, ref: "User", index: true },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    photos: [{ type: String }],
    location: { type: String },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
  },
  {
    timestamps: true,
    toJSON: baseToJSON,
    versionKey: false,
  }
);

journalEntrySchema.index({ userId: 1, createdAt: -1 });

export const JournalEntryModel: Model<IJournalEntry> =
  mongoose.model<IJournalEntry>("JournalEntry", journalEntrySchema);

export const insertJournalEntrySchema = z.object({
  userId: z.string().min(1),
  tripId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid tripId").optional(),
  title: z.string().min(1),
  content: z.string().min(1),
  photos: z.array(z.string()).optional(),
  location: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = IJournalEntry;

export interface IPackingListItem {
  name: string;
  quantity: number;
  packed: boolean;
  category?: string;
  is_mandatory?: boolean;
}

export interface IPackingListTemplate extends Document {
  userId: string;
  name: string;
  category?: string;
  items: IPackingListItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IPackingList extends Document {
  userId: string;
  tripId?: mongoose.Types.ObjectId;
  name: string;

  season?: string;
  items: IPackingListItem[];
  isTemplate?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const packingListItemSchema = new Schema<IPackingListItem>(
  {
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    packed: { type: Boolean, required: true, default: false },
    category: { type: String },
    is_mandatory: { type: Boolean, default: false },
  }
);

export const packingListSchema = new Schema<IPackingList>(
  {
    userId: { type: String, required: true, ref: "User", index: true },
    tripId: { type: Schema.Types.ObjectId, ref: "Trip", index: true },
    name: { type: String, required: true },
    season: { type: String },
    items: [packingListItemSchema],
    isTemplate: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: baseToJSON,
    versionKey: false,
  }
);

packingListSchema.index({ userId: 1, name: 1 }, { unique: false });
packingListSchema.index({ userId: 1, createdAt: -1 });

export const packingListTemplateSchema = new Schema<IPackingListTemplate>(
  {
    userId: { type: String, required: true, ref: "User", index: true },
    name: { type: String, required: true },
    category: { type: String },
    items: [packingListItemSchema],
  },
  {
    timestamps: true,
    toJSON: baseToJSON,
    versionKey: false,
  }
);

packingListTemplateSchema.index({ userId: 1, name: 1 }, { unique: false });

export const PackingListModel: Model<IPackingList> =
  mongoose.model<IPackingList>("PackingList", packingListSchema);

export const PackingListTemplateModel: Model<IPackingListTemplate> =
  mongoose.model<IPackingListTemplate>("PackingListTemplate", packingListTemplateSchema);

export const insertPackingListSchema = z.object({
  userId: z.string().min(1),
  tripId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid tripId").optional(),
  name: z.string().min(1),
  season: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        _id: z.string().optional(),
        name: z.string().min(1),
        quantity: z.coerce.number().int().min(1).default(1),
        packed: z.coerce.boolean().default(false),
        category: z.string().optional(),
        is_mandatory: z.boolean().optional(),
      })
    )
    .default([]),
});
export type InsertPackingList = z.infer<typeof insertPackingListSchema>;
export type PackingList = IPackingList;

export async function connectMongo(uri: string) {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri, {
    dbName: "tripmate",
  });
}
