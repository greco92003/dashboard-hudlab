"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { fetchWithRetry, fetchJsonWithRetry } from "@/lib/retry-fetch";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

interface UseAsyncOperationOptions {
  retries?: number;
  timeout?: number;
  cacheTime?: number; // Cache time in milliseconds
  staleTime?: number; // Time before data is considered stale
}

interface UseAsyncOperationReturn<T> extends AsyncState<T> {
  execute: () => Promise<void>;
  reset: () => void;
  isStale: boolean;
  refresh: () => Promise<void>;
}

/**
 * Enhanced hook for managing async operations with retry logic and caching
 */
export function useAsyncOperation<T>(
  operation: () => Promise<T>,
  options: UseAsyncOperationOptions = {}
): UseAsyncOperationReturn<T> {
  const {
    retries = 3,
    timeout = 30000,
    cacheTime = 5 * 60 * 1000, // 5 minutes
    staleTime = 1 * 60 * 1000, // 1 minute
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
    lastUpdated: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const operationRef = useRef(operation);

  // Update operation ref when it changes
  useEffect(() => {
    operationRef.current = operation;
  }, [operation]);

  // Check if data is stale
  const isStale = state.lastUpdated 
    ? Date.now() - state.lastUpdated.getTime() > staleTime
    : true;

  // Check if cache is expired
  const isCacheExpired = state.lastUpdated
    ? Date.now() - state.lastUpdated.getTime() > cacheTime
    : true;

  const execute = useCallback(async () => {
    // If we have fresh data and cache hasn't expired, don't refetch
    if (state.data && !isCacheExpired && !isStale) {
      return;
    }

    // Cancel any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
    }));

    try {
      let attempt = 0;
      let lastError: Error | null = null;

      while (attempt <= retries) {
        try {
          // Check if operation was aborted
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('Operation aborted');
          }

          const result = await Promise.race([
            operationRef.current(),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Operation timeout')), timeout);
            }),
          ]);

          setState({
            data: result,
            loading: false,
            error: null,
            lastUpdated: new Date(),
          });

          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Don't retry if operation was aborted
          if (lastError.message === 'Operation aborted') {
            return;
          }

          attempt++;

          if (attempt <= retries) {
            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.warn(`Operation failed (attempt ${attempt}/${retries + 1}). Retrying in ${delay}ms...`, {
              error: lastError.message,
            });
            
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      setState(prev => ({
        ...prev,
        loading: false,
        error: lastError?.message || 'Operation failed after all retries',
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
    }
  }, [retries, timeout, isCacheExpired, isStale, state.data]);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState({
      data: null,
      loading: false,
      error: null,
      lastUpdated: null,
    });
  }, []);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, lastUpdated: null }));
    await execute();
  }, [execute]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    ...state,
    execute,
    reset,
    isStale,
    refresh,
  };
}

/**
 * Specialized hook for API calls with retry logic
 */
export function useApiCall<T>(
  url: string,
  options: UseAsyncOperationOptions & {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
) {
  const { method = 'GET', headers = {}, body, ...asyncOptions } = options;

  const operation = useCallback(async () => {
    return fetchJsonWithRetry<T>(url, {
      method,
      headers,
      body,
      maxRetries: asyncOptions.retries || 3,
      timeout: asyncOptions.timeout || 30000,
    });
  }, [url, method, headers, body, asyncOptions.retries, asyncOptions.timeout]);

  return useAsyncOperation<T>(operation, asyncOptions);
}

/**
 * Hook for Supabase operations with automatic retry
 */
export function useSupabaseOperation<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  options: UseAsyncOperationOptions = {}
) {
  const wrappedOperation = useCallback(async () => {
    const result = await operation();
    
    if (result.error) {
      throw new Error(result.error.message || 'Supabase operation failed');
    }
    
    return result.data;
  }, [operation]);

  return useAsyncOperation<T | null>(wrappedOperation, options);
}
