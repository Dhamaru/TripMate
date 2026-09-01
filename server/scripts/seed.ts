// Seed script — populates the database with realistic test data for development
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { config } from "../config";
import {
  connectMongo,
  UserModel,
  TripModel,
  PackingListModel,
  JournalEntryModel,
} from "@shared/schema";

async function seed() {
  if (config.NODE_ENV === "production" && process.env.FORCE_DB_SEED !== "1") {
    console.error(
      "[db:seed] Refusing to run with NODE_ENV=production. Set FORCE_DB_SEED=1 to override.",
    );
    process.exit(1);
  }
  const uri = config.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in .env");
  await connectMongo(uri);
  console.log("🌱 Connected to MongoDB");

  // ── USER ──
  const testEmail = "test@tripmate.dev";
  await UserModel.deleteMany({ email: testEmail });

  const passwordHash = await bcrypt.hash("TestPass123!", 10);
  const user = await UserModel.create({
    _id: "user_test_default_id",
    email: testEmail,
    password: passwordHash,
    firstName: "Test",
    lastName: "Traveler",
  });
  console.log(`✅ User: ${user._id} (test@tripmate.dev / TestPass123!)`);

  const userId = user._id; // Ensure we use the string ID for subsequent seeds

  // ── TOKYO TRIP ──
  const tokyoTrip = await TripModel.findOneAndUpdate(
    { userId: user._id, destination: "Tokyo, Japan" },
    {
      userId: user._id,
      destination: "Tokyo, Japan",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-03"),
      totalBudget: 2000,
      travelStyle: "Adventure",
      travelMedium: "Flight",
      companions: 2,
      budgetBreakdown: {
        accommodation: 600,
        food: 450,
        transport: 360,
        activities: 390,
        safetyBuffer: 200,
      },
      itinerary: [
        {
          dayIndex: 0,
          day: 1,
          activities: [
            {
              id: randomUUID(),
              time: "09:00 AM",
              title: "Senso-ji Temple",
              placeName: "Senso-ji",
              location: "Asakusa",
              type: "cultural",
              lat: 35.7148,
              lng: 139.7967,
            },
            {
              id: randomUUID(),
              time: "12:00 PM",
              title: "Ramen at Ichiran",
              placeName: "Ichiran",
              location: "Shibuya",
              type: "food",
              lat: 35.6598,
              lng: 139.7023,
            },
            {
              id: randomUUID(),
              time: "03:00 PM",
              title: "Shibuya Crossing",
              placeName: "Shibuya Crossing",
              location: "Shibuya",
              type: "sightseeing",
              lat: 35.6595,
              lng: 139.7005,
            },
          ],
          reasoning: "Cultural immersion in historic Asakusa, then modern Shibuya energy.",
          confidenceScore: "high",
        },
        {
          dayIndex: 1,
          day: 2,
          activities: [
            {
              id: randomUUID(),
              time: "08:00 AM",
              title: "Tsukiji Outer Market",
              placeName: "Tsukiji Market",
              location: "Tsukiji",
              type: "food",
              lat: 35.6654,
              lng: 139.7707,
            },
            {
              id: randomUUID(),
              time: "11:00 AM",
              title: "teamLab Borderless",
              placeName: "teamLab",
              location: "Odaiba",
              type: "entertainment",
              lat: 35.6252,
              lng: 139.7751,
            },
            {
              id: randomUUID(),
              time: "06:00 PM",
              title: "Akihabara at Night",
              placeName: "Akihabara",
              location: "Akihabara",
              type: "entertainment",
              lat: 35.7022,
              lng: 139.7741,
            },
          ],
          reasoning: "Food culture, digital art, and Tokyo tech culture.",
          confidenceScore: "high",
        },
        {
          dayIndex: 2,
          day: 3,
          activities: [
            {
              id: randomUUID(),
              time: "07:00 AM",
              title: "Shinjuku Gyoen",
              placeName: "Shinjuku Gyoen",
              location: "Shinjuku",
              type: "nature",
              lat: 35.6852,
              lng: 139.71,
            },
            {
              id: randomUUID(),
              time: "01:00 PM",
              title: "Tokyo Skytree",
              placeName: "Tokyo Skytree",
              location: "Asakusa",
              type: "sightseeing",
              lat: 35.7101,
              lng: 139.8107,
            },
            {
              id: randomUUID(),
              time: "07:00 PM",
              title: "Farewell Dinner",
              placeName: "Sukiyabashi Jiro",
              location: "Ginza",
              type: "food",
              lat: 35.6717,
              lng: 139.764,
            },
          ],
          reasoning: "Relaxed morning, iconic views, memorable farewell.",
          confidenceScore: "medium",
        },
      ],
    },
    { upsert: true, new: true },
  );
  console.log(`✅ Tokyo Trip: ${tokyoTrip._id}`);

  // ── PARIS TRIP ──
  const parisTrip = await TripModel.findOneAndUpdate(
    { userId: user._id, destination: "Paris, France" },
    {
      userId: user._id,
      destination: "Paris, France",
      startDate: new Date("2025-09-15"),
      endDate: new Date("2025-09-17"),
      totalBudget: 3000,
      travelStyle: "Cultural",
      travelMedium: "Flight",
      companions: 1,
      budgetBreakdown: {
        accommodation: 900,
        food: 675,
        transport: 540,
        activities: 585,
        safetyBuffer: 300,
      },
      itinerary: [
        {
          dayIndex: 0,
          day: 1,
          activities: [
            {
              id: randomUUID(),
              time: "09:00 AM",
              title: "Eiffel Tower",
              placeName: "Eiffel Tower",
              location: "7th arrondissement",
              type: "sightseeing",
              lat: 48.8584,
              lng: 2.2945,
            },
            {
              id: randomUUID(),
              time: "01:00 PM",
              title: "Lunch at Café de Flore",
              placeName: "Café de Flore",
              location: "Saint-Germain",
              type: "food",
              lat: 48.8539,
              lng: 2.3328,
            },
            {
              id: randomUUID(),
              time: "03:00 PM",
              title: "Louvre Museum",
              placeName: "Louvre",
              location: "1st arrondissement",
              type: "cultural",
              lat: 48.8606,
              lng: 2.3376,
            },
          ],
          reasoning: "Classic Parisian landmarks with proper time at each.",
          confidenceScore: "high",
        },
      ],
    },
    { upsert: true, new: true },
  );
  console.log(`✅ Paris Trip: ${parisTrip._id}`);

  /*
    // ── JOURNAL ENTRIES ──
    const journalEntries = await Promise.all([
        JournalEntryModel.findOneAndUpdate(
            { userId: user._id, tripId: tokyoTrip._id, title: 'Tokyo Day 1' },
            { userId: user._id, tripId: tokyoTrip._id, title: 'Tokyo Day 1', content: 'First day in Tokyo was overwhelming in the best way. Senso-ji was magical, Ichiran ramen was life-changing.' },
            { upsert: true, new: true }
        ),
        JournalEntryModel.findOneAndUpdate(
            { userId: user._id, tripId: tokyoTrip._id, title: 'Tokyo Day 2' },
            { userId: user._id, tripId: tokyoTrip._id, title: 'Tokyo Day 2', content: 'teamLab Borderless was unlike anything I have ever seen. Standing in the infinite digital waterfall room, I forgot I was in a building.' },
            { upsert: true, new: true }
        ),
        JournalEntryModel.findOneAndUpdate(
            { userId: user._id, tripId: tokyoTrip._id, title: 'Tokyo Day 3' },
            { userId: user._id, tripId: tokyoTrip._id, title: 'Tokyo Day 3', content: 'Last morning in Shinjuku Gyoen was peaceful. The farewell sushi dinner cost more than my flight but zero regrets.' },
            { upsert: true, new: true }
        ),
    ])
    console.log(`✅ Journal entries: ${journalEntries.map(e => e._id).join(', ')}`)
    */

  // ── PACKING LIST ──
  const packingList = await PackingListModel.findOneAndUpdate(
    { userId: user._id, tripId: tokyoTrip._id },
    {
      userId: user._id,
      tripId: tokyoTrip._id,
      weatherNote:
        "June in Tokyo is warm and humid (24–30°C). Pack light breathable clothing and a compact umbrella.",
      totalItems: 12,
      categories: [
        {
          name: "Clothing",
          icon: "👕",
          items: [
            {
              id: randomUUID(),
              name: "Light t-shirts",
              quantity: 4,
              essential: true,
              packed: false,
            },
            {
              id: randomUUID(),
              name: "Comfortable walking shoes",
              quantity: 1,
              essential: true,
              packed: true,
            },
            {
              id: randomUUID(),
              name: "Light rain jacket",
              quantity: 1,
              essential: true,
              packed: false,
            },
          ],
        },
        {
          name: "Documents",
          icon: "📄",
          items: [
            { id: randomUUID(), name: "Passport", quantity: 1, essential: true, packed: true },
            {
              id: randomUUID(),
              name: "Travel insurance docs",
              quantity: 1,
              essential: true,
              packed: false,
            },
          ],
        },
        {
          name: "Electronics",
          icon: "🔌",
          items: [
            {
              id: randomUUID(),
              name: "Universal power adapter",
              quantity: 1,
              essential: true,
              packed: false,
            },
            {
              id: randomUUID(),
              name: "Portable charger",
              quantity: 1,
              essential: true,
              packed: false,
            },
          ],
        },
        {
          name: "Money",
          icon: "💴",
          items: [
            {
              id: randomUUID(),
              name: "Yen cash",
              quantity: 1,
              essential: true,
              packed: false,
              note: "Many places cash-only",
            },
            {
              id: randomUUID(),
              name: "Suica IC Card",
              quantity: 1,
              essential: true,
              packed: false,
              note: "Essential for Tokyo transit",
            },
            {
              id: randomUUID(),
              name: "Backup credit card",
              quantity: 1,
              essential: true,
              packed: false,
            },
          ],
        },
      ],
    },
    { upsert: true, new: true },
  );
  console.log(`✅ Packing list: ${packingList._id}`);

  console.log("\n🌱 Seed complete!");
  console.log("─".repeat(40));
  console.log(`User ID:         ${userId}`);
  console.log(`Tokyo Trip ID:   ${tokyoTrip._id}`);
  console.log(`Paris Trip ID:   ${parisTrip._id}`);
  console.log(`Packing List ID: ${packingList._id}`);
  // console.log(`Journal IDs:     ${journalEntries.map(e => e._id).join(', ')}`)
  console.log("─".repeat(40));
  console.log("Login: test@tripmate.dev / TestPass123!");

  await new Promise<void>((resolve) => {
    // mongoose.disconnect() comes from connectMongo's underlying connection
    setTimeout(async () => {
      const mongoose = await import("mongoose");
      await mongoose.default.disconnect();
      resolve();
    }, 500);
  });
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
