import { nanoid } from 'nanoid'
import { User, Trip, PackingList, JournalEntry } from '@shared/schema'

/**
 * Creates a mock user object for DB insertion.
 */
export function createUser(overrides?: Partial<typeof User.prototype>) {
  return {
    username: 'testuser_' + nanoid(5),
    email: `test_${nanoid(5)}@example.com`,
    password: 'Password123!',
    firstName: 'Test',
    lastName: 'User',
    provider: 'local',
    isVerified: true,
    preferences: {
      travelStyles: ['cultural'],
      currency: 'USD',
      theme: 'light',
    },
    ...overrides,
  }
}

/**
 * Creates a mock trip object.
 */
export function createTrip(userId: string, overrides?: Partial<typeof Trip.prototype>) {
  return {
    userId,
    destination: 'Tokyo',
    country: 'Japan',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-07'),
    budget: { min: 800, max: 1500, currency: 'USD' },
    travelStyles: ['cultural', 'adventure'],
    status: 'planned',
    image: 'https://images.unsplash.com/photo-test-tokyo-123',
    itinerary: [],
    metadata: {
      tags: ['temples', 'food'],
      notes: 'Exciting trip!',
    },
    ...overrides,
  }
}

/**
 * Creates a mock packing list item.
 */
export function createPackingItem(tripId: string, overrides?: Partial<typeof PackingList.prototype>) {
  return {
    tripId,
    category: 'Essentials',
    items: [
      { id: nanoid(), name: 'Passport', packed: false, important: true },
      { id: nanoid(), name: 'Charger', packed: true, important: false },
    ],
    ...overrides,
  }
}

/**
 * Creates a mock journal entry.
 */
export function createJournalEntry(tripId: string, overrides?: Partial<typeof JournalEntry.prototype>) {
  return {
    tripId,
    title: 'Arrival in Tokyo',
    content: 'The plane ride was long but the view of Mt. Fuji was amazing.',
    date: new Date('2025-06-01T15:00:00Z'),
    location: { name: 'Narita Airport', lat: 35.7767, lng: 140.3182 },
    mood: 'excited',
    ...overrides,
  }
}
