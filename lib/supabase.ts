import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create optimized Supabase client with persistent session configuration
export const supabase = createBrowserClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      // Enable automatic token refresh
      autoRefreshToken: true,
      // Persist session in localStorage (default)
      persistSession: true,
      // Detect session in URL (for email confirmations, etc.)
      detectSessionInUrl: true,
      // Use default storage key to ensure compatibility with SSR
      // storageKey: "hudlab-auth-token", // Removed custom storage key
    },
    // Global configuration
    global: {
      headers: {
        "X-Client-Info": "hudlab-dashboard",
      },
    },
  }
);

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
        const keys = Object.keys(localStorage);
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
            localStorage.removeItem(key);
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
          localStorage.clear();
          sessionStorage.clear();
        } catch (storageError) {
          console.error("Error clearing storage:", storageError);
        }
      }
    }
  },
};
