import mongoose from "mongoose";
import { config } from "../config";
import { connectDB } from "../db";

async function clearDatabase() {
  // This wipes every collection with no prompt and no undo — a guard
  // against `npm run db:clear` being run with a production MONGODB_URI
  // (nothing else about this script would tip you off before it's too
  // late). Set FORCE_DB_CLEAR=1 to intentionally override in a real
  // production data-reset scenario.
  if (config.NODE_ENV === "production" && process.env.FORCE_DB_CLEAR !== "1") {
    console.error(
      "[db:clear] Refusing to run with NODE_ENV=production. Set FORCE_DB_CLEAR=1 to override.",
    );
    process.exit(1);
  }

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
