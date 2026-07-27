/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../../server/index'
import { connectDB, closeDB, clearDB } from '../helpers/db'
import { createUser } from '../helpers/factories'

describe('Authentication API', () => {
  beforeAll(async () => await connectDB())
  afterAll(async () => await closeDB())
  beforeEach(async () => await clearDB())

  it('should register a new user successfully', async () => {
    const userData = createUser({ password: 'StrongPassword123!' })
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send(userData)

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe(userData.email)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.password).toBeUndefined() // Password should not be returned
  })

  it('should fail registration with an existing email', async () => {
    const userData = createUser({ email: 'duplicate@example.com' })
    await request(app).post('/api/v1/auth/signup').send(userData)

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send(userData)

    expect(res.status).toBe(400)
    // errorHandler puts the message on `error`, not `message`
    expect(res.body.error).toMatch(/already exists/i)
  })

  it('should sign in an existing user', async () => {
    const userData = {
      username: 'signinuser',
      email: 'signin@example.com',
      password: 'Password123!',
      firstName: 'Sign',
      lastName: 'In'
    }
    await request(app).post('/api/v1/auth/signup').send(userData)

    const res = await request(app)
      .post('/api/v1/auth/signin')
      .send({ email: userData.email, password: userData.password })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe(userData.email)
  })

  it('should fail sign in with incorrect password', async () => {
    const userData = createUser({ password: 'CorrectPassword123!' })
    await request(app).post('/api/v1/auth/signup').send(userData)

    const res = await request(app)
      .post('/api/v1/auth/signin')
      .send({ email: userData.email, password: 'WrongPassword' })

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/invalid credentials/i)
  })

  it('should return 401 for unauthorized profile access', async () => {
    const res = await request(app).get('/api/v1/auth/profile')
    expect(res.status).toBe(401)
  })
})
