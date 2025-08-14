"use client";

import React, { createContext, useContext, useCallback } from "react";
import { User } from "@supabase/supabase-js";
import { usePersistentAuth } from "@/hooks/usePersistentAuth";
import { supabase } from "@/lib/supabase";

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

interface OptimizedAuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isApproved: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  refreshApprovalStatus: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => void;
  debugAuth: () => void;
}

const OptimizedAuthContext = createContext<
  OptimizedAuthContextType | undefined
>(undefined);

export function OptimizedAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    user,
    profile,
    loading,
    error,
    isAuthenticated,
    isApproved,
    refreshAuth,
    clearAuth,
    updateProfile,
  } = usePersistentAuth();

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data.session) {
        // The usePersistentAuth hook will handle the state update via the auth listener
        // Force a page refresh to ensure middleware picks up the new session
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 100);
      }

      return { error };
    } catch (err) {
      return { error: err };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      return { error };
    } catch (err) {
      return { error: err };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Clear auth state first to prevent UI flickering
      clearAuth();

      // Sign out from Supabase
      await supabase.auth.signOut();

      // Clear all localStorage/sessionStorage data
      if (typeof window !== "undefined") {
        // Clear all hudlab-related data
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
          if (
            key.includes("hudlab") ||
            key.includes("supabase") ||
            key.includes("auth") ||
            key.includes("persistent_auth_data") ||
            key.includes("user_profile_")
          ) {
            localStorage.removeItem(key);
          }
        });

        // Clear sessionStorage as well
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach((key) => {
          if (
            key.includes("hudlab") ||
            key.includes("supabase") ||
            key.includes("auth")
          ) {
            sessionStorage.removeItem(key);
          }
        });
      }

      // Force redirect to login page
      window.location.href = "/login";
    } catch (error) {
      console.error("Error signing out:", error);
      // Even if there's an error, force redirect to login
      window.location.href = "/login";
    }
  }, [clearAuth]);

  const refreshApprovalStatus = useCallback(async () => {
    if (user?.id) {
      try {
        const { data: profileData } = await supabase
          .from("user_profiles")
          .select("approved")
          .eq("id", user.id)
          .single();

        if (profileData && profile) {
          updateProfile({ approved: profileData.approved ?? false });
        }
      } catch (error) {
        console.error("Error refreshing approval status:", error);
      }
    }
  }, [user?.id, profile, updateProfile]);

  const debugAuth = useCallback(() => {
    // Debug function removed for production
  }, [user, profile, loading, error, isAuthenticated, isApproved]);

  const value: OptimizedAuthContextType = {
    user,
    profile,
    loading,
    error,
    isAuthenticated,
    isApproved,
    signIn,
    signUp,
    signOut,
    refreshAuth,
    refreshApprovalStatus,
    updateProfile,
    debugAuth,
  };

  return (
    <OptimizedAuthContext.Provider value={value}>
      {children}
    </OptimizedAuthContext.Provider>
  );
}

export function useOptimizedAuth() {
  const context = useContext(OptimizedAuthContext);
  if (context === undefined) {
    throw new Error(
      "useOptimizedAuth must be used within an OptimizedAuthProvider"
    );
  }
  return context;
}

// Backward compatibility - export the same interface as the original AuthContext
export const useAuth = useOptimizedAuth;
export const AuthProvider = OptimizedAuthProvider;

// Additional export for explicit usage
export { useOptimizedAuth as useOptimizedAuthContext };
