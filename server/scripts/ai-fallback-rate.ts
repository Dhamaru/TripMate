/**
 * Reports how often AiUtilitiesService.planTrip's primary generation
 * pipeline (DraftingAgent + FormattingAgent) has actually fallen through to
 * the simpler fallback generator in production, per AiFallbackEventModel
 * (shared/schema.ts). Answers the question the LLM Council's verdict
 * flagged as unanswered before attempting a fix: is 5/5 in one test
 * session representative of real traffic, or an artifact of that session?
 *
 *   npx tsx server/scripts/ai-fallback-rate.ts [--days=7]
 */
import "dotenv/config";
import { config } from "../config";
import { AiFallbackEventModel, connectMongo } from "@shared/schema";
import mongoose from "mongoose";

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const days = daysArg ? parseInt(daysArg.split("=")[1], 10) : 7;

async function main() {
  await connectMongo(config.MONGODB_URI!);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const total = await AiFallbackEventModel.countDocuments({ createdAt: { $gte: since } });
  const byReason = await AiFallbackEventModel.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$reason", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const byDestination = await AiFallbackEventModel.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$destination", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  console.log(`Fallback events in the last ${days} day(s): ${total}`);
  console.log("\nBy failure reason:");
  for (const r of byReason) console.log(`  ${r.count}x — ${r._id}`);
  console.log("\nTop destinations hitting fallback:");
  for (const d of byDestination) console.log(`  ${d.count}x — ${d._id}`);

  if (total === 0) {
    console.log(
      "\nNo events recorded yet in this window — either the primary pipeline hasn't run since instrumentation was added, or it's been reliable. Re-check after real traffic.",
    );
  }

  await mongoose.disconnect();
}
main();
