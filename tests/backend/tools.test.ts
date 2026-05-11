/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../server/index'

describe('External Tools API (Proxies)', () => {
  it('should fetch weather data from Open-Meteo via proxy', async () => {
    const res = await request(app)
      .get('/api/v1/weather/forecast?lat=35.6762&lon=139.6503')

    expect(res.status).toBe(200)
    expect(res.body.daily).toBeDefined()
    expect(res.body.daily.temperature_2m_max).toHaveLength(3)
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
    const res = await request(app)
      .get('/api/v1/currency/latest?base=USD&symbols=JPY,EUR')

    expect(res.status).toBe(200)
    expect(res.body.rates).toBeDefined()
    expect(res.body.rates.JPY).toBe(149.5)
  })
})
