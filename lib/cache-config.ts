import { storage } from "@/lib/storage";

/**
 * Cache configuration for the application
 * Centralized cache settings to avoid re-renders and improve performance
 */

export const CACHE_CONFIG = {
  // User session and profile cache (7 days)
  USER_SESSION: {
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    storage: "localStorage" as const,
    key: "persistent_auth_data",
  },

  // Avatar image cache (30 minutes in session)
  AVATAR_IMAGE: {
    ttl: 30 * 60 * 1000, // 30 minutes
    storage: "sessionStorage" as const,
    keyPrefix: "avatar_",
  },

  // User profile cache (2 hours)
  USER_PROFILE: {
    ttl: 2 * 60 * 60 * 1000, // 2 hours
    storage: "localStorage" as const,
    keyPrefix: "user_profile_",
  },

  // API responses cache (5 minutes)
  API_RESPONSES: {
    ttl: 5 * 60 * 1000, // 5 minutes
    storage: "sessionStorage" as const,
    keyPrefix: "api_",
  },

  // Static data cache (30 minutes)
  STATIC_DATA: {
    ttl: 30 * 60 * 1000, // 30 minutes
    storage: "localStorage" as const,
    keyPrefix: "static_",
  },

  // Long-term user data cache (7 days)
  LONG_TERM_USER: {
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    storage: "localStorage" as const,
    keyPrefix: "long_term_user_",
  },
} as const;

/**
 * Cache key generators
 */
export const cacheKeys = {
  userSession: () => CACHE_CONFIG.USER_SESSION.key,

  avatarImage: (src: string, updatedAt?: string) =>
    `${CACHE_CONFIG.AVATAR_IMAGE.keyPrefix}${src}_${updatedAt || "default"}`,

  userProfile: (userId: string) =>
    `${CACHE_CONFIG.USER_PROFILE.keyPrefix}${userId}`,

  apiResponse: (endpoint: string, method = "GET") =>
    `${CACHE_CONFIG.API_RESPONSES.keyPrefix}${endpoint.replace(/[^a-zA-Z0-9]/g, "_")}_${method}`,

  staticData: (key: string) => `${CACHE_CONFIG.STATIC_DATA.keyPrefix}${key}`,

  longTermUser: (userId: string) =>
    `${CACHE_CONFIG.LONG_TERM_USER.keyPrefix}${userId}`,
};

/**
 * Cache cleanup utilities
 */
export const cacheCleanup = {
  // Clear all user-related cache
  clearUserCache: (userId?: string) => {
    if (typeof window === "undefined") return;

    const keys = storage.keys();
    keys.forEach((key) => {
      if (
        key.includes(CACHE_CONFIG.USER_PROFILE.keyPrefix) ||
        key.includes(CACHE_CONFIG.LONG_TERM_USER.keyPrefix) ||
        key === CACHE_CONFIG.USER_SESSION.key
      ) {
        if (!userId || key.includes(userId)) {
          storage.removeItem(key);
        }
      }
    });

    // Clear session storage
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach((key) => {
      if (
        key.includes(CACHE_CONFIG.AVATAR_IMAGE.keyPrefix) ||
        key.includes(CACHE_CONFIG.API_RESPONSES.keyPrefix)
      ) {
        sessionStorage.removeItem(key);
      }
    });
  },

  // Clear expired cache entries
  clearExpiredCache: () => {
    if (typeof window === "undefined") return;

    const now = Date.now();

    // Check localStorage
    const localKeys = storage.keys();
    localKeys.forEach((key) => {
      try {
        const item = storage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed.expiresAt && parsed.expiresAt < now) {
            storage.removeItem(key);
          }
        }
      } catch {
        // Invalid JSON, remove it
        storage.removeItem(key);
      }
    });

    // Check sessionStorage
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach((key) => {
      try {
        const item = sessionStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed.expiresAt && parsed.expiresAt < now) {
            sessionStorage.removeItem(key);
          }
        }
      } catch {
        // Invalid JSON, remove it
        sessionStorage.removeItem(key);
      }
    });
  },

  // Clear all application cache
  clearAllCache: () => {
    if (typeof window === "undefined") return;

    const localKeys = storage.keys();
    localKeys.forEach((key) => {
      if (key.includes("hudlab") || key.includes("cache")) {
        storage.removeItem(key);
      }
    });

    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach((key) => {
      if (key.includes("hudlab") || key.includes("cache")) {
        sessionStorage.removeItem(key);
      }
    });
  },
};

/**
 * Performance monitoring for cache
 */
export const cacheMetrics = {
  // Track cache hit/miss rates
  trackCacheHit: (key: string) => {
    if (typeof window === "undefined") return;

    const metrics = JSON.parse(storage.getItem("cache_metrics") || "{}");
    metrics[key] = metrics[key] || { hits: 0, misses: 0 };
    metrics[key].hits++;
    storage.setItem("cache_metrics", JSON.stringify(metrics));
  },

  trackCacheMiss: (key: string) => {
    if (typeof window === "undefined") return;

    const metrics = JSON.parse(storage.getItem("cache_metrics") || "{}");
    metrics[key] = metrics[key] || { hits: 0, misses: 0 };
    metrics[key].misses++;
    storage.setItem("cache_metrics", JSON.stringify(metrics));
  },

  getCacheMetrics: () => {
    if (typeof window === "undefined") return {};

    try {
      return JSON.parse(storage.getItem("cache_metrics") || "{}");
    } catch {
      return {};
    }
  },

  clearMetrics: () => {
    if (typeof window === "undefined") return;
    storage.removeItem("cache_metrics");
  },
};

// Initialize cache cleanup on app start
if (typeof window !== "undefined") {
  // Clean expired cache on page load
  cacheCleanup.clearExpiredCache();

  // Set up periodic cleanup (every 5 minutes)
  setInterval(
    () => {
      cacheCleanup.clearExpiredCache();
    },
    5 * 60 * 1000,
  );
}
