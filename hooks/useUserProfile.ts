"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/supabase";

type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];
type UserProfileUpdate =
  Database["public"]["Tables"]["user_profiles"]["Update"];

interface UseUserProfileReturn {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isPartnersMedia: boolean;
  isOwnerOrAdmin: boolean;
  role: string | null;
  updateProfile: (updates: UserProfileUpdate) => Promise<{ error: any }>;
  deleteProfile: () => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
}

export function useUserProfile(): UseUserProfileReturn {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // Use ref to prevent infinite loops
  const lastUserId = useRef<string | null>(null);
  const isInitialized = useRef(false);

  const fetchProfile = useCallback(async () => {
    const currentUserId = user?.id;
    const currentUserEmail = user?.email;

    // If no user, clear profile
    if (!currentUserId) {
      if (lastUserId.current !== null) {
        setProfile(null);
        setLoading(false);
        setError(null);
        lastUserId.current = null;
        isInitialized.current = true;
      }
      return;
    }

    // If user hasn't changed, don't refetch
    if (currentUserId === lastUserId.current && isInitialized.current) {
      return;
    }

    // Update last user ID
    lastUserId.current = currentUserId;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", currentUserId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          // Profile doesn't exist, create one
          const { data: newProfile, error: createError } = await supabase
            .from("user_profiles")
            .insert({
              id: currentUserId,
              email: currentUserEmail || "",
              role: "user",
              approved: false,
            })
            .select()
            .single();

          if (createError) {
            throw createError;
          }

          setProfile(newProfile);
        } else {
          throw fetchError;
        }
      } else {
        setProfile(data);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : "Erro ao carregar perfil";
      setError(errorMessage);
    } finally {
      setLoading(false);
      isInitialized.current = true;
    }
  }, [user?.id, supabase]);

  const updateProfile = async (updates: UserProfileUpdate) => {
    if (!user?.id) {
      return { error: { message: "Usuário não autenticado" } };
    }

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setProfile(data);
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  };

  const deleteProfile = async () => {
    if (!user?.id) {
      return { error: { message: "Usuário não autenticado" } };
    }

    try {
      // Call the API to delete the user from both auth.users and user_profiles
      const response = await fetch("/api/delete-user", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Erro ao deletar conta");
      }

      return { error: null };
    } catch (err) {
      return { error: err };
    }
  };

  const refreshProfile = useCallback(async () => {
    isInitialized.current = false; // Force refresh
    await fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    loading,
    error,
    isOwner: profile?.role === "owner",
    isAdmin: profile?.role === "admin",
    isManager: profile?.role === "manager",
    isPartnersMedia: profile?.role === "partners-media",
    isOwnerOrAdmin: profile?.role === "owner" || profile?.role === "admin",
    role: profile?.role || null,
    updateProfile,
    deleteProfile,
    refreshProfile,
  };
}
