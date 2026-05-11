import mongoose, { Document, Schema } from 'mongoose';

export interface IAgentResult {
    agent: string;
    success: boolean;
    data: any;
    error?: string;
    confidence: number;
    tokensUsed: number;
    durationMs: number;
    toolCallCount: number;
}

export interface IAgentJob extends Document {
    jobId: string;
    userId: mongoose.Types.ObjectId;
    tripId?: mongoose.Types.ObjectId;
    trigger: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    results: IAgentResult[];
    totalTokensUsed: number;
    totalDurationMs: number;
    createdAt: Date;
    updatedAt: Date;
}

const AgentResultSchema = new Schema({
    agent: { type: String, required: true },
    success: { type: Boolean, required: true },
    data: { type: Schema.Types.Mixed },
    error: { type: String },
    confidence: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    toolCallCount: { type: Number, default: 0 }
}, { _id: false });

const AgentJobSchema = new Schema<IAgentJob>({
    jobId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', index: true },
    trigger: { type: String, required: true },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending', index: true },
    results: [AgentResultSchema],
    totalTokensUsed: { type: Number, default: 0 },
    totalDurationMs: { type: Number, default: 0 }
}, {
    timestamps: true
});

export const AgentJob = mongoose.model<IAgentJob>('AgentJob', AgentJobSchema);
