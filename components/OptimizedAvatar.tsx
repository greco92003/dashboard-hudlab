"use client";

import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useOptimizedAvatar } from "@/hooks/useOptimizedAvatar";

interface OptimizedAvatarProps {
  src?: string | null;
  fallback: string;
  alt?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  updatedAt?: string | null;
  userId?: string;
  showLoadingState?: boolean;
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

/**
 * Optimized Avatar component following Supabase best practices
 * 
 * Features:
 * - Uses Supabase Storage transformations for optimal image size
 * - Intelligent caching with sessionStorage
 * - Timeout protection to prevent infinite loading
 * - Smooth loading states with skeleton
 * - Automatic fallback handling
 * 
 * Based on Supabase documentation recommendations for avatar handling
 */
export function OptimizedAvatar({
  src,
  fallback,
  alt = "Avatar",
  className = "",
  size = "md",
  updatedAt,
  userId,
  showLoadingState = true,
}: OptimizedAvatarProps) {
  const { imageUrl, isLoading, hasError, isReady } = useOptimizedAvatar({
    src,
    userId,
    updatedAt,
    enableCache: true,
    timeout: 3000, // 3 second timeout
  });

  // Memoize the final avatar source
  const avatarSrc = useMemo(() => {
    if (hasError || !imageUrl) return null;
    return imageUrl;
  }, [imageUrl, hasError]);

  // Show skeleton during loading (with timeout protection)
  if (isLoading && showLoadingState && !isReady) {
    return (
      <Skeleton 
        className={`${sizeClasses[size]} rounded-full ${className}`}
        data-testid="avatar-skeleton"
      />
    );
  }

  return (
    <Avatar
      className={`${sizeClasses[size]} ${className}`}
      data-testid="optimized-avatar"
    >
      {avatarSrc && (
        <AvatarImage
          src={avatarSrc}
          alt={alt}
          loading="lazy"
          onError={(e) => {
            // Hide broken image
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
          }}
          style={{
            objectFit: "cover",
            transition: "opacity 0.2s ease-in-out",
          }}
        />
      )}
      <AvatarFallback
        className="bg-muted text-muted-foreground font-medium"
        style={{
          fontSize: size === "sm" ? "0.75rem" : size === "md" ? "0.875rem" : "1rem",
        }}
      >
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Hook for clearing avatar cache when needed
 * Useful for when user uploads a new avatar
 */
export function useAvatarCacheControl() {
  const clearAvatarCache = (userId?: string) => {
    try {
      // Clear all avatar cache entries
      const keys = Object.keys(sessionStorage);
      keys.forEach((key) => {
        if (key.startsWith("avatar_optimized_")) {
          if (!userId || key.includes(userId)) {
            sessionStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
      console.warn("Error clearing avatar cache:", error);
    }
  };

  const clearAllAvatarCache = () => {
    clearAvatarCache();
  };

  return {
    clearAvatarCache,
    clearAllAvatarCache,
  };
}
