"use client";

/**
 * Debug utilities to help diagnose and fix loading issues
 */

export const debugHelpers = {
  /**
   * Clear all authentication and cache data
   */
  clearAllAuthData: () => {
    if (typeof window === "undefined") return;

    try {
      // Clear localStorage items
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('supabase') || 
          key.includes('auth') || 
          key.includes('profile') ||
          key.includes('avatar') ||
          key.includes('hudlab')
        )) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`Removed localStorage key: ${key}`);
      });

      // Clear sessionStorage items
      const sessionKeysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (
          key.includes('supabase') || 
          key.includes('auth') || 
          key.includes('profile') ||
          key.includes('avatar') ||
          key.includes('hudlab')
        )) {
          sessionKeysToRemove.push(key);
        }
      }
      
      sessionKeysToRemove.forEach(key => {
        sessionStorage.removeItem(key);
        console.log(`Removed sessionStorage key: ${key}`);
      });

      console.log("All auth data cleared");
    } catch (error) {
      console.error("Error clearing auth data:", error);
    }
  },

  /**
   * Log current storage state
   */
  logStorageState: () => {
    if (typeof window === "undefined") return;

    console.group("Storage State");
    
    console.log("localStorage:");
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        console.log(`  ${key}:`, value?.substring(0, 100) + (value && value.length > 100 ? "..." : ""));
      }
    }

    console.log("sessionStorage:");
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        const value = sessionStorage.getItem(key);
        console.log(`  ${key}:`, value?.substring(0, 100) + (value && value.length > 100 ? "..." : ""));
      }
    }

    console.groupEnd();
  },

  /**
   * Force reload the page after clearing data
   */
  forceReload: () => {
    debugHelpers.clearAllAuthData();
    setTimeout(() => {
      window.location.reload();
    }, 100);
  },

  /**
   * Check for common issues
   */
  diagnoseIssues: async () => {
    console.group("Diagnosing Issues");

    // Check if we're in a browser environment
    if (typeof window === "undefined") {
      console.log("❌ Not in browser environment");
      console.groupEnd();
      return;
    }

    // Check localStorage availability
    try {
      localStorage.setItem("test", "test");
      localStorage.removeItem("test");
      console.log("✅ localStorage is working");
    } catch (error) {
      console.log("❌ localStorage is not working:", error);
    }

    // Check sessionStorage availability
    try {
      sessionStorage.setItem("test", "test");
      sessionStorage.removeItem("test");
      console.log("✅ sessionStorage is working");
    } catch (error) {
      console.log("❌ sessionStorage is not working:", error);
    }

    // Check Supabase environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    console.log("Supabase URL:", supabaseUrl ? "✅ Present" : "❌ Missing");
    console.log("Supabase Key:", supabaseKey ? "✅ Present" : "❌ Missing");

    // Check for stuck loading states
    const authTokens = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('supabase')) {
        authTokens.push(key);
      }
    }

    if (authTokens.length > 0) {
      console.log("🔍 Found Supabase tokens:", authTokens);
    } else {
      console.log("⚠️ No Supabase tokens found");
    }

    console.groupEnd();
  }
};

// Make available globally for debugging
if (typeof window !== "undefined") {
  (window as any).debugHelpers = debugHelpers;
}
