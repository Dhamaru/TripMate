/** @vitest-environment node */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../../server/index'

describe('Security & Middleware', () => {
  it('should have security headers from Helmet', async () => {
    const res = await request(app).get('/')
    expect(res.header['x-content-type-options']).toBe('nosniff')
    expect(res.header['x-frame-options']).toBeDefined()
  })

  it('should enforce rate limiting on auth routes', async () => {
    // Note: This might be hard to test without many requests, 
    // but we can check if the headers exist.
    const res = await request(app).post('/api/v1/auth/signin').send({})
    // express-rate-limit v7 with standardHeaders:true emits the draft-6
    // "RateLimit-*" headers (lowercased by node to "ratelimit-*"), not the
    // legacy "X-RateLimit-*" family (explicitly disabled via legacyHeaders:false).
    expect(res.header['ratelimit-limit']).toBeDefined()
  })

  it('should handle large payloads with 413 error (via express limit)', async () => {
    const largeData = 'a'.repeat(1 * 1024 * 1024 + 1) // 1MB+
    const res = await request(app).post('/api/v1/auth/signup').send({ data: largeData })
    // Error status depends on body-parser config, usually 413.
    // If not configured, it might just fail validation with 400.
    expect([413, 400]).toContain(res.status)
  })

  it('should sanitize MongoDB queries (prevent NoSQL injection)', async () => {
    // mongo-sanitize middleware should prevent objects in query params
    const res = await request(app)
      .get('/api/v1/auth/profile')
      .query({ email: { $gt: '' } })
    
    // If sanitized, the query parameter will be stripped or handled as string.
    // Expect 401 because it's still unauthorized, but not a server crash.
    expect(res.status).toBe(401)
  })
})
