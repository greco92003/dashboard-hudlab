"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";

interface OptimizedAvatarState {
  imageUrl: string | null;
  isLoading: boolean;
  hasError: boolean;
  isReady: boolean;
}

interface UseOptimizedAvatarOptions {
  src?: string | null;
  userId?: string;
  updatedAt?: string | null;
  enableCache?: boolean;
  timeout?: number;
}

/**
 * Optimized avatar hook following Supabase best practices
 * - Uses public URLs for better performance
 * - Implements intelligent caching
 * - Handles loading states with timeout protection
 * - Preloads images for smooth UX
 */
export function useOptimizedAvatar({
  src,
  userId,
  updatedAt,
  enableCache = true,
  timeout = 3000,
}: UseOptimizedAvatarOptions): OptimizedAvatarState {
  const [state, setState] = useState<OptimizedAvatarState>({
    imageUrl: null,
    isLoading: false,
    hasError: false,
    isReady: false,
  });

  // Create cache key for this avatar
  const cacheKey = useMemo(() => {
    if (!src) return null;
    return `avatar_optimized_${src}_${updatedAt || "default"}`;
  }, [src, updatedAt]);

  // Get cached image URL
  const getCachedUrl = useCallback(() => {
    if (!enableCache || !cacheKey) return null;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { url, timestamp } = JSON.parse(cached);
        // Cache valid for 10 minutes
        if (Date.now() - timestamp < 10 * 60 * 1000) {
          return url;
        }
      }
    } catch (error) {
      // Error reading avatar cache
    }
    return null;
  }, [cacheKey, enableCache]);

  // Cache image URL
  const setCachedUrl = useCallback(
    (url: string) => {
      if (!enableCache || !cacheKey) return;
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ url, timestamp: Date.now() })
        );
      } catch (error) {
        // Error caching avatar URL
      }
    },
    [cacheKey, enableCache]
  );

  // Process avatar URL - handle both full URLs and storage paths
  const processAvatarUrl = useCallback((avatarUrl: string) => {
    try {
      // Check if it's already a full URL
      if (avatarUrl.startsWith("http")) {
        // It's already a full URL from user_profiles.avatar_url
        // Add image transformations if it's a Supabase Storage URL
        if (avatarUrl.includes("supabase.co/storage")) {
          const url = new URL(avatarUrl);
          url.searchParams.set("width", "100");
          url.searchParams.set("height", "100");
          url.searchParams.set("quality", "80");
          return url.toString();
        }
        return avatarUrl;
      } else {
        // It's a storage path, generate public URL
        const { data } = supabase.storage
          .from("avatars")
          .getPublicUrl(avatarUrl, {
            transform: {
              width: 100,
              height: 100,
              quality: 80,
            },
          });
        return data.publicUrl;
      }
    } catch (error) {
      console.error("Error processing avatar URL:", error);
      return null;
    }
  }, []);

  // Preload image to ensure it's ready
  const preloadImage = useCallback(
    (url: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const timeoutId = setTimeout(() => {
          reject(new Error("Image load timeout"));
        }, timeout);

        img.onload = () => {
          clearTimeout(timeoutId);
          resolve();
        };

        img.onerror = () => {
          clearTimeout(timeoutId);
          reject(new Error("Image load failed"));
        };

        img.src = url;
      });
    },
    [timeout]
  );

  // Main effect to handle avatar loading
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const loadAvatar = async () => {
      // No source provided
      if (!src) {
        if (mounted) {
          setState({
            imageUrl: null,
            isLoading: false,
            hasError: false,
            isReady: true,
          });
        }
        return;
      }

      // Check cache first
      const cachedUrl = getCachedUrl();
      if (cachedUrl) {
        if (mounted) {
          setState({
            imageUrl: cachedUrl,
            isLoading: false,
            hasError: false,
            isReady: true,
          });
        }
        return;
      }

      // Start loading
      if (mounted) {
        setState((prev) => ({
          ...prev,
          isLoading: true,
          hasError: false,
          isReady: false,
        }));
      }

      // Set timeout protection
      timeoutId = setTimeout(() => {
        if (mounted) {
          setState({
            imageUrl: null,
            isLoading: false,
            hasError: true,
            isReady: true,
          });
        }
      }, timeout);

      try {
        // Process avatar URL (handle both full URLs and storage paths)
        const processedUrl = processAvatarUrl(src);
        if (!processedUrl) throw new Error("Failed to process avatar URL");

        // Preload the image
        await preloadImage(processedUrl);

        // Clear timeout since we succeeded
        clearTimeout(timeoutId);

        if (mounted) {
          // Cache the successful URL
          setCachedUrl(processedUrl);

          setState({
            imageUrl: processedUrl,
            isLoading: false,
            hasError: false,
            isReady: true,
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);
        console.error("Error loading avatar:", error);

        if (mounted) {
          setState({
            imageUrl: null,
            isLoading: false,
            hasError: true,
            isReady: true,
          });
        }
      }
    };

    loadAvatar();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    src,
    getCachedUrl,
    setCachedUrl,
    processAvatarUrl,
    preloadImage,
    timeout,
  ]);

  return state;
}
