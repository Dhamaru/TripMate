import mongoose, { Schema, Document } from "mongoose";

export interface IJournal extends Document {
    userId: mongoose.Types.ObjectId | string;
    tripId: mongoose.Types.ObjectId | string;
    text: string;
    images?: string[];
    entryDate?: Date;
    assignedDayIndex?: number;
    contextualizationConfidence?: number;
    type?: string;
    recapData?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const journalSchema = new Schema<IJournal>(
    {
        userId: { type: Schema.Types.Mixed, ref: 'User', required: true },
        tripId: { type: Schema.Types.Mixed, ref: 'Trip', required: true },
        text: { type: String, required: true },
        images: [{ type: String }],
        entryDate: { type: Date },
        assignedDayIndex: { type: Number },
        contextualizationConfidence: { type: Number },
        type: { type: String, enum: ['entry', 'recap'], default: 'entry' },
        recapData: { type: Schema.Types.Mixed },
    },
    { timestamps: true }
);

export const JournalModel = mongoose.models.Journal || mongoose.model<IJournal>("Journal", journalSchema);
export default JournalModel;
