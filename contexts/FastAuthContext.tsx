"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User } from "@supabase/supabase-js";
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

interface FastAuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isApproved: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const FastAuthContext = createContext<FastAuthContextType | undefined>(undefined);

export function FastAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fast profile fetch with timeout protection
  const fetchUserProfile = useCallback(
    async (userId: string): Promise<UserProfile | null> => {
      try {
        // Set a timeout for the profile fetch
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Profile fetch timeout")), 5000);
        });

        const fetchPromise = supabase
          .from("user_profiles")
          .select("id, approved, role, first_name, last_name, email, avatar_url, created_at, updated_at")
          .eq("id", userId)
          .single();

        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

        if (error) {
          console.error("Error fetching user profile:", error);
          return null;
        }

        return data;
      } catch (error) {
        console.error("Error in fetchUserProfile:", error);
        return null;
      }
    },
    []
  );

  // Initialize auth state with timeout protection
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const initializeAuth = async () => {
      try {
        // Set overall timeout for initialization
        timeoutId = setTimeout(() => {
          if (mounted) {
            console.warn("Auth initialization timeout, setting loading to false");
            setLoading(false);
          }
        }, 8000); // 8 second timeout

        // Get initial session
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error("Error getting session:", error);
          setError("Erro ao carregar sessão");
        }

        if (mounted) {
          setUser(session?.user ?? null);

          if (session?.user) {
            // Fetch profile with timeout protection
            const profile = await fetchUserProfile(session.user.id);
            if (mounted) {
              setProfile(profile);
            }
          }

          clearTimeout(timeoutId);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
        if (mounted) {
          setError("Erro ao inicializar autenticação");
          clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log("Auth state changed:", event);

      setUser(session?.user ?? null);
      setError(null);

      if (session?.user) {
        // Don't set loading to true for auth changes, just fetch profile
        const profile = await fetchUserProfile(session.user.id);
        if (mounted) {
          setProfile(profile);
        }
      } else {
        setProfile(null);
      }

      // Only set loading to false if it's not already false
      if (loading) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [fetchUserProfile, loading]);

  // Refresh user profile
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;

    const profile = await fetchUserProfile(user.id);
    setProfile(profile);
  }, [user?.id, fetchUserProfile]);

  // Sign in function
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setError(null);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError("Email ou senha incorretos");
        return { error };
      }

      return { error: null };
    } catch (error) {
      console.error("Error signing in:", error);
      setError("Erro inesperado ao fazer login");
      return { error };
    }
  }, []);

  // Sign up function
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      setError(null);

      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError("Erro ao criar conta");
        return { error };
      }

      return { error: null };
    } catch (error) {
      console.error("Error signing up:", error);
      setError("Erro inesperado ao criar conta");
      return { error };
    }
  }, []);

  // Sign out function
  const signOut = useCallback(async () => {
    try {
      setError(null);

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Error signing out:", error);
        setError("Erro ao fazer logout");
      }

      // Clear state immediately
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error("Error in signOut:", error);
      setError("Erro inesperado ao fazer logout");
    }
  }, []);

  const value: FastAuthContextType = {
    user,
    profile,
    loading,
    error,
    isAuthenticated: !!user,
    isApproved: profile?.approved ?? false,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <FastAuthContext.Provider value={value}>{children}</FastAuthContext.Provider>;
}

export function useFastAuth() {
  const context = useContext(FastAuthContext);
  if (context === undefined) {
    throw new Error("useFastAuth must be used within a FastAuthProvider");
  }
  return context;
}
