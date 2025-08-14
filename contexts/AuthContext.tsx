"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { createClient } from "@/utils/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface UserProfile {
  id: string;
  approved: boolean;
  role: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isApproved: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch user profile from database
  const fetchUserProfile = useCallback(
    async (userId: string): Promise<UserProfile | null> => {
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select(
            "id, approved, role, first_name, last_name, email, avatar_url, created_at, updated_at"
          )
          .eq("id", userId)
          .single();

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
    [supabase]
  );

  // Refresh user profile
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;

    const profile = await fetchUserProfile(user.id);
    setProfile(profile);
  }, [user?.id, fetchUserProfile]);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Get initial session
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Error getting session:", error);
          setError("Erro ao carregar sessão");
        }

        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            const profile = await fetchUserProfile(session.user.id);
            setProfile(profile);
          }

          setLoading(false);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
        if (mounted) {
          setError("Erro ao inicializar autenticação");
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log("Auth state changed:", event);

      setSession(session);
      setUser(session?.user ?? null);
      setError(null);

      if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        setProfile(profile);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchUserProfile]);

  // Sign in function
  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setError("Email ou senha incorretos");
          return { error };
        }

        // Auth state will be updated by the listener
        return { error: null };
      } catch (error) {
        console.error("Error signing in:", error);
        setError("Erro inesperado ao fazer login");
        return { error };
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  // Sign up function
  const signUp = useCallback(
    async (email: string, password: string) => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          console.error("Supabase signup error:", error);
          setError(error.message || "Erro ao criar conta");
          return { error };
        }

        // User profile will be created automatically by database trigger

        return { error: null, user: data.user };
      } catch (error) {
        console.error("Error signing up:", error);
        setError("Erro inesperado ao criar conta");
        return { error };
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  // Sign out function
  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Error signing out:", error);
        setError("Erro ao fazer logout");
      }

      // Clear state immediately
      setUser(null);
      setProfile(null);
      setSession(null);

      // Redirect to login page and refresh
      window.location.href = "/login";
    } catch (error) {
      console.error("Error in signOut:", error);
      setError("Erro inesperado ao fazer logout");
      // Even if there's an error, redirect to login
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    error,
    isAuthenticated: !!user,
    isApproved: profile?.approved ?? false,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
