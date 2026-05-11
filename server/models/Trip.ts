import mongoose, { Schema, Document } from "mongoose";

export interface ITrip extends Document {
    userId: mongoose.Types.ObjectId | string;
    destination: string;
    startDate: Date;
    endDate: Date;
    totalBudget?: number;
    travelStyle?: string;
    travelMedium?: string;
    companions?: string;
    destinationPhotoUrl?: string;
    budgetBreakdown?: Record<string, any>;
    itinerary?: any[];
    status?: string;
    shareId?: string;
    isPublic?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const tripSchema = new Schema<ITrip>(
    {
        userId: { type: Schema.Types.Mixed, ref: 'User', required: true },
        destination: { type: String, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        totalBudget: { type: Number },
        travelStyle: { type: String },
        travelMedium: { type: String },
        companions: { type: String },
        destinationPhotoUrl: { type: String },
        budgetBreakdown: { type: Schema.Types.Mixed },
        itinerary: [{ type: Schema.Types.Mixed }],
        status: { type: String, default: 'upcoming' },
        shareId: { type: String, unique: true, sparse: true },
        isPublic: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const TripModel = mongoose.models.Trip || mongoose.model<ITrip>("Trip", tripSchema);
export default TripModel;
