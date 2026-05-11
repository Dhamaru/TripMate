/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../server/index'
import { connectDB, closeDB, clearDB } from '../helpers/db'
import { createUser, createTrip } from '../helpers/factories'

describe('Packing List API', () => {
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

  it('should create and fetch packing list for a trip', async () => {
    const packingData = {
      category: 'Electronics',
      items: [{ name: 'Laptop', packed: false, important: true }]
    }

    await request(app)
      .post(`/api/v1/trips/${tripId}/packing`)
      .set('Authorization', `Bearer ${token}`)
      .send(packingData)

    const res = await request(app)
      .get(`/api/v1/trips/${tripId}/packing`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body[0].category).toBe('Electronics')
    expect(res.body[0].items[0].name).toBe('Laptop')
  })

  it('should toggle item packed status', async () => {
    const packingRes = await request(app)
      .post(`/api/v1/trips/${tripId}/packing`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'Clothes',
        items: [{ name: 'Shirts', packed: false }]
      })
    
    const listId = packingRes.body.id
    const itemId = packingRes.body.items[0].id

    const res = await request(app)
      .patch(`/api/v1/trips/${tripId}/packing/${listId}/items/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ packed: true })

    expect(res.status).toBe(200)
    expect(res.body.items[0].packed).toBe(true)
  })
})
