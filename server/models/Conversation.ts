import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMessage {
    role: "system" | "user" | "assistant" | "tool";
    content?: string;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
    timestamp: Date;
}

export interface IConversation extends Document {
    tripId: string;
    userId: string;
    messages: IMessage[];
    metadata?: {
        totalToolCalls: number;
        toolsUsed: string[];
        lastConfidence?: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

const messageSchema = new Schema<IMessage>({
    role: { type: String, enum: ["system", "user", "assistant", "tool"], required: true },
    content: { type: String },
    tool_calls: { type: Schema.Types.Mixed },
    tool_call_id: { type: String },
    name: { type: String },
    timestamp: { type: Date, default: Date.now },
});

const conversationSchema = new Schema<IConversation>(
    {
        tripId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        messages: [messageSchema],
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
conversationSchema.index({ tripId: 1, userId: 1 }, { unique: true });

export const ConversationModel: Model<IConversation> =
    mongoose.models.Conversation || mongoose.model<IConversation>("Conversation", conversationSchema);
