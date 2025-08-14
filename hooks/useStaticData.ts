'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { staticCache, getCacheKey } from '@/lib/static-cache';

interface UseStaticDataOptions<T> {
  fetchFn: () => Promise<T>;
  cacheKey: string;
  enabled?: boolean;
  fallbackData?: T | null;
  dependencies?: any[];
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseStaticDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isStale: boolean;
  retry: () => void;
  refresh: () => void;
  mutate: (newData: T) => void;
}

export function useStaticData<T>({
  fetchFn,
  cacheKey,
  enabled = true,
  fallbackData = null,
  dependencies = [],
  onSuccess,
  onError
}: UseStaticDataOptions<T>): UseStaticDataReturn<T> {
  const [data, setData] = useState<T | null>(fallbackData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState(false);
  const mountedRef = useRef(true);

  // Fetch data using static cache
  const fetchData = useCallback(async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      const result = await staticCache.get(cacheKey, fetchFn);
      
      if (mountedRef.current) {
        setData(result);
        setIsStale(false);
        onSuccess?.(result);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      
      if (mountedRef.current) {
        setError(error);
        onError?.(error);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [cacheKey, fetchFn, enabled, onSuccess, onError]);

  // Retry function
  const retry = useCallback(() => {
    staticCache.invalidate(cacheKey);
    fetchData();
  }, [cacheKey, fetchData]);

  // Refresh function (force refresh)
  const refresh = useCallback(() => {
    staticCache.invalidate(cacheKey);
    fetchData();
  }, [cacheKey, fetchData]);

  // Mutate function (optimistic updates)
  const mutate = useCallback((newData: T) => {
    staticCache.set(cacheKey, newData);
    setData(newData);
    setIsStale(false);
  }, [cacheKey]);

  // Effect to fetch data
  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchData, ...dependencies]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    data,
    loading,
    error,
    isStale,
    retry,
    refresh,
    mutate
  };
}

// Specialized hooks for common data types

export function useDealsData(period: number) {
  return useStaticData({
    fetchFn: async () => {
      const response = await fetch(`/api/deals-cache?period=${period}`);
      if (!response.ok) throw new Error('Failed to fetch deals');
      return response.json();
    },
    cacheKey: getCacheKey('deals', period),
    dependencies: [period]
  });
}

export function useFixedCostsData(userId: string, period: number) {
  return useStaticData({
    fetchFn: async () => {
      const response = await fetch(`/api/fixed-costs?period=${period}`);
      if (!response.ok) throw new Error('Failed to fetch fixed costs');
      return response.json();
    },
    cacheKey: getCacheKey('fixed-costs', userId, period),
    dependencies: [userId, period]
  });
}

export function useVariableCostsData(userId: string, period: number) {
  return useStaticData({
    fetchFn: async () => {
      const response = await fetch(`/api/variable-costs?period=${period}`);
      if (!response.ok) throw new Error('Failed to fetch variable costs');
      return response.json();
    },
    cacheKey: getCacheKey('variable-costs', userId, period),
    dependencies: [userId, period]
  });
}

export function useDirectCostsData(userId: string) {
  return useStaticData({
    fetchFn: async () => {
      const response = await fetch('/api/direct-costs');
      if (!response.ok) throw new Error('Failed to fetch direct costs');
      return response.json();
    },
    cacheKey: getCacheKey('direct-costs', userId),
    dependencies: [userId]
  });
}

export function useTaxesData(userId: string) {
  return useStaticData({
    fetchFn: async () => {
      const response = await fetch('/api/taxes');
      if (!response.ok) throw new Error('Failed to fetch taxes');
      return response.json();
    },
    cacheKey: getCacheKey('taxes', userId),
    dependencies: [userId]
  });
}

export function usePairValueData(userId: string) {
  return useStaticData({
    fetchFn: async () => {
      const response = await fetch('/api/pair-value');
      if (!response.ok) throw new Error('Failed to fetch pair value');
      return response.json();
    },
    cacheKey: getCacheKey('pair-value', userId),
    dependencies: [userId]
  });
}

export function useUserProfileData(userId: string) {
  return useStaticData({
    fetchFn: async () => {
      const response = await fetch('/api/user-profile');
      if (!response.ok) throw new Error('Failed to fetch user profile');
      return response.json();
    },
    cacheKey: getCacheKey('user-profile', userId),
    dependencies: [userId]
  });
}

// Mutation hooks for optimistic updates
export function useMutateFixedCosts(userId: string, period: number) {
  const { mutate } = useFixedCostsData(userId, period);
  
  return useCallback(async (newCost: any) => {
    // Optimistic update
    mutate(newCost);
    
    try {
      const response = await fetch('/api/fixed-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCost)
      });
      
      if (!response.ok) throw new Error('Failed to save');
      
      const result = await response.json();
      mutate(result); // Update with server response
      
      return result;
    } catch (error) {
      // Revert optimistic update on error
      staticCache.invalidate(getCacheKey('fixed-costs', userId, period));
      throw error;
    }
  }, [mutate, userId, period]);
}
