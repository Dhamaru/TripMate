import { connectDB } from "../db";
import { TripModel } from "@shared/schema";

async function list() {
    await connectDB();
    const trips = await TripModel.find({}).limit(5);
    console.log("Found trips:");
    for (const t of trips) {
        console.log(`- ID: ${t._id}, Destination: ${t.destination}, userId: ${t.userId}, isPublic: ${t.isPublic}, shareId: ${t.shareId}`);
        
        // For testing purposes, make Paris public
        if (t.destination.toLowerCase() === 'paris' && !t.isPublic) {
            t.isPublic = true;
            t.shareId = "TESTPARIS1";
            await t.save();
            console.log(`  [UPDATE] Made Paris trip public! shareId: TESTPARIS1`);
        }
    }
    process.exit(0);
}

list().catch(console.error);
