/**
 * Local cache system for reducing API requests in production
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  storage?: 'localStorage' | 'sessionStorage' | 'memory';
  prefix?: string;
}

class LocalCache {
  private memoryCache = new Map<string, CacheItem<any>>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes
  private prefix = 'hudlab_cache_';

  constructor() {
    // Clean up expired items on initialization
    this.cleanup();
    
    // Set up periodic cleanup (every 5 minutes)
    if (typeof window !== 'undefined') {
      setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  }

  private getStorageKey(key: string, prefix?: string): string {
    return `${prefix || this.prefix}${key}`;
  }

  private getStorage(type: 'localStorage' | 'sessionStorage' | 'memory') {
    if (typeof window === 'undefined') return null;
    
    switch (type) {
      case 'localStorage':
        return window.localStorage;
      case 'sessionStorage':
        return window.sessionStorage;
      case 'memory':
        return null; // Use memory cache
      default:
        return window.localStorage;
    }
  }

  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() > item.expiresAt;
  }

  /**
   * Set an item in cache
   */
  set<T>(
    key: string, 
    data: T, 
    options: CacheOptions = {}
  ): void {
    const {
      ttl = this.defaultTTL,
      storage = 'localStorage',
      prefix,
    } = options;

    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    };

    const storageKey = this.getStorageKey(key, prefix);

    if (storage === 'memory') {
      this.memoryCache.set(storageKey, item);
      return;
    }

    const storageInstance = this.getStorage(storage);
    if (storageInstance) {
      try {
        storageInstance.setItem(storageKey, JSON.stringify(item));
      } catch (error) {
        console.warn('Failed to save to storage, falling back to memory cache:', error);
        this.memoryCache.set(storageKey, item);
      }
    } else {
      this.memoryCache.set(storageKey, item);
    }
  }

  /**
   * Get an item from cache
   */
  get<T>(
    key: string, 
    options: CacheOptions = {}
  ): T | null {
    const {
      storage = 'localStorage',
      prefix,
    } = options;

    const storageKey = this.getStorageKey(key, prefix);

    let item: CacheItem<T> | null = null;

    if (storage === 'memory') {
      item = this.memoryCache.get(storageKey) || null;
    } else {
      const storageInstance = this.getStorage(storage);
      if (storageInstance) {
        try {
          const stored = storageInstance.getItem(storageKey);
          if (stored) {
            item = JSON.parse(stored);
          }
        } catch (error) {
          console.warn('Failed to read from storage:', error);
        }
      }

      // Fallback to memory cache
      if (!item) {
        item = this.memoryCache.get(storageKey) || null;
      }
    }

    if (!item) return null;

    // Check if expired
    if (this.isExpired(item)) {
      this.delete(key, options);
      return null;
    }

    return item.data;
  }

  /**
   * Delete an item from cache
   */
  delete(key: string, options: CacheOptions = {}): void {
    const {
      storage = 'localStorage',
      prefix,
    } = options;

    const storageKey = this.getStorageKey(key, prefix);

    if (storage === 'memory') {
      this.memoryCache.delete(storageKey);
      return;
    }

    const storageInstance = this.getStorage(storage);
    if (storageInstance) {
      try {
        storageInstance.removeItem(storageKey);
      } catch (error) {
        console.warn('Failed to remove from storage:', error);
      }
    }

    // Also remove from memory cache
    this.memoryCache.delete(storageKey);
  }

  /**
   * Check if an item exists and is not expired
   */
  has(key: string, options: CacheOptions = {}): boolean {
    return this.get(key, options) !== null;
  }

  /**
   * Clear all cache items
   */
  clear(options: CacheOptions = {}): void {
    const {
      storage = 'localStorage',
      prefix,
    } = options;

    if (storage === 'memory') {
      this.memoryCache.clear();
      return;
    }

    const storageInstance = this.getStorage(storage);
    if (storageInstance) {
      const prefixToUse = prefix || this.prefix;
      const keysToRemove: string[] = [];

      try {
        for (let i = 0; i < storageInstance.length; i++) {
          const key = storageInstance.key(i);
          if (key && key.startsWith(prefixToUse)) {
            keysToRemove.push(key);
          }
        }

        keysToRemove.forEach(key => {
          storageInstance.removeItem(key);
        });
      } catch (error) {
        console.warn('Failed to clear storage:', error);
      }
    }

    // Also clear memory cache
    const prefixToUse = prefix || this.prefix;
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefixToUse)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Clean up expired items
   */
  private cleanup(): void {
    // Clean memory cache
    for (const [key, item] of this.memoryCache.entries()) {
      if (this.isExpired(item)) {
        this.memoryCache.delete(key);
      }
    }

    // Clean localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const keysToRemove: string[] = [];
        
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(this.prefix)) {
            try {
              const stored = window.localStorage.getItem(key);
              if (stored) {
                const item = JSON.parse(stored);
                if (this.isExpired(item)) {
                  keysToRemove.push(key);
                }
              }
            } catch (error) {
              // Invalid JSON, remove it
              keysToRemove.push(key);
            }
          }
        }

        keysToRemove.forEach(key => {
          window.localStorage.removeItem(key);
        });
      } catch (error) {
        console.warn('Failed to cleanup localStorage:', error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memoryItems: number;
    localStorageItems: number;
    sessionStorageItems: number;
  } {
    let localStorageItems = 0;
    let sessionStorageItems = 0;

    if (typeof window !== 'undefined') {
      // Count localStorage items
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(this.prefix)) {
            localStorageItems++;
          }
        }
      } catch (error) {
        console.warn('Failed to count localStorage items:', error);
      }

      // Count sessionStorage items
      try {
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key && key.startsWith(this.prefix)) {
            sessionStorageItems++;
          }
        }
      } catch (error) {
        console.warn('Failed to count sessionStorage items:', error);
      }
    }

    return {
      memoryItems: this.memoryCache.size,
      localStorageItems,
      sessionStorageItems,
    };
  }
}

// Export singleton instance
export const localCache = new LocalCache();

// Convenience functions for common cache operations
export const cacheHelpers = {
  // Cache user profile data
  setUserProfile: (userId: string, profile: any) => {
    localCache.set(`user_profile_${userId}`, profile, {
      ttl: 10 * 60 * 1000, // 10 minutes
      storage: 'localStorage',
    });
  },

  getUserProfile: (userId: string) => {
    return localCache.get(`user_profile_${userId}`, {
      storage: 'localStorage',
    });
  },

  // Cache API responses
  setApiResponse: (endpoint: string, data: any, ttl = 5 * 60 * 1000) => {
    const key = `api_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;
    localCache.set(key, data, {
      ttl,
      storage: 'sessionStorage',
    });
  },

  getApiResponse: (endpoint: string) => {
    const key = `api_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return localCache.get(key, {
      storage: 'sessionStorage',
    });
  },

  // Cache static data (costs, taxes, etc.)
  setStaticData: (key: string, data: any) => {
    localCache.set(`static_${key}`, data, {
      ttl: 30 * 60 * 1000, // 30 minutes
      storage: 'localStorage',
    });
  },

  getStaticData: (key: string) => {
    return localCache.get(`static_${key}`, {
      storage: 'localStorage',
    });
  },

  // Clear all cache
  clearAll: () => {
    localCache.clear({ storage: 'localStorage' });
    localCache.clear({ storage: 'sessionStorage' });
    localCache.clear({ storage: 'memory' });
  },
};
