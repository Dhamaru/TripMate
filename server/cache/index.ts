// Cache service singleton wrapping node-cache with typed get/set and TTL constants
import NodeCache from 'node-cache'

// TTL constants in seconds
export const CACHE_TTL = {
    WEATHER: 3600,       // 1 hour
    CURRENCY: 1800,      // 30 minutes
    PLACES: 86400,       // 24 hours
    EMERGENCY: 86400,    // 24 hours
    PACKING: 3600,       // 1 hour
} as const

class CacheService {
    private cache: NodeCache

    constructor() {
        this.cache = new NodeCache({ stdTTL: 600, checkperiod: 120 })
    }

    get<T>(key: string): T | undefined {
        return this.cache.get<T>(key)
    }

    set<T>(key: string, value: T, ttlSeconds: number): boolean {
        return this.cache.set(key, value, ttlSeconds)
    }

    delete(key: string): number {
        return this.cache.del(key)
    }

    flush(): void {
        this.cache.flushAll()
    }

    has(key: string): boolean {
        return this.cache.has(key)
    }
}

// Singleton export
export const cacheService = new CacheService()
