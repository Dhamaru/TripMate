/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../server/index'
import { connectDB, closeDB, clearDB } from '../helpers/db'
import { createUser, createTrip, createJournalEntry } from '../helpers/factories'

describe('Journal API', () => {
  let token: string
  let userId: string
  let tripId: string

  beforeAll(async () => await connectDB())
  afterAll(async () => await closeDB())

  beforeEach(async () => {
    await clearDB()
    const userData = createUser()
    const signupRes = await request(app).post('/api/v1/auth/signup').send(userData)
    token = signupRes.body.token
    userId = signupRes.body.user.id

    const tripRes = await request(app)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(createTrip(userId))
    tripId = tripRes.body.id
  })

  it('should create a journey entry', async () => {
    const entryData = {
      title: 'First Day in Tokyo',
      content: 'Beautiful sunset.',
      mood: 'happy'
    }

    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`)
      .send(entryData)

    expect(res.status).toBe(201)
    expect(res.body.title).toBe('First Day in Tokyo')
  })

  it('should list all entries for a trip', async () => {
    await request(app)
      .post(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`)
      .send(createJournalEntry(tripId, { title: 'Day 1' }))

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}/journal`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
  })
})
