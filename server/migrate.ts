import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log("Starting migration...");

  try {
    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        profile_image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    console.log("✓ Created users table");

    // Create trips table
    await sql`
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        destination TEXT NOT NULL,
        budget INTEGER,
        days INTEGER NOT NULL,
        group_size TEXT NOT NULL,
        travel_style TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning',
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        itinerary JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    console.log("✓ Created trips table");

    // Create journal_entries table
    await sql`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        trip_id INTEGER REFERENCES trips(id),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        photos TEXT[],
        location TEXT,
        latitude TEXT,
        longitude TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    console.log("✓ Created journal_entries table");

    // Create packing_lists table
    await sql`
      CREATE TABLE IF NOT EXISTS packing_lists (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        trip_id INTEGER REFERENCES trips(id),
        name TEXT NOT NULL,
        items JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    console.log("✓ Created packing_lists table");

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
