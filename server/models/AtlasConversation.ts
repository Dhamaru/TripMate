import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAtlasMessage {
    role: "system" | "user" | "assistant" | "tool";
    content?: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
    timestamp: Date;
}

export interface IAtlasConversation extends Document {
    tripId: string;
    userId: string;
    messages: IAtlasMessage[];
    metadata?: {
        totalToolCalls: number;
        toolsUsed: string[];
        lastConfidence?: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

const atlasMessageSchema = new Schema<IAtlasMessage>({
    role: { type: String, enum: ["system", "user", "assistant", "tool"], required: true },
    content: { type: String },
    tool_calls: { type: Schema.Types.Mixed },
    tool_call_id: { type: String },
    name: { type: String },
    timestamp: { type: Date, default: Date.now },
});

const atlasConversationSchema = new Schema<IAtlasConversation>(
    {
        tripId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        messages: [atlasMessageSchema],
        metadata: {
            totalToolCalls: { type: Number, default: 0 },
            toolsUsed: [{ type: String }],
            lastConfidence: { type: Number },
        },
    },
    {
        timestamps: true,
    }
);

// Ensure one conversation per trip per user
atlasConversationSchema.index({ tripId: 1, userId: 1 }, { unique: true });

export const AtlasConversationModel: Model<IAtlasConversation> =
    mongoose.models.AtlasConversation || mongoose.model<IAtlasConversation>("AtlasConversation", atlasConversationSchema);

export default AtlasConversationModel;
