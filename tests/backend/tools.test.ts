/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../server/index'
import { connectDB, closeDB, clearDB } from '../helpers/db'
import { createUser } from '../helpers/factories'

describe('External Tools API (Proxies)', () => {
  let token: string

  beforeAll(async () => {
    await connectDB()
    const signupRes = await request(app).post('/api/v1/auth/signup').send(createUser())
    token = signupRes.body.token
  })
  afterAll(async () => await closeDB())

  it('should fetch weather data from Open-Meteo via proxy', async () => {
    // /weather/forecast requires auth; the response is AiUtilitiesService's
    // transformed shape ({current, forecast, recommendations}), not a raw
    // Open-Meteo passthrough.
    const res = await request(app)
      .get('/api/v1/weather/forecast?lat=35.6762&lon=139.6503')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.current).toBeDefined()
    expect(Array.isArray(res.body.forecast)).toBe(true)
  })

  it('should search for places via Nominatim proxy', async () => {
    const res = await request(app)
      .get('/api/v1/places/search?q=Tokyo')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(res.body.items[0].display_name).toMatch(/Tokyo/i)
  })

  it('should fetch POIs via Overpass proxy', async () => {
    const res = await request(app)
      .get('/api/v1/places/nearby?lat=35.6762&lon=139.6503&type=attraction')

    expect(res.status).toBe(200)
    expect(res.body.elements).toBeDefined()
    expect(res.body.elements.length).toBeGreaterThan(0)
  })

  it('should fetch exchange rates via Frankfurter proxy', async () => {
    // latestCurrency converts a single from->to pair ({rate, convertedAmount,
    // currencyName}), not a multi-symbol {rates:{...}} map.
    const res = await request(app)
      .get('/api/v1/currency/latest?from=USD&to=JPY')

    expect(res.status).toBe(200)
    expect(typeof res.body.rate).toBe('number')
    expect(res.body.currencyName).toBe('JPY')
  })
})
