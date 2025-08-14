"use client";

import { useCallback } from "react";

interface AvatarCacheManager {
  clearAvatarCache: (userId: string) => void;
  generateCacheBustedUrl: (baseUrl: string) => string;
  preloadImage: (url: string) => Promise<void>;
}

export function useAvatarCache(): AvatarCacheManager {
  const clearAvatarCache = useCallback((userId: string) => {
    // Clear browser cache for avatar images
    if (typeof window !== "undefined") {
      // Clear any cached images in the browser
      const images = document.querySelectorAll(`img[src*="${userId}"]`);
      images.forEach((img) => {
        const imgElement = img as HTMLImageElement;
        const originalSrc = imgElement.src;
        imgElement.src = "";
        setTimeout(() => {
          imgElement.src = originalSrc;
        }, 100);
      });

      // Clear service worker cache if available
      if ("serviceWorker" in navigator && "caches" in window) {
        caches.keys().then((cacheNames) => {
          cacheNames.forEach((cacheName) => {
            caches.open(cacheName).then((cache) => {
              cache.keys().then((requests) => {
                requests.forEach((request) => {
                  if (
                    request.url.includes(userId) &&
                    request.url.includes("avatar")
                  ) {
                    cache.delete(request);
                  }
                });
              });
            });
          });
        });
      }
    }
  }, []);

  const generateCacheBustedUrl = useCallback((baseUrl: string) => {
    // Only generate cache-busted URLs on client side to avoid hydration mismatch
    if (typeof window === "undefined") {
      return baseUrl;
    }

    try {
      const url = new URL(baseUrl);

      // Use a simpler cache-busting strategy to avoid over-complicating URLs
      const timestamp = Date.now();

      // Remove existing cache-busting parameters
      url.searchParams.delete("t");
      url.searchParams.delete("v");
      url.searchParams.delete("r");
      url.searchParams.delete("_");
      url.searchParams.delete("cache");

      // Add single cache-busting parameter
      url.searchParams.set("cache", timestamp.toString());

      return url.toString();
    } catch (error) {
      console.error("Error generating cache-busted URL:", error);
      return baseUrl;
    }
  }, []);

  const preloadImage = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to preload image"));
      img.src = url;
    });
  }, []);

  return {
    clearAvatarCache,
    generateCacheBustedUrl,
    preloadImage,
  };
}
