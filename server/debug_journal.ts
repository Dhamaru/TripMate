
import { connectDB } from "./db";
import { JournalEntryModel } from "@shared/schema";
import "dotenv/config";

async function main() {
    await connectDB();
    const latestEntry = await JournalEntryModel.findOne().sort({ updatedAt: -1 });
    console.log(JSON.stringify(latestEntry, null, 2));
    process.exit(0);
}

main().catch(console.error);
