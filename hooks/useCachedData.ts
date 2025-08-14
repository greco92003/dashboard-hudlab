"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { localCache } from "@/lib/local-cache";

interface UseCachedDataOptions {
  ttl?: number; // Time to live in milliseconds
  storage?: "localStorage" | "sessionStorage" | "memory";
  retries?: number;
  timeout?: number;
  staleWhileRevalidate?: boolean; // Return stale data while fetching fresh data
}

interface UseCachedDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isStale: boolean;
  refresh: () => Promise<void>;
  clearCache: () => void;
}

/**
 * Hook for caching API data with automatic refresh and stale-while-revalidate
 */
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCachedDataOptions = {}
): UseCachedDataReturn<T> {
  const {
    ttl = 5 * 60 * 1000, // 5 minutes
    storage = "sessionStorage",
    retries = 3,
    timeout = 30000,
    staleWhileRevalidate = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  // Check if data is in cache
  const getCachedData = useCallback(() => {
    return localCache.get<T>(key, { storage, ttl });
  }, [key, storage, ttl]);

  // Fetch fresh data
  const fetchFreshData = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await fetcher();

        // Cache the fresh data
        localCache.set(key, result, { storage, ttl });

        setData(result);
        setIsStale(false);
        setError(null);

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch data";
        setError(errorMessage);
        console.error(`Error fetching data for key ${key}:`, err);
        throw err;
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [key, fetcher, storage, ttl, retries, timeout]
  );

  // Refresh data
  const refresh = useCallback(async () => {
    await fetchFreshData(true);
  }, [fetchFreshData]);

  // Clear cache for this key
  const clearCache = useCallback(() => {
    localCache.delete(key, { storage });
    setData(null);
    setIsStale(false);
  }, [key, storage]);

  // Initialize data
  useEffect(() => {
    const initializeData = async () => {
      // First, try to get cached data
      const cachedData = getCachedData();

      if (cachedData) {
        setData(cachedData);
        setIsStale(false);

        if (staleWhileRevalidate) {
          // Return cached data immediately, but fetch fresh data in background
          setIsStale(true);
          try {
            await fetchFreshData(false);
          } catch (error) {
            // If background fetch fails, keep using cached data
            console.warn(
              "Background refresh failed, using cached data:",
              error
            );
          }
        }
      } else {
        // No cached data, fetch fresh data
        try {
          await fetchFreshData(true);
        } catch (error) {
          // Error is already handled in fetchFreshData
        }
      }
    };

    initializeData();
  }, [getCachedData, fetchFreshData, staleWhileRevalidate]);

  return {
    data,
    loading,
    error,
    isStale,
    refresh,
    clearCache,
  };
}

/**
 * Hook for caching API endpoints specifically
 */
export function useCachedApi<T>(
  endpoint: string,
  options: UseCachedDataOptions & {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
) {
  const { method = "GET", headers = {}, body, ...cacheOptions } = options;

  const fetcher = useCallback(async () => {
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }, [endpoint, method, headers, body]);

  // Create a cache key based on endpoint and parameters
  const cacheKey = `api_${endpoint}_${method}_${JSON.stringify({
    headers,
    body,
  })}`;

  return useCachedData<T>(cacheKey, fetcher, cacheOptions);
}

/**
 * Hook for caching user profile data with extended TTL
 */
export function useCachedUserProfile(userId: string) {
  const fetcher = useCallback(async () => {
    const response = await fetch(`/api/user-profile/${userId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch user profile");
    }
    return response.json();
  }, [userId]);

  return useCachedData(`user_profile_${userId}`, fetcher, {
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    storage: "localStorage",
    staleWhileRevalidate: true,
  });
}

/**
 * Hook for long-term user session cache (7 days)
 */
export function useLongTermUserCache(userId: string) {
  const [cachedData, setCachedData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Try to get cached user data
    const cached = localCache.get(`long_term_user_${userId}`, {
      storage: "localStorage",
      ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    if (cached) {
      setCachedData(cached);
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [userId]);

  const updateCache = useCallback(
    (data: any) => {
      if (!userId) return;

      localCache.set(`long_term_user_${userId}`, data, {
        storage: "localStorage",
        ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      setCachedData(data);
    },
    [userId]
  );

  const clearCache = useCallback(() => {
    if (!userId) return;

    localCache.delete(`long_term_user_${userId}`, {
      storage: "localStorage",
    });
    setCachedData(null);
  }, [userId]);

  return {
    data: cachedData,
    loading,
    updateCache,
    clearCache,
  };
}

/**
 * Hook for caching static data (costs, taxes, etc.)
 */
export function useCachedStaticData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = 30 * 60 * 1000 // 30 minutes
) {
  return useCachedData<T>(`static_${key}`, fetcher, {
    ttl,
    storage: "localStorage",
    staleWhileRevalidate: true,
  });
}

/**
 * Hook for caching deals data
 */
export function useCachedDeals(period: number) {
  const fetcher = useCallback(async () => {
    const response = await fetch(`/api/deals-cache?period=${period}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }, [period]);

  return useCachedData(`deals_${period}`, fetcher, {
    ttl: 2 * 60 * 1000, // 2 minutes for deals data
    storage: "sessionStorage",
    staleWhileRevalidate: true,
  });
}

/**
 * Utility to preload data into cache
 */
export function preloadData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCachedDataOptions = {}
) {
  const { storage = "sessionStorage", ttl = 5 * 60 * 1000 } = options;

  // Check if data is already cached
  const cached = localCache.get<T>(key, { storage });
  if (cached) {
    return Promise.resolve(cached);
  }

  // Fetch and cache data
  return fetcher().then((data) => {
    localCache.set(key, data, { storage, ttl });
    return data;
  });
}
