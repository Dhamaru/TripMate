import mongoose from "mongoose";

export interface UserMemory {
    userId: string;
    preferences: {
        primaryTravelStyle: string;
        preferredPace: "fast" | "medium" | "slow";
        budgetSensitivity: number; // 0-1 (low-high)
        foodRestrictions?: string[];
        favoriteCategories?: string[]; // e.g., ["museums", "nature", "fine-dining"]
    };
    tripHistorySummary: {
        totalTrips: number;
        mostVisitedRegion?: string;
        averageTripDuration: number;
        averageBudgetPerDay: number;
    };
    derivedInsights: string[]; // e.g., "User consistently overrides high-fatigue days"
    lastUpdated: Date;
}

const memorySchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    preferences: {
        primaryTravelStyle: { type: String, default: "standard" },
        preferredPace: { type: String, enum: ["fast", "medium", "slow"], default: "medium" },
        budgetSensitivity: { type: Number, default: 0.5 },
        foodRestrictions: [{ type: String }],
        favoriteCategories: [{ type: String }]
    },
    tripHistorySummary: {
        totalTrips: { type: Number, default: 0 },
        mostVisitedRegion: { type: String },
        averageTripDuration: { type: Number, default: 0 },
        averageBudgetPerDay: { type: Number, default: 0 }
    },
    derivedInsights: [{ type: String }],
    lastUpdated: { type: Date, default: Date.now }
});

export const UserMemoryModel = mongoose.model<UserMemory & mongoose.Document>("UserMemory", memorySchema);

export class UserMemoryService {
    public async getMemoryContext(userId: string): Promise<UserMemory | null> {
        const memory = await UserMemoryModel.findOne({ userId });
        return memory ? memory.toObject() : null;
    }

    public async updateMemoryFromTrip(userId: string, tripRef: any): Promise<void> {
        // Agentic implicit preference inference:
        // Analyzes a completed/planned trip to adjust preferences without explicit user forms.
        const memory = await UserMemoryModel.findOne({ userId }) || new UserMemoryModel({ userId });

        memory.tripHistorySummary.totalTrips += 1;
        // ... complex logic to tweak budgetSensitivity and preferredPace based on actual plan
        memory.lastUpdated = new Date();

        await memory.save();
    }

    public async deriveInsightsPrompt(userId: string): Promise<string> {
        const memory = await this.getMemoryContext(userId);
        if (!memory) return "No prior user context available.";

        return `User Context: Prefers ${memory.preferences.preferredPace} pace, travel style is ${memory.preferences.primaryTravelStyle}. Budget sensitivity is ${memory.preferences.budgetSensitivity}. History: ${memory.tripHistorySummary.totalTrips} past trips. Insights: ${memory.derivedInsights.join("; ")}`;
    }
}
