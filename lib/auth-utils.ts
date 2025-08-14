import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];

/**
 * Get user profile from server-side Supabase client
 * Used in API routes for authentication and authorization
 */
export async function getUserProfile(
  supabase: SupabaseClient<Database>
): Promise<UserProfile | null> {
  try {
    // Get the current authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    // Fetch user profile from database
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return null;
    }

    return profile;
  } catch (error) {
    console.error("Error in getUserProfile:", error);
    return null;
  }
}

/**
 * Check if user has required permissions
 */
export function hasPermission(
  profile: UserProfile | null,
  requiredRoles: string[]
): boolean {
  if (!profile || !profile.approved) {
    return false;
  }

  return requiredRoles.includes(profile.role);
}

/**
 * Check if user is owner or admin
 */
export function isOwnerOrAdmin(profile: UserProfile | null): boolean {
  return hasPermission(profile, ["owner", "admin"]);
}

/**
 * Check if user is approved and has access
 */
export function isApprovedUser(profile: UserProfile | null): boolean {
  return profile?.approved === true;
}
