import mongoose from "mongoose";
import { config } from "../config";
import { connectDB } from "../db";

async function clearDatabase() {
  console.log("Starting database cleanup...");
  
  await connectDB();
  
  const collections = mongoose.connection.collections;

  for (const key in collections) {
    const collection = collections[key];
    console.log(`Clearing collection: ${key}`);
    await collection.deleteMany({});
  }

  console.log("Database cleanup completed successfully.");
  process.exit(0);
}

clearDatabase().catch((err) => {
  console.error("Error clearing database:", err);
  process.exit(1);
});
