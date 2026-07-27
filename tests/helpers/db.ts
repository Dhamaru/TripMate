import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

let mongod: MongoMemoryServer | undefined

/**
 * Connect to the in-memory database.
 */
export async function connectDB() {
  if (!mongod) {
    mongod = await MongoMemoryServer.create()
    const uri = mongod.getUri()
    // The app's own startup (server/db.ts) may have already opened mongoose's
    // default connection (e.g. against the placeholder test MONGODB_URI) —
    // mongoose only allows one open default connection at a time.
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }
    await mongoose.connect(uri)
  }
}

/**
 * Drop database, close the connection and stop mongod.
 */
export async function closeDB() {
  if (mongod) {
    await mongoose.connection.dropDatabase()
    await mongoose.connection.close()
    await mongod.stop()
    mongod = undefined
  }
}

/**
 * Remove all data for all db collections.
 */
export async function clearDB() {
  const collections = mongoose.connection.collections
  for (const key in collections) {
    const collection = collections[key]
    await collection.deleteMany({})
  }
}
