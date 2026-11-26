// Task 10 — Unit tests for the weather handler tool
import { describe, it, expect, vi, beforeEach } from 'vitest'

// We will mock fetch inside each test to avoid interference

describe('weatherHandler', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.resetModules()
    })

    it('returns packingFlag for warm weather', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch')
        
        // Geocoding response
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ results: [{ latitude: 35.68, longitude: 139.69, name: 'Tokyo' }] }),
        } as Response)
        // Forecast response
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                current: { temperature_2m: 28, relative_humidity_2m: 60, wind_speed_10m: 10, weather_code: 1 },
                daily: {
                    time: ['2025-06-01', '2025-06-02', '2025-06-03'],
                    temperature_2m_max: [28, 30, 29],
                    temperature_2m_min: [20, 22, 21],
                    precipitation_probability_max: [0, 0, 0],
                    weather_code: [0, 1, 0],
                },
            }),
        })

        const { weatherHandler } = await import('../../../agent/tools/handlers/weatherHandler')
        const result = await weatherHandler({ location: 'Tokyo' })

        expect(result.success, result.error).toBe(true)
        expect(result.data).toHaveProperty('packingFlag')
        expect(typeof (result.data as { packingFlag: string }).packingFlag).toBe('string')
    })

    it('returns error when destination not found', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch')
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ results: [] }),
        } as Response)

        const { weatherHandler } = await import('../../../agent/tools/handlers/weatherHandler')
        const result = await weatherHandler({ location: 'XYZFakePlace999' })

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
    })

    it('returns error on network failure', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch')
        fetchSpy.mockRejectedValueOnce(new Error('Network error'))

        const { weatherHandler } = await import('../../../agent/tools/handlers/weatherHandler')
        const result = await weatherHandler({ location: 'Tokyo' })

        expect(result.success).toBe(false)
        expect(result.error).toContain('Could not geocode')
    })

    it('returns forecast array with 7 or fewer days', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch')
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ results: [{ latitude: 48.85, longitude: 2.35, name: 'Paris' }] }),
        } as Response)
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                current: { temperature_2m: 18, relative_humidity_2m: 55, wind_speed_10m: 5, weather_code: 2 },
                daily: {
                    time: ['2025-09-01', '2025-09-02', '2025-09-03', '2025-09-04', '2025-09-05', '2025-09-06', '2025-09-07'],
                    temperature_2m_max: [22, 21, 20, 23, 24, 22, 21],
                    temperature_2m_min: [14, 13, 12, 15, 16, 14, 13],
                    precipitation_probability_max: [10, 20, 30, 5, 0, 10, 15],
                    weather_code: [0, 2, 3, 0, 1, 2, 1],
                },
            }),
        })

        const { weatherHandler } = await import('../../../agent/tools/handlers/weatherHandler')
        const result = await weatherHandler({ location: 'Paris' })

        expect(result.success, result.error).toBe(true)
        const data = result.data as { forecast: unknown[] }
        expect(data.forecast).toHaveLength(7)
    })
})
