"use client";

/**
 * Cache Recovery Utilities
 * 
 * Handles cache conflicts and state recovery when the app
 * works in incognito mode but not in normal mode.
 */

export interface CacheRecoveryOptions {
  clearLocalStorage?: boolean;
  clearSessionStorage?: boolean;
  clearCookies?: boolean;
  clearIndexedDB?: boolean;
  preserveKeys?: string[];
}

/**
 * Clear all browser storage to resolve state conflicts
 */
export function clearAllCache(options: CacheRecoveryOptions = {}) {
  const {
    clearLocalStorage = true,
    clearSessionStorage = true,
    clearCookies = false,
    clearIndexedDB = false,
    preserveKeys = [],
  } = options;

  if (typeof window === 'undefined') {
    console.warn('clearAllCache called on server side');
    return;
  }

  try {
    // Preserve specific keys if needed
    const preservedData: Record<string, string> = {};
    if (preserveKeys.length > 0 && clearLocalStorage) {
      preserveKeys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
          preservedData[key] = value;
        }
      });
    }

    // Clear localStorage
    if (clearLocalStorage) {
      localStorage.clear();
      console.log('✅ localStorage cleared');
    }

    // Clear sessionStorage
    if (clearSessionStorage) {
      sessionStorage.clear();
      console.log('✅ sessionStorage cleared');
    }

    // Clear cookies
    if (clearCookies) {
      document.cookie.split(";").forEach((c) => {
        const eqPos = c.indexOf("=");
        const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
        if (name) {
          // Clear for current path
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          // Clear for root path
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
        }
      });
      console.log('✅ Cookies cleared');
    }

    // Clear IndexedDB (if needed)
    if (clearIndexedDB && 'indexedDB' in window) {
      // This is more complex and usually not needed for React apps
      console.log('⚠️ IndexedDB clearing not implemented');
    }

    // Restore preserved data
    if (preserveKeys.length > 0 && clearLocalStorage) {
      Object.entries(preservedData).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
      console.log('✅ Preserved keys restored:', preserveKeys);
    }

    console.log('🎉 Cache recovery completed successfully');
  } catch (error) {
    console.error('❌ Error during cache recovery:', error);
    throw error;
  }
}

/**
 * Detect if the app is running in incognito/private mode
 */
export async function isIncognitoMode(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    // Test localStorage availability
    const testKey = '__incognito_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return false;
  } catch {
    return true;
  }
}

/**
 * Check for common cache-related issues
 */
export function diagnoseCacheIssues(): {
  hasLocalStorageIssues: boolean;
  hasSessionStorageIssues: boolean;
  hasCookieIssues: boolean;
  recommendations: string[];
} {
  const issues = {
    hasLocalStorageIssues: false,
    hasSessionStorageIssues: false,
    hasCookieIssues: false,
    recommendations: [] as string[],
  };

  if (typeof window === 'undefined') {
    return issues;
  }

  try {
    // Test localStorage
    const testKey = '__cache_test__';
    localStorage.setItem(testKey, 'test');
    const retrieved = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    
    if (retrieved !== 'test') {
      issues.hasLocalStorageIssues = true;
      issues.recommendations.push('Clear localStorage');
    }
  } catch {
    issues.hasLocalStorageIssues = true;
    issues.recommendations.push('localStorage is not available or corrupted');
  }

  try {
    // Test sessionStorage
    const testKey = '__session_test__';
    sessionStorage.setItem(testKey, 'test');
    const retrieved = sessionStorage.getItem(testKey);
    sessionStorage.removeItem(testKey);
    
    if (retrieved !== 'test') {
      issues.hasSessionStorageIssues = true;
      issues.recommendations.push('Clear sessionStorage');
    }
  } catch {
    issues.hasSessionStorageIssues = true;
    issues.recommendations.push('sessionStorage is not available or corrupted');
  }

  // Check for suspicious cookies
  const cookies = document.cookie.split(';');
  if (cookies.length > 20) {
    issues.hasCookieIssues = true;
    issues.recommendations.push('Too many cookies, consider clearing them');
  }

  return issues;
}

/**
 * Safe cache clear with user confirmation
 */
export function safeCacheClear(options: CacheRecoveryOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    const confirmed = window.confirm(
      'This will clear your browser cache to fix loading issues. You may need to log in again. Continue?'
    );

    if (confirmed) {
      try {
        clearAllCache(options);
        resolve(true);
      } catch (error) {
        console.error('Failed to clear cache:', error);
        resolve(false);
      }
    } else {
      resolve(false);
    }
  });
}

/**
 * Auto-recovery function for hydration errors
 */
export function autoRecoverFromHydrationError() {
  if (typeof window === 'undefined') return;

  console.log('🔄 Attempting auto-recovery from hydration error...');
  
  // Clear problematic cache entries
  const problematicKeys = [
    'sidebar_state',
    'theme',
    'auth_state',
    'user_profile',
    'global_date_range',
    'global_period',
  ];

  problematicKeys.forEach(key => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove ${key}:`, error);
    }
  });

  console.log('✅ Auto-recovery completed');
}

/**
 * Create a cache recovery button component
 */
export function createCacheRecoveryButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = 'Clear Cache & Reload';
  button.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    background: #ef4444;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  
  button.onclick = async () => {
    const confirmed = await safeCacheClear({
      clearLocalStorage: true,
      clearSessionStorage: true,
      clearCookies: true,
    });
    
    if (confirmed) {
      window.location.reload();
    }
  };

  return button;
}
