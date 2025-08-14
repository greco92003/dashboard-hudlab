"use client";

import { useEffect, useState } from "react";

/**
 * Hook to detect and fix hydration issues
 * 
 * This hook helps resolve the common issue where the app works
 * in incognito mode but fails in normal mode due to cache conflicts.
 */
export function useHydrationFix() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasHydrationError, setHasHydrationError] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    // Mark as hydrated
    setIsHydrated(true);

    // Listen for hydration errors
    const handleError = (event: ErrorEvent) => {
      const error = event.error;
      if (error && (
        error.message?.includes('useState is not defined') ||
        error.message?.includes('useEffect is not defined') ||
        error.message?.includes('Hydration') ||
        error.message?.includes('hydration') ||
        error.message?.includes('Text content does not match')
      )) {
        console.warn('🚨 Hydration error detected:', error.message);
        setHasHydrationError(true);
        
        // Auto-recovery
        setTimeout(() => {
          recoverFromHydrationError();
        }, 1000);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('useState') || 
          event.reason?.message?.includes('hydration')) {
        console.warn('🚨 Promise rejection with hydration error:', event.reason);
        setHasHydrationError(true);
        
        setTimeout(() => {
          recoverFromHydrationError();
        }, 1000);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const recoverFromHydrationError = () => {
    if (isRecovering) return;
    
    setIsRecovering(true);
    console.log('🔄 Starting hydration error recovery...');

    try {
      // Clear problematic localStorage keys
      const problematicKeys = [
        'sidebar_state',
        'auth_state',
        'user_profile',
        'global_date_range',
        'global_period',
        'theme_state',
      ];

      problematicKeys.forEach(key => {
        try {
          const value = localStorage.getItem(key);
          if (value && (value.includes('undefined') || value === 'null' || value === '')) {
            localStorage.removeItem(key);
            console.log(`✅ Removed corrupted key: ${key}`);
          }
        } catch (error) {
          console.warn(`Failed to check/remove key ${key}:`, error);
        }
      });

      // Clear sessionStorage
      try {
        sessionStorage.clear();
        console.log('✅ sessionStorage cleared');
      } catch (error) {
        console.warn('Failed to clear sessionStorage:', error);
      }

      // Force a page reload after a short delay
      setTimeout(() => {
        console.log('🔄 Reloading page to complete recovery...');
        window.location.reload();
      }, 500);

    } catch (error) {
      console.error('❌ Recovery failed:', error);
      setIsRecovering(false);
    }
  };

  const manualRecovery = () => {
    if (typeof window === 'undefined') return;

    const confirmed = window.confirm(
      'This will clear your browser cache to fix loading issues. You may need to log in again. Continue?'
    );

    if (confirmed) {
      try {
        // Clear all storage
        localStorage.clear();
        sessionStorage.clear();
        
        // Clear cookies (optional)
        document.cookie.split(";").forEach((c) => {
          const eqPos = c.indexOf("=");
          const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          }
        });

        // Reload page
        window.location.reload();
      } catch (error) {
        console.error('Manual recovery failed:', error);
        alert('Failed to clear cache. Please try clearing your browser cache manually.');
      }
    }
  };

  return {
    isHydrated,
    hasHydrationError,
    isRecovering,
    recoverFromHydrationError,
    manualRecovery,
  };
}

/**
 * Hook to safely use localStorage with hydration protection
 */
export function useSafeLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void, boolean] {
  const [storedValue, setStoredValue] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const item = localStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item);
        setStoredValue(parsed);
      }
    } catch (error) {
      console.warn(`Failed to load ${key} from localStorage:`, error);
      // Remove corrupted data
      try {
        localStorage.removeItem(key);
      } catch (removeError) {
        console.warn(`Failed to remove corrupted ${key}:`, removeError);
      }
    } finally {
      setIsLoaded(true);
    }
  }, [key]);

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Failed to save ${key} to localStorage:`, error);
    }
  };

  return [storedValue, setValue, isLoaded];
}

/**
 * Hook to safely use sessionStorage with hydration protection
 */
export function useSafeSessionStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void, boolean] {
  const [storedValue, setStoredValue] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const item = sessionStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item);
        setStoredValue(parsed);
      }
    } catch (error) {
      console.warn(`Failed to load ${key} from sessionStorage:`, error);
      // Remove corrupted data
      try {
        sessionStorage.removeItem(key);
      } catch (removeError) {
        console.warn(`Failed to remove corrupted ${key}:`, removeError);
      }
    } finally {
      setIsLoaded(true);
    }
  }, [key]);

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Failed to save ${key} to sessionStorage:`, error);
    }
  };

  return [storedValue, setValue, isLoaded];
}

/**
 * Hook to detect if running in incognito mode
 */
export function useIncognitoDetection() {
  const [isIncognito, setIsIncognito] = useState<boolean | null>(null);

  useEffect(() => {
    const detectIncognito = async () => {
      try {
        // Test localStorage availability
        const testKey = '__incognito_test__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        setIsIncognito(false);
      } catch {
        setIsIncognito(true);
      }
    };

    detectIncognito();
  }, []);

  return isIncognito;
}
