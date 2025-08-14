"use client";

import { useState, useEffect, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { localCache } from "@/lib/local-cache";

interface UserProfile {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  role: string;
  approved: boolean | null;
  created_at: string;
  updated_at: string;
}

interface CachedUserData {
  user: User;
  profile: UserProfile;
  sessionExpiry: number;
  lastRefresh: number;
}

interface PersistentAuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isApproved: boolean;
}

interface PersistentAuthReturn extends PersistentAuthState {
  refreshAuth: () => Promise<void>;
  clearAuth: () => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
}

const CACHE_KEY = "persistent_auth_data";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_REFRESH_THRESHOLD = 60 * 60 * 1000; // 1 hour before expiry

export function usePersistentAuth(): PersistentAuthReturn {
  const [state, setState] = useState<PersistentAuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
    isAuthenticated: false,
    isApproved: false,
  });

  // Get cached data
  const getCachedData = useCallback((): CachedUserData | null => {
    try {
      const cached = localCache.get<CachedUserData>(CACHE_KEY, {
        storage: "localStorage",
        ttl: CACHE_TTL,
      });

      if (cached && cached.sessionExpiry > Date.now()) {
        return cached;
      }
    } catch (error) {
      // Error reading cached auth data
    }
    return null;
  }, []);

  // Save data to cache
  const setCachedData = useCallback((data: CachedUserData) => {
    try {
      localCache.set(CACHE_KEY, data, {
        storage: "localStorage",
        ttl: CACHE_TTL,
      });
    } catch (error) {
      // Error saving auth data to cache
    }
  }, []);

  // Clear cached data
  const clearCachedData = useCallback(() => {
    try {
      // Clear main auth cache
      localCache.delete(CACHE_KEY, { storage: "localStorage" });

      // Clear all related cache data
      if (typeof window !== "undefined") {
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
          if (
            key.includes("user_profile_") ||
            key.includes("long_term_user_") ||
            key.includes("hudlab_cache_") ||
            key.includes("persistent_auth_data") ||
            key.includes("hudlab-auth-token") ||
            key.startsWith("sb-")
          ) {
            localStorage.removeItem(key);
          }
        });

        // Also clear sessionStorage
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach((key) => {
          if (
            key.includes("hudlab_cache_") ||
            key.includes("user_profile_") ||
            key.includes("auth")
          ) {
            sessionStorage.removeItem(key);
          }
        });
      }
    } catch (error) {
      // Error clearing cached auth data
    }
  }, []);

  // Fetch user profile from Supabase
  const fetchUserProfile = useCallback(
    async (userId: string): Promise<UserProfile | null> => {
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            // Profile doesn't exist, create one
            const { data: newProfile, error: createError } = await supabase
              .from("user_profiles")
              .insert({
                id: userId,
                email: "",
                role: "user",
                approved: false,
              })
              .select()
              .single();

            if (createError) throw createError;
            return newProfile;
          }
          throw error;
        }

        return data;
      } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
      }
    },
    []
  );

  // Check if session needs refresh
  const shouldRefreshSession = useCallback(
    (cachedData: CachedUserData): boolean => {
      const timeUntilExpiry = cachedData.sessionExpiry - Date.now();
      const timeSinceLastRefresh = Date.now() - cachedData.lastRefresh;

      return (
        timeUntilExpiry < SESSION_REFRESH_THRESHOLD ||
        timeSinceLastRefresh > SESSION_REFRESH_THRESHOLD
      );
    },
    []
  );

  // Refresh authentication
  const refreshAuth = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Try to get current session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.user) {
        // No valid session, clear cache and set unauthenticated state
        clearCachedData();
        setState({
          user: null,
          profile: null,
          loading: false,
          error: null,
          isAuthenticated: false,
          isApproved: false,
        });
        return;
      }

      // Fetch user profile with retry logic
      let profile = await fetchUserProfile(session.user.id);

      // If profile fetch fails, try one more time after a short delay
      if (!profile) {
        // First profile fetch failed, retrying...
        await new Promise((resolve) => setTimeout(resolve, 1000));
        profile = await fetchUserProfile(session.user.id);
      }

      if (!profile) {
        // If still no profile, clear auth and redirect to login
        console.error("Failed to fetch user profile after retry");
        clearCachedData();
        setState({
          user: null,
          profile: null,
          loading: false,
          error: "Failed to load user profile",
          isAuthenticated: false,
          isApproved: false,
        });
        // Force redirect to login if we can't get profile
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return;
      }

      // Calculate session expiry (default to 1 hour if not available)
      const sessionExpiry = session.expires_at
        ? session.expires_at * 1000
        : Date.now() + 60 * 60 * 1000;

      // Cache the data
      const cachedData: CachedUserData = {
        user: session.user,
        profile,
        sessionExpiry,
        lastRefresh: Date.now(),
      };
      setCachedData(cachedData);

      // Update state
      setState({
        user: session.user,
        profile,
        loading: false,
        error: null,
        isAuthenticated: true,
        isApproved: profile.approved ?? false,
      });
    } catch (error) {
      console.error("Error refreshing auth:", error);

      // Clear potentially corrupted cache
      clearCachedData();

      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Authentication error",
        isAuthenticated: false,
        isApproved: false,
      }));

      // If there's a critical auth error, redirect to login
      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      }
    }
  }, [fetchUserProfile, setCachedData, clearCachedData]);

  // Clear authentication
  const clearAuth = useCallback(() => {
    clearCachedData();
    setState({
      user: null,
      profile: null,
      loading: false,
      error: null,
      isAuthenticated: false,
      isApproved: false,
    });
  }, [clearCachedData]);

  // Update profile in cache and state
  const updateProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      setState((prev) => {
        if (!prev.profile) return prev;

        const updatedProfile = { ...prev.profile, ...updates };

        // Update cache if user exists
        if (prev.user) {
          const cachedData = getCachedData();
          if (cachedData) {
            setCachedData({
              ...cachedData,
              profile: updatedProfile,
            });
          }
        }

        return {
          ...prev,
          profile: updatedProfile,
          isApproved: updatedProfile.approved ?? false,
        };
      });
    },
    [getCachedData, setCachedData]
  );

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // First, try to load from cache
        const cachedData = getCachedData();

        if (cachedData && !shouldRefreshSession(cachedData)) {
          // Validate cached data before using it
          if (cachedData.user && cachedData.profile && cachedData.profile.id) {
            // Use cached data immediately for faster UI
            if (mounted) {
              setState({
                user: cachedData.user,
                profile: cachedData.profile,
                loading: false,
                error: null,
                isAuthenticated: true,
                isApproved: cachedData.profile.approved ?? false,
              });
            }

            // Still refresh in background to ensure data is current
            // but don't show loading state
            setTimeout(async () => {
              if (mounted) {
                try {
                  const {
                    data: { session },
                  } = await supabase.auth.getSession();
                  if (session?.user) {
                    const freshProfile = await fetchUserProfile(
                      session.user.id
                    );
                    if (freshProfile && mounted) {
                      setState((prev) => ({
                        ...prev,
                        profile: freshProfile,
                        isApproved: freshProfile.approved ?? false,
                      }));

                      // Update cache with fresh data
                      const updatedCache: CachedUserData = {
                        user: session.user,
                        profile: freshProfile,
                        sessionExpiry: session.expires_at
                          ? session.expires_at * 1000
                          : Date.now() + 60 * 60 * 1000,
                        lastRefresh: Date.now(),
                      };
                      setCachedData(updatedCache);
                    }
                  }
                } catch (error) {
                  // Silent background refresh failure
                  console.warn("Background profile refresh failed:", error);
                }
              }
            }, 500);

            return;
          } else {
            // Cached data is invalid, clear it
            clearCachedData();
          }
        }

        // Cache is stale, invalid, or doesn't exist, refresh from server
        if (mounted) {
          await refreshAuth();
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
        // Clear potentially corrupted cache and refresh
        clearCachedData();
        if (mounted) {
          await refreshAuth();
        }
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // Auth state changed: ${event}

      if (event === "SIGNED_OUT" || !session) {
        clearAuth();
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        // Add a small delay to ensure session is fully established
        setTimeout(async () => {
          if (mounted) {
            await refreshAuth();
          }
        }, 100);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [
    getCachedData,
    shouldRefreshSession,
    refreshAuth,
    clearAuth,
    clearCachedData,
  ]);

  return {
    ...state,
    refreshAuth,
    clearAuth,
    updateProfile,
  };
}
