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

  it('should fetch modern user profile with preferences', async () => {
    const res = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.email).toBeDefined()
    expect(res.body.preferences).toBeDefined()
  })

  it('should update user preferences', async () => {
    const updates = {
      preferences: {
        travelStyles: ['adventure', 'luxury'],
        currency: 'EUR',
        theme: 'dark'
      }
    }

    const res = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send(updates)

    expect(res.status).toBe(200)
    expect(res.body.preferences.currency).toBe('EUR')
    expect(res.body.preferences.travelStyles).toContain('luxury')
  })
})
