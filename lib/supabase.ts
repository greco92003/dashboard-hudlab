import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/supabase";
import { storage } from "@/lib/storage";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DEPRECATED: Use createClient() from @/utils/supabase/client instead
 *
 * This file is kept for backward compatibility but now uses the official
 * Supabase SSR pattern internally. All new code should import from
 * @/utils/supabase/client directly.
 *
 * Migration guide:
 * - Replace: import { supabase } from "@/lib/supabase"
 * - With: import { createClient } from "@/utils/supabase/client"
 * - Then use: const supabase = createClient()
 */

// Create a function that returns the official Supabase client
// This maintains backward compatibility while using the correct SSR pattern
export const supabase: SupabaseClient<Database> =
  createClient() as SupabaseClient<Database>;

// Types for our database tables
export interface PairValue {
  id: number;
  value: string;
  created_at: string;
  updated_at: string;
}

// Auth types
export interface User {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: User;
}

// Session management utilities
export const sessionUtils = {
  // Check if session is valid and not expired
  isSessionValid: async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error || !session) return false;

      // Check if session is close to expiry (within 5 minutes)
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

      return expiresAt > fiveMinutesFromNow;
    } catch {
      return false;
    }
  },

  // Refresh session if needed
  refreshSessionIfNeeded: async () => {
    try {
      const isValid = await sessionUtils.isSessionValid();
      if (!isValid) {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) throw error;
        return data.session;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session;
    } catch (error) {
      console.error("Error refreshing session:", error);
      return null;
    }
  },

  // Get session with automatic refresh
  getValidSession: async () => {
    return await sessionUtils.refreshSessionIfNeeded();
  },

  // Clear all session data
  clearSession: async () => {
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();

      // Clear all storage data
      if (typeof window !== "undefined") {
        // Clear localStorage
        const keys = storage.keys();
        keys.forEach((key) => {
          if (
            key.includes("hudlab") ||
            key.includes("supabase") ||
            key.includes("auth") ||
            key.includes("persistent_auth_data") ||
            key.includes("user_profile_") ||
            key.includes("long_term_user_") ||
            key.startsWith("sb-")
          ) {
            storage.removeItem(key);
          }
        });

        // Clear sessionStorage
        const sessionKeys = Object.keys(sessionStorage);
        sessionKeys.forEach((key) => {
          if (
            key.includes("hudlab") ||
            key.includes("supabase") ||
            key.includes("auth") ||
            key.startsWith("sb-")
          ) {
            sessionStorage.removeItem(key);
          }
        });

        // Clear any cookies related to auth
        document.cookie.split(";").forEach((cookie) => {
          const eqPos = cookie.indexOf("=");
          const name =
            eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          if (
            name.includes("hudlab") ||
            name.includes("supabase") ||
            name.includes("auth") ||
            name.startsWith("sb-")
          ) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          }
        });
      }
    } catch (error) {
      console.error("Error clearing session:", error);
      // Even if there's an error, try to clear storage
      if (typeof window !== "undefined") {
        try {
          storage.clear();
          sessionStorage.clear();
        } catch (storageError) {
          console.error("Error clearing storage:", storageError);
        }
      }
    }
  },
};
