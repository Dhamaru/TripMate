// Server test setup — mocks logger to suppress output during tests
import { vi } from 'vitest'

vi.mock('../logger', () => ({
    default: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        aiCall: vi.fn(),
        apiRequest: vi.fn(),
        dbQuery: vi.fn(),
    },
}))
