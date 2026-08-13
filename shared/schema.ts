import mongoose, { Schema, Document, Model } from "mongoose";
import { z } from "zod";

const baseToJSON = {
  virtuals: true,
  versionKey: false,
  transform: (_: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    // Shared across all models; only User documents carry these, but
    // deleting a missing key is a harmless no-op — never let a password
    // hash or reset token leave the server in a JSON response.
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    return ret;
  },
} as const;

export interface IBaseUser {
  _id?: string;
  id: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  avatar?: string;
  phoneNumber?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  failedLoginAttempts?: number;
  lockUntil?: Date;
  isGuest?: boolean;
  homeCity?: string;
  dietaryPreferences?: string[];
  preferredTransport?: string;
  interests?: string[];
  googleConnected?: boolean;
  googleId?: string;
  mutedNotificationTypes?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUser extends IBaseUser, Document {
  _id: string;
  id: string;
}

const userSchema = new Schema<IUser>(
  {
    _id: { type: String, required: true },
    email: { type: String },
    password: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    profileImageUrl: { type: String },
    avatar: { type: String },
    phoneNumber: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    isGuest: { type: Boolean, default: false },
    homeCity: { type: String },
    dietaryPreferences: { type: [String], default: [] },
    preferredTransport: { type: String },
    interests: { type: [String], default: [] },
    googleConnected: { type: Boolean, default: false },
    googleId: { type: String },
    mutedNotificationTypes: { type: [String], default: [] },
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
  avatar: z.string().optional(),
  phoneNumber: z.string().trim().optional(),
  resetPasswordToken: z.string().optional(),
  resetPasswordExpires: z.coerce.date().optional(),
  failedLoginAttempts: z.number().optional(),
  lockUntil: z.coerce.date().optional(),
  isGuest: z.boolean().optional(),
  homeCity: z.string().optional(),
  dietaryPreferences: z.array(z.string()).optional(),
  preferredTransport: z.string().optional(),
  interests: z.array(z.string()).optional(),
  googleConnected: z.boolean().optional(),
  googleId: z.string().optional(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = IBaseUser;

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
    // TTL index: Mongo auto-deletes the doc once expiresAt passes, so revoked/
    // expired session rows don't accumulate forever with no cleanup job.
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
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
  address?: string; // AI provided address
  lat?: number;
  lon?: number;
  notes?: string;
  votes?: number; // Fix 16: Collaborative Vibe Voting
  vibeSignals?: string[]; // e.g. ["Too expensive", "Hidden gem"]
  [key: string]: any; // Flexible for additional fields
}

export interface IItineraryDay {
  dayIndex: number; // 0-based index
  day?: number;     // 1-based day number (from AI)
  date?: Date;
  activities: IItineraryActivity[];
  reasoning?: string; // Stage 5: Explainability
  confidenceScore?: 'high' | 'medium' | 'low'; // Stage 5: Reliability
}
export interface ICollaborator {
  userId: string;
  role: 'editor' | 'viewer';
  joinedAt: Date;
}

export interface ITrip extends Document {
  userId: string;
  origin?: string;
  destination: string;
  imageUrl?: string;
  imageCaption?: string;
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
  collaborators?: ICollaborator[];
  notes?: string;
  aiPlanMarkdown?: string;
  isDraft?: boolean;
  syncStatus?: "synced" | "pending" | "conflict";
  costBreakdown?: Record<string, any>;
  shareId?: string;
  isPublic?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tripSchema = new Schema<ITrip>(
  {
    userId: { type: String, required: true, ref: "User", index: true },
    origin: { type: String },
    destination: { type: String, required: true },
    imageUrl: { type: String },
    imageCaption: { type: String },
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
    collaborators: [{
      userId: { type: String, required: true, ref: "User" },
      role: { type: String, required: true, enum: ["editor", "viewer"], default: "editor" },
      joinedAt: { type: Date, default: Date.now },
    }],
    notes: { type: String },
    aiPlanMarkdown: { type: String },
    costBreakdown: { type: Schema.Types.Mixed }, // JSON object for budget details
    shareId: { type: String, unique: true, sparse: true },
    isPublic: { type: Boolean, default: false },
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
  origin: z.string().optional(),
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
      id: z.string().optional(),
      time: z.string().optional(),
      title: z.string().min(1),
      location: z.string().optional(),
      address: z.string().optional(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      notes: z.string().optional(),
    }).catchall(z.any())).default([]),
    reasoning: z.string().optional(),
    confidenceScore: z.enum(['high', 'medium', 'low']).optional(),
  })).optional(),
  notes: z.string().optional(),
  aiPlanMarkdown: z.string().optional(),
  isDraft: z.boolean().optional(),
  syncStatus: z.enum(["synced", "pending", "conflict"]).optional(),
  costBreakdown: z.record(z.any()).optional(), // Store flexible JSON cost data
  shareId: z.string().optional(),
  isPublic: z.boolean().optional(),
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
  dayIndex?: number; // Auto-contextualized day of trip
  contextConfidence?: string;
  contextReasoning?: string;
  isRecap?: boolean; // Fix 15: AI Journey Recap Cards
  recapMeta?: {
    title: string;
    highlights: string[];
    memorableMoment?: string;
    travelTip?: string;
    awards?: Array<{ title: string; icon: string; description: string }>;
    visualVibe?: string;
  };
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
    dayIndex: { type: Number, min: 0 },
    contextConfidence: { type: String },
    contextReasoning: { type: String },
    isRecap: { type: Boolean, default: false },
    recapMeta: { type: Schema.Types.Mixed },
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
  dayIndex: z.number().int().min(0).optional(),
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

export interface IAtlasConversation extends Document {
  tripId: string;
  userId: string;
  messages: Array<{
    role: "system" | "user" | "assistant" | "model" | "tool";
    content?: string;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
    timestamp?: Date;
  }>;
  metadata?: {
    totalToolCalls?: number;
    toolsUsed?: string[];
    lastConfidence?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const atlasConversationSchema = new Schema<IAtlasConversation>(
  {
    tripId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    messages: [
      {
        role: { type: String, enum: ['user', 'assistant', 'tool', 'system'], required: true },
        content: { type: String },
        tool_calls: { type: Schema.Types.Mixed },
        tool_call_id: { type: String },
        name: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    metadata: {
      totalToolCalls: { type: Number, default: 0 },
      toolsUsed: [{ type: String }],
      lastConfidence: { type: Number },
    },
  },
  {
    timestamps: true,
    toJSON: baseToJSON,
    versionKey: false,
  }
);

atlasConversationSchema.index({ tripId: 1, userId: 1 }, { unique: true });

export const AtlasConversationModel: Model<IAtlasConversation> = mongoose.model<IAtlasConversation>("AtlasConversation", atlasConversationSchema);

export interface ICrowdDensity extends Document {
  latitude: number;
  longitude: number;
  density: number; // 1-10
  timestamp: Date;
  placeId?: string;
  source: "user-report" | "external-api";
}

const crowdDensitySchema = new Schema<ICrowdDensity>(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    density: { type: Number, required: true, min: 1, max: 10 },
    timestamp: { type: Date, default: Date.now },
    placeId: { type: String },
    source: { type: String, enum: ["user-report", "external-api"], default: "user-report" },
  },
  {
    timestamps: false,
    toJSON: baseToJSON,
    versionKey: false,
  }
);

crowdDensitySchema.index({ latitude: 1, longitude: 1 });
crowdDensitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 86400 * 7 }); // Keep for 7 days

export const CrowdDensityModel: Model<ICrowdDensity> = mongoose.model<ICrowdDensity>("CrowdDensity", crowdDensitySchema);

export const insertCrowdDensitySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  density: z.number().min(1).max(10),
  placeId: z.string().optional(),
});

export interface IFeedback extends Document {
  type: string;
  category: string;
  subject: string;
  description: string;
  email: string;
  userId?: string;
  status: string;
  attachments?: string[];
  agentReviewed: boolean;
  agentReviewedAt?: Date;
  agentPlan?: string;
}

const feedbackSchema = new Schema<IFeedback>(
  {
    type: { type: String, required: true },
    category: { type: String, required: true },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    email: { type: String, required: true },
    userId: { type: String },
    status: { type: String, default: "open" },
    attachments: { type: [String], default: undefined },
    // Set by the automated feedback-triage routine once it has investigated
    // and reproduced the issue — agentPlan holds its proposed fix, not an
    // applied change. A human still decides whether to act on it.
    agentReviewed: { type: Boolean, default: false, index: true },
    agentReviewedAt: { type: Date },
    agentPlan: { type: String },
  },
  { timestamps: true, toJSON: baseToJSON, versionKey: false }
);

export const FeedbackModel: Model<IFeedback> = mongoose.model<IFeedback>("Feedback", feedbackSchema);

export const insertFeedbackSchema = z.object({
  type: z.string(),
  category: z.string(),
  subject: z.string(),
  description: z.string(),
  email: z.string().email(),
  attachments: z.array(z.string()).optional(),
});
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = IFeedback;

export interface INotification extends Document {
  userId: string;
  type: string; // "collaborator-invite" | "trip-mutation" | ...
  title: string;
  message: string;
  link?: string;
  tripId?: string;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String },
    tripId: { type: String },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, toJSON: baseToJSON, versionKey: false }
);

export const NotificationModel: Model<INotification> = mongoose.model<INotification>("Notification", notificationSchema);
export type Notification = INotification;

export async function connectMongo(uri: string) {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri, {
    dbName: "tripmate",
    serverSelectionTimeoutMS: 5000, // 5 seconds timeout
    connectTimeoutMS: 10000,
  });
}
