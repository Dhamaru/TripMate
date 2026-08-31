import mongoose, { Document, Schema } from "mongoose";

export interface ITripSuggestion extends Document {
  userId: string;
  destination: string;
  country: string;
  tagline: string;
  highlights: string[];
  travelStyle: string[];
  estimatedBudget: {
    min: number;
    max: number;
    currency: string;
  };
  bestTimeToVisit: string;
  heroImageUrl?: string;
  confidenceScore: number;
  aiReasoning: string;
  status: "new" | "viewed" | "dismissed" | "converted";
  userFeedback?: {
    score: number; // 1 for Thumbs Up, -1 for Thumbs Down
    comment?: string;
  };
  createdAt: Date;
}

const TripSuggestionSchema = new Schema<ITripSuggestion>(
  {
    // User._id is a nanoid String, not a Mongo ObjectId (see shared/schema.ts) —
    // this was previously typed as ObjectId, which threw a CastError on every
    // real query/write against a real user, silently killing the whole
    // Suggestions feature (caught, logged, swallowed by callers).
    userId: { type: String, required: true, index: true },
    destination: { type: String, required: true },
    country: { type: String, required: true },
    tagline: { type: String },
    highlights: [{ type: String }],
    travelStyle: [{ type: String }],
    estimatedBudget: {
      min: { type: Number },
      max: { type: Number },
      currency: { type: String, default: "USD" },
    },
    bestTimeToVisit: { type: String },
    heroImageUrl: { type: String },
    confidenceScore: { type: Number, default: 0 },
    aiReasoning: { type: String },
    status: {
      type: String,
      enum: ["new", "viewed", "dismissed", "converted"],
      default: "new",
    },
    userFeedback: {
      score: { type: Number },
      comment: { type: String },
    },
  },
  {
    timestamps: true,
  },
);

export const TripSuggestion = mongoose.model<ITripSuggestion>(
  "TripSuggestion",
  TripSuggestionSchema,
);
