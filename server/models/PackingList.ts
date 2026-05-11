import mongoose, { Schema, Document } from "mongoose";

export interface IPackingList extends Document {
    userId: mongoose.Types.ObjectId | string;
    tripId: mongoose.Types.ObjectId | string;
    categories: any[];
    weatherNote?: string;
    totalItems?: number;
    createdAt: Date;
    updatedAt: Date;
}

const packingListSchema = new Schema<IPackingList>(
    {
        userId: { type: Schema.Types.Mixed, ref: 'User', required: true },
        tripId: { type: Schema.Types.Mixed, ref: 'Trip', required: true },
        categories: [{ type: Schema.Types.Mixed }],
        weatherNote: { type: String },
        totalItems: { type: Number },
    },
    { timestamps: true }
);

export const PackingListModel = mongoose.models.PackingList || mongoose.model<IPackingList>("PackingList", packingListSchema);
export default PackingListModel;
