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
    // POST /trips/:id/packing is the AI-generation endpoint (ignores a
    // manual items body) — manual creation goes through POST /packing,
    // and createPackingListSchema requires `name` (not `category`) plus
    // per-item `quantity`/`category`, not `packed`/`important`.
    const packingData = {
      tripId,
      name: 'Electronics',
      items: [{ name: 'Laptop', quantity: 1, category: 'Electronics' }],
    }

    await request(app)
      .post('/api/v1/packing')
      .set('Authorization', `Bearer ${token}`)
      .send(packingData)

    const res = await request(app)
      .get(`/api/v1/packing?tripId=${tripId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('Electronics')
    expect(res.body[0].items[0].name).toBe('Laptop')
  })

  it('should toggle item packed status', async () => {
    const packingRes = await request(app)
      .post('/api/v1/packing')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tripId,
        name: 'Clothes',
        items: [{ name: 'Shirts', quantity: 2 }],
      })

    const listId = packingRes.body.id
    // The top-level document gets the id transform (_id -> id), but nested
    // array subdocuments don't have their own toJSON config, so they keep
    // Mongoose's default `_id` key rather than `id`.
    const itemId = packingRes.body.items[0]._id

    const res = await request(app)
      .patch(`/api/v1/packing/${listId}/items/${itemId}/toggle`)
      .set('Authorization', `Bearer ${token}`)

    // togglePackingItem responds with the bare toggled item, not the
    // wrapping list.
    expect(res.status).toBe(200)
    expect(res.body.packed).toBe(true)
  })
})
