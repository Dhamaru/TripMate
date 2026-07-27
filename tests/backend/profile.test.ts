/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../server/index'
import { connectDB, closeDB, clearDB } from '../helpers/db'
import { createUser } from '../helpers/factories'

describe('User Profile API', () => {
  let token: string
  let userId: string

  beforeAll(async () => await connectDB())
  afterAll(async () => await closeDB())

  beforeEach(async () => {
    await clearDB()
    const userData = createUser()
    const signupRes = await request(app).post('/api/v1/auth/signup').send(userData)
    token = signupRes.body.token
    userId = signupRes.body.user.id
  })

  it('should fetch user profile', async () => {
    const res = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.email).toBeDefined()
  })

  it('should update user profile fields', async () => {
    // updateProfile only accepts a fixed allow-list of flat fields
    // (firstName, lastName, phoneNumber, homeCity, dietaryPreferences,
    // interests, preferredTransport, travelStyle) — there is no nested
    // "preferences" object on the User model.
    const updates = {
      homeCity: 'Berlin',
      interests: ['hiking', 'food'],
    }

    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send(updates)

    expect(res.status).toBe(200)
    expect(res.body.homeCity).toBe('Berlin')
    expect(res.body.interests).toContain('hiking')
  })
})
