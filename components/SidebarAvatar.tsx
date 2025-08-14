"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";

interface SidebarAvatarProps {
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
 * Sidebar Avatar component with enhanced stability
 *
 * Features:
 * - Immediate fallback display to prevent skeleton flashing
 * - Optimized image loading with timeout protection
 * - Intelligent caching with session storage
 * - Graceful error handling
 * - Prevents unnecessary re-renders
 */
export function SidebarAvatar({
  src,
  fallback,
  alt = "Avatar",
  className = "",
  size = "md",
  updatedAt,
  userId,
  showLoadingState = false,
}: SidebarAvatarProps) {
  const [imageState, setImageState] = useState<{
    url: string | null;
    loading: boolean;
    error: boolean;
    ready: boolean;
  }>({
    url: null,
    loading: false,
    error: false,
    ready: false,
  });

  // Create stable cache key
  const cacheKey = useMemo(() => {
    if (!src || !userId) return null;
    return `sidebar_avatar_${userId}_${src}_${updatedAt || "default"}`;
  }, [src, userId, updatedAt]);

  // Get cached URL
  const getCachedUrl = useMemo(() => {
    if (!cacheKey) return null;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { url, timestamp } = JSON.parse(cached);
        // Cache valid for 15 minutes
        if (Date.now() - timestamp < 15 * 60 * 1000) {
          return url;
        }
      }
    } catch (error) {
      // Ignore cache errors
    }
    return null;
  }, [cacheKey]);

  // Cache URL function
  const setCachedUrl = useCallback(
    (url: string) => {
      if (!cacheKey) return;
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({ url, timestamp: Date.now() })
        );
      } catch (error) {
        // Ignore cache errors
      }
    },
    [cacheKey]
  );

  // Load avatar image
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const loadImage = async () => {
      // No source provided - show fallback immediately
      if (!src) {
        if (mounted) {
          setImageState({
            url: null,
            loading: false,
            error: false,
            ready: true,
          });
        }
        return;
      }

      // Check cache first
      const cachedUrl = getCachedUrl;
      if (cachedUrl) {
        if (mounted) {
          setImageState({
            url: cachedUrl,
            loading: false,
            error: false,
            ready: true,
          });
        }
        return;
      }

      // Start loading
      if (mounted) {
        setImageState((prev) => ({
          ...prev,
          loading: true,
          error: false,
          ready: false,
        }));
      }

      try {
        // Get public URL from Supabase
        let imageUrl: string;

        if (src.startsWith("http")) {
          // Already a full URL
          imageUrl = src;
        } else {
          // Get public URL from Supabase storage
          const { data } = supabase.storage.from("avatars").getPublicUrl(src);
          imageUrl = data.publicUrl;
        }

        // Set timeout protection (2 seconds)
        timeoutId = setTimeout(() => {
          if (mounted) {
            setImageState({
              url: null,
              loading: false,
              error: true,
              ready: true,
            });
          }
        }, 2000);

        // Preload image to check if it loads successfully
        const img = new Image();
        img.onload = () => {
          clearTimeout(timeoutId);
          if (mounted) {
            setCachedUrl(imageUrl);
            setImageState({
              url: imageUrl,
              loading: false,
              error: false,
              ready: true,
            });
          }
        };
        img.onerror = () => {
          clearTimeout(timeoutId);
          if (mounted) {
            setImageState({
              url: null,
              loading: false,
              error: true,
              ready: true,
            });
          }
        };
        img.src = imageUrl;
      } catch (error) {
        clearTimeout(timeoutId);
        if (mounted) {
          setImageState({
            url: null,
            loading: false,
            error: true,
            ready: true,
          });
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [src, getCachedUrl, cacheKey, setCachedUrl]);

  // Show skeleton only if explicitly requested and still loading
  if (showLoadingState && imageState.loading && !imageState.ready) {
    return (
      <Skeleton
        className={`${sizeClasses[size]} rounded-full ${className}`}
        data-testid="sidebar-avatar-skeleton"
      />
    );
  }

  return (
    <Avatar
      className={`${sizeClasses[size]} ${className}`}
      data-testid="sidebar-avatar"
    >
      {imageState.url && !imageState.error && (
        <AvatarImage
          src={imageState.url}
          alt={alt}
          loading="lazy"
          onError={() => {
            setImageState((prev) => ({
              ...prev,
              url: null,
              error: true,
            }));
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
          fontSize:
            size === "sm" ? "0.75rem" : size === "md" ? "0.875rem" : "1rem",
        }}
      >
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}
