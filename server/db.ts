import { config } from "./config";
import { connectMongo } from "@shared/schema";

export const connectDB = async () => {
  const uri = config.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI not set; starting without database connection");
    return;
  }
  try {
    await connectMongo(uri);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    if (config.NODE_ENV === "production") {
      process.exit(1);
    } else {
      console.warn("Continuing without MongoDB connection (Development Mode)");
    }
  }
};
