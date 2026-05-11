// Client test setup — extends jest-dom matchers for DOM assertions
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
    cleanup()
})
