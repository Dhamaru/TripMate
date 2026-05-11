// Task 2 — Environment config
// Validates required env vars at startup

const requiredVars = {
    VITE_API_URL: (import.meta.env.VITE_API_URL as string) || (import.meta.env.DEV ? 'http://localhost:5000' : ''),
} as const

Object.entries(requiredVars).forEach(([key, value]) => {
    if (!value) throw new Error(`Missing environment variable: ${key}`)
})

export const env = requiredVars
