process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tripmate-test'

import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './mocks/server'

// Start MSW mock server for all external HTTP calls
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => {
  server.resetHandlers()
  vi.clearAllMocks()
})
afterAll(() => server.close())
