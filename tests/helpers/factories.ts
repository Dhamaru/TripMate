import { nanoid } from 'nanoid'
import { User, Trip, PackingList, JournalEntry } from '@shared/schema'

/**
 * Creates a mock user object for DB insertion.
 */
export function createUser(overrides?: Partial<typeof User.prototype>) {
  return {
    username: 'testuser_' + nanoid(5),
    // lowercase — the signup controller normalizes email to lowercase before
    // storing/comparing, so a mixed-case nanoid segment would fail an
    // exact-match assertion against the original factory value
    email: `test_${nanoid(5)}@example.com`.toLowerCase(),
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
    origin: 'Delhi',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-07'),
    budget: 1500,
    currency: 'USD',
    days: 6,
    groupSize: 2,
    travelStyle: 'cultural',
    transportMode: 'flight',
    status: 'planning',
    itinerary: [],
    notes: 'Exciting trip!',
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
    location: 'Narita Airport',
    latitude: 35.7767,
    longitude: 140.3182,
    ...overrides,
  }
}
