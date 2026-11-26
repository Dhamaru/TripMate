import { connectDB } from "../server/db";
import { UserModel } from "@shared/schema";
import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function resetUsers() {
    console.log("Connecting to database...");
    await connectDB();

    console.log("Deleting all users...");
    const result = await UserModel.deleteMany({});
    console.log(`Deleted ${result.deletedCount} users.`);

    await mongoose.disconnect();
    console.log("Disconnected.");
    process.exit(0);
}

resetUsers().catch((err) => {
    console.error("Error resetting users:", err);
    process.exit(1);
});
