/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { app } from '../../server/index'
import { connectDB, closeDB, clearDB } from '../helpers/db'
import { createUser, createTrip } from '../helpers/factories'

describe('Trips API', () => {
  let token: string
  let userId: string

  beforeAll(async () => {
    await connectDB()
  })
  afterAll(async () => await closeDB())

  beforeEach(async () => {
    await clearDB()
    const userData = createUser()
    const signupRes = await request(app).post('/api/v1/auth/signup').send(userData)
    token = signupRes.body.token
    userId = signupRes.body.user.id
  })

  it('should create a new trip', async () => {
    const tripData = {
      destination: 'Kyoto',
      startDate: '2025-07-01',
      endDate: '2025-07-05',
      travelStyles: ['cultural'],
      budgetRange: { min: 1000, max: 2000, currency: 'USD' }
    }

    const res = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(tripData)

    expect(res.status).toBe(201)
    expect(res.body.destination).toBe('Kyoto')
    expect(res.body.userId).toBe(userId)
  })

  it('should fetch user trips', async () => {
    const tripData = createTrip(userId, { destination: 'Sapporo' })
    const res_create = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(tripData)

    const res = await request(app)
      .get('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0].destination).toBe('Sapporo')
  })

  it('should generate itinerary for a trip', async () => {
    // Note: This relies on TravelOrchestrator which we mock partially via MSW (external APIs)
    // and Groq SDK if we were using it directly. 
    // For this test, we assume the route works and returns the itinerary format.
    const trip = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(createTrip(userId, { destination: 'Osaka' }))

    const res = await request(app)
      .post(`/api/v1/trips/${trip.body.id}/generate-itinerary`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.itinerary).toBeDefined()
    expect(Array.isArray(res.body.itinerary)).toBe(true)
  })

  it('should delete a trip', async () => {
    const trip = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(createTrip(userId))

    const res = await request(app)
      .delete(`/api/v1/trips/${trip.body.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    
    const getRes = await request(app)
      .get('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
    expect(getRes.body.find((t: any) => t.id === trip.body.id)).toBeUndefined()
  })
})
