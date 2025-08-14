"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAvatarCache } from "@/hooks/useAvatarCache";
import { localCache } from "@/lib/local-cache";

interface StableAvatarProps {
  src?: string | null;
  fallback: string;
  alt?: string;
  className?: string;
  loading?: boolean;
  size?: "sm" | "md" | "lg";
  updatedAt?: string | null;
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

export function StableAvatar({
  src,
  fallback,
  alt = "Avatar",
  className = "",
  loading = false,
  size = "md",
  updatedAt,
}: StableAvatarProps) {
  const { generateCacheBustedUrl, preloadImage } = useAvatarCache();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Create stable cache key for this avatar
  const cacheKey = useMemo(() => {
    if (!src) return null;
    return `avatar_${src}_${updatedAt || "default"}`;
  }, [src, updatedAt]);

  // Check if image is cached and valid
  const getCachedImageState = useCallback(() => {
    if (!cacheKey) return null;

    try {
      return localCache.get<{ loaded: boolean; error: boolean }>(cacheKey, {
        storage: "sessionStorage",
        ttl: 30 * 60 * 1000, // 30 minutes
      });
    } catch {
      return null;
    }
  }, [cacheKey]);

  // Cache image state
  const setCachedImageState = useCallback(
    (loaded: boolean, error: boolean) => {
      if (!cacheKey) return;

      try {
        localCache.set(
          cacheKey,
          { loaded, error },
          {
            storage: "sessionStorage",
            ttl: 30 * 60 * 1000, // 30 minutes
          }
        );
      } catch {
        // Silently fail if caching is not available
      }
    },
    [cacheKey]
  );

  // Initialize from cache
  useEffect(() => {
    const cached = getCachedImageState();
    if (cached) {
      setImageLoaded(cached.loaded);
      setImageError(cached.error);
    } else {
      setImageLoaded(false);
      setImageError(false);
    }
    setRetryCount(0);
  }, [src, updatedAt, getCachedImageState]);

  // Generate cache-busted URL if src exists
  const avatarSrc = useMemo(() => {
    return src ? generateCacheBustedUrl(src) : "";
  }, [src, generateCacheBustedUrl]);

  // Preload image with retry logic and caching
  const handleImageLoad = useCallback(async () => {
    if (!avatarSrc) return;

    try {
      await preloadImage(avatarSrc);
      setImageLoaded(true);
      setImageError(false);
      setCachedImageState(true, false);
    } catch (error) {
      console.error("Error loading avatar:", error);
      if (retryCount < 2) {
        // Retry up to 2 times
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
        }, 1000 * (retryCount + 1)); // Exponential backoff
      } else {
        setImageError(true);
        setCachedImageState(false, true);
      }
    }
  }, [avatarSrc, preloadImage, retryCount, setCachedImageState]);

  // Trigger image load when src changes or retry count changes
  useEffect(() => {
    // Only load if we don't have cached state and image is not loaded/errored
    const cached = getCachedImageState();
    if (avatarSrc && !cached && !imageLoaded && !imageError) {
      handleImageLoad();
    }
  }, [
    avatarSrc,
    imageLoaded,
    imageError,
    handleImageLoad,
    getCachedImageState,
  ]);

  // Add timeout for loading state to prevent infinite skeleton
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        setLoadingTimeout(true);
      }, 5000); // 5 second timeout

      return () => clearTimeout(timeout);
    } else {
      setLoadingTimeout(false);
    }
  }, [loading]);

  // Memoize loading state to prevent unnecessary re-renders
  const isLoading = useMemo(() => {
    // If loading timeout has occurred, don't show loading anymore
    if (loadingTimeout) return false;

    // Show loading if explicitly loading or if we have a src but image hasn't loaded/errored yet
    return (
      loading || (!imageLoaded && !imageError && avatarSrc && !loadingTimeout)
    );
  }, [loading, imageLoaded, imageError, avatarSrc, loadingTimeout]);

  // Show skeleton while loading profile or image (with timeout protection)
  if (isLoading && !loadingTimeout) {
    return (
      <Skeleton className={`${sizeClasses[size]} rounded-full ${className}`} />
    );
  }

  return (
    <Avatar
      className={`${sizeClasses[size]} ${className}`}
      key={`${src || "no-avatar"}-${updatedAt || "default"}`}
    >
      {avatarSrc && !imageError && (
        <AvatarImage
          src={avatarSrc}
          alt={alt}
          onLoad={() => {
            setImageLoaded(true);
            setCachedImageState(true, false);
          }}
          onError={() => {
            setImageError(true);
            setImageLoaded(false);
            setCachedImageState(false, true);
          }}
          style={{
            opacity: imageLoaded ? 1 : 0,
            transition: "opacity 0.2s ease-in-out",
          }}
        />
      )}
      <AvatarFallback
        style={{
          opacity: !avatarSrc || imageError || !imageLoaded ? 1 : 0,
          transition: "opacity 0.2s ease-in-out",
        }}
      >
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}
