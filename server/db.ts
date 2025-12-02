import mongoose from "mongoose";
import { connectMongo } from "@shared/schema";

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI not set; starting without database connection");
    return;
  }
  try {
    await connectMongo(uri);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};
