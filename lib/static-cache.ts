'use client';

// STATIC-FIRST CACHE SYSTEM
// Inspired by Next.js Static Generation + SWR pattern

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
  stale: boolean;
}

interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  staleWhileRevalidate: number; // Additional time to serve stale data
  version: string; // Data version for invalidation
}

class StaticCache {
  private cache = new Map<string, CacheEntry<any>>();
  private revalidationPromises = new Map<string, Promise<any>>();

  // Default configs for different data types
  private configs: Record<string, CacheConfig> = {
    // Static-like data (updated by cron)
    deals: { ttl: 24 * 60 * 60 * 1000, staleWhileRevalidate: 7 * 24 * 60 * 60 * 1000, version: '1.0' }, // 24h fresh, 7d stale
    
    // User data (updated on mutation)
    'fixed-costs': { ttl: 60 * 60 * 1000, staleWhileRevalidate: 24 * 60 * 60 * 1000, version: '1.0' }, // 1h fresh, 24h stale
    'variable-costs': { ttl: 60 * 60 * 1000, staleWhileRevalidate: 24 * 60 * 60 * 1000, version: '1.0' },
    'direct-costs': { ttl: 60 * 60 * 1000, staleWhileRevalidate: 24 * 60 * 60 * 1000, version: '1.0' },
    'taxes': { ttl: 60 * 60 * 1000, staleWhileRevalidate: 24 * 60 * 60 * 1000, version: '1.0' },
    'pair-value': { ttl: 60 * 60 * 1000, staleWhileRevalidate: 24 * 60 * 60 * 1000, version: '1.0' },
    
    // Profile data (rarely changes)
    'user-profile': { ttl: 30 * 60 * 1000, staleWhileRevalidate: 2 * 60 * 60 * 1000, version: '1.0' }, // 30m fresh, 2h stale
  };

  // Get data with SWR pattern
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    config?: Partial<CacheConfig>
  ): Promise<T> {
    const finalConfig = { ...this.configs[key.split(':')[0]], ...config };
    const entry = this.cache.get(key);
    const now = Date.now();

    // Cache hit - fresh data
    if (entry && !this.isStale(entry, finalConfig, now)) {
      return entry.data;
    }

    // Cache hit - stale data (serve while revalidating)
    if (entry && this.isStaleButValid(entry, finalConfig, now)) {
      // Serve stale data immediately
      this.revalidateInBackground(key, fetcher, finalConfig);
      return entry.data;
    }

    // Cache miss or expired - fetch fresh data
    return this.fetchAndCache(key, fetcher, finalConfig);
  }

  // Set data (for mutations)
  set<T>(key: string, data: T, config?: Partial<CacheConfig>): void {
    const finalConfig = { ...this.configs[key.split(':')[0]], ...config };
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      version: finalConfig.version,
      stale: false
    });

    // Invalidate related keys
    this.invalidateRelated(key);
  }

  // Invalidate specific key
  invalidate(key: string): void {
    this.cache.delete(key);
    this.revalidationPromises.delete(key);
  }

  // Invalidate by pattern
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.invalidate(key);
      }
    }
  }

  // Mutate data and invalidate cache
  async mutate<T>(
    key: string,
    mutator: (current: T | undefined) => Promise<T> | T,
    config?: Partial<CacheConfig>
  ): Promise<T> {
    const current = this.cache.get(key)?.data;
    const newData = await mutator(current);
    
    this.set(key, newData, config);
    return newData;
  }

  // Preload data
  async preload<T>(key: string, fetcher: () => Promise<T>): Promise<void> {
    if (!this.cache.has(key)) {
      try {
        await this.get(key, fetcher);
      } catch (error) {
        // Silent fail for preloading
        console.warn(`Preload failed for ${key}:`, error);
      }
    }
  }

  // Private methods
  private isStale(entry: CacheEntry<any>, config: CacheConfig, now: number): boolean {
    return now - entry.timestamp > config.ttl;
  }

  private isStaleButValid(entry: CacheEntry<any>, config: CacheConfig, now: number): boolean {
    const age = now - entry.timestamp;
    return age > config.ttl && age <= config.ttl + config.staleWhileRevalidate;
  }

  private async revalidateInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    config: CacheConfig
  ): Promise<void> {
    // Prevent multiple revalidations
    if (this.revalidationPromises.has(key)) {
      return;
    }

    const promise = this.fetchAndCache(key, fetcher, config).catch(error => {
      console.warn(`Background revalidation failed for ${key}:`, error);
    });

    this.revalidationPromises.set(key, promise);
    
    try {
      await promise;
    } finally {
      this.revalidationPromises.delete(key);
    }
  }

  private async fetchAndCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    try {
      const data = await fetcher();
      
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        version: config.version,
        stale: false
      });

      return data;
    } catch (error) {
      // If fetch fails and we have stale data, return it
      const entry = this.cache.get(key);
      if (entry) {
        console.warn(`Fetch failed for ${key}, serving stale data:`, error);
        return entry.data;
      }
      
      throw error;
    }
  }

  private invalidateRelated(key: string): void {
    const [type] = key.split(':');
    
    // Invalidate dashboard when any cost data changes
    if (['fixed-costs', 'variable-costs', 'direct-costs', 'taxes', 'pair-value'].includes(type)) {
      this.invalidatePattern('^dashboard:');
    }
    
    // Invalidate pairs-sold when deals or pair-value changes
    if (['deals', 'pair-value'].includes(type)) {
      this.invalidatePattern('^pairs-sold:');
    }
  }

  // Debug methods
  getStats() {
    const now = Date.now();
    const stats = {
      total: this.cache.size,
      fresh: 0,
      stale: 0,
      expired: 0
    };

    for (const [key, entry] of this.cache.entries()) {
      const config = this.configs[key.split(':')[0]];
      if (!config) continue;

      const age = now - entry.timestamp;
      if (age <= config.ttl) {
        stats.fresh++;
      } else if (age <= config.ttl + config.staleWhileRevalidate) {
        stats.stale++;
      } else {
        stats.expired++;
      }
    }

    return stats;
  }

  clear(): void {
    this.cache.clear();
    this.revalidationPromises.clear();
  }
}

// Global cache instance
export const staticCache = new StaticCache();

// Helper functions for common patterns
export const getCacheKey = (type: string, ...params: (string | number)[]): string => {
  return `${type}:${params.join(':')}`;
};

export const invalidateUserData = (userId: string): void => {
  staticCache.invalidatePattern(`:(.*:)?${userId}($|:)`);
};

export const preloadDashboardData = async (userId: string, period: number): Promise<void> => {
  const keys = [
    getCacheKey('deals', period),
    getCacheKey('fixed-costs', userId, period),
    getCacheKey('variable-costs', userId, period),
    getCacheKey('direct-costs', userId),
    getCacheKey('taxes', userId),
    getCacheKey('pair-value', userId)
  ];

  // Preload all dashboard data in parallel
  await Promise.allSettled(
    keys.map(key => staticCache.preload(key, () => Promise.resolve(null)))
  );
};
