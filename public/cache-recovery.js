/**
 * Cache Recovery Script
 * 
 * This script runs immediately when the page loads to detect and fix
 * cache-related issues that prevent the app from working in normal mode
 * but allow it to work in incognito mode.
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    DEBUG: true,
    AUTO_CLEAR_ON_ERROR: true,
    SHOW_RECOVERY_BUTTON: true,
    PRESERVE_KEYS: ['theme', 'language'],
  };

  // Utility functions
  function log(message, ...args) {
    if (CONFIG.DEBUG) {
      console.log(`[CacheRecovery] ${message}`, ...args);
    }
  }

  function warn(message, ...args) {
    console.warn(`[CacheRecovery] ${message}`, ...args);
  }

  function error(message, ...args) {
    console.error(`[CacheRecovery] ${message}`, ...args);
  }

  // Check if we're in incognito mode
  function isIncognitoMode() {
    try {
      const testKey = '__incognito_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return false;
    } catch {
      return true;
    }
  }

  // Detect cache-related issues
  function detectCacheIssues() {
    const issues = [];

    // Check localStorage
    try {
      const testKey = '__cache_test__';
      localStorage.setItem(testKey, 'test');
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      
      if (retrieved !== 'test') {
        issues.push('localStorage_corrupted');
      }
    } catch (e) {
      issues.push('localStorage_unavailable');
    }

    // Check sessionStorage
    try {
      const testKey = '__session_test__';
      sessionStorage.setItem(testKey, 'test');
      const retrieved = sessionStorage.getItem(testKey);
      sessionStorage.removeItem(testKey);
      
      if (retrieved !== 'test') {
        issues.push('sessionStorage_corrupted');
      }
    } catch (e) {
      issues.push('sessionStorage_unavailable');
    }

    // Check for excessive cookies
    if (document.cookie.split(';').length > 20) {
      issues.push('too_many_cookies');
    }

    // Check for problematic localStorage keys
    const problematicKeys = [
      'sidebar_state',
      'auth_state', 
      'user_profile',
      'global_date_range',
    ];

    problematicKeys.forEach(key => {
      try {
        const value = localStorage.getItem(key);
        if (value && value.includes('undefined') || value === 'null') {
          issues.push(`corrupted_key_${key}`);
        }
      } catch (e) {
        // Ignore
      }
    });

    return issues;
  }

  // Clear cache with preservation
  function clearCache(options = {}) {
    const {
      clearLocalStorage = true,
      clearSessionStorage = true,
      clearCookies = false,
      preserveKeys = CONFIG.PRESERVE_KEYS,
    } = options;

    log('Starting cache clear...', options);

    try {
      // Preserve specific keys
      const preservedData = {};
      if (preserveKeys.length > 0 && clearLocalStorage) {
        preserveKeys.forEach(key => {
          try {
            const value = localStorage.getItem(key);
            if (value) {
              preservedData[key] = value;
            }
          } catch (e) {
            warn(`Failed to preserve key ${key}:`, e);
          }
        });
      }

      // Clear localStorage
      if (clearLocalStorage) {
        localStorage.clear();
        log('localStorage cleared');
      }

      // Clear sessionStorage
      if (clearSessionStorage) {
        sessionStorage.clear();
        log('sessionStorage cleared');
      }

      // Clear cookies
      if (clearCookies) {
        document.cookie.split(";").forEach((c) => {
          const eqPos = c.indexOf("=");
          const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
          }
        });
        log('Cookies cleared');
      }

      // Restore preserved data
      Object.entries(preservedData).forEach(([key, value]) => {
        try {
          localStorage.setItem(key, value);
        } catch (e) {
          warn(`Failed to restore key ${key}:`, e);
        }
      });

      log('Cache clear completed successfully');
      return true;
    } catch (e) {
      error('Cache clear failed:', e);
      return false;
    }
  }

  // Create recovery button
  function createRecoveryButton() {
    if (!CONFIG.SHOW_RECOVERY_BUTTON) return;

    const button = document.createElement('div');
    button.id = 'cache-recovery-button';
    button.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        background: rgba(239, 68, 68, 0.95);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: system-ui, sans-serif;
        font-size: 14px;
        backdrop-filter: blur(8px);
        cursor: pointer;
        max-width: 280px;
      ">
        <div style="margin-bottom: 8px; font-weight: bold;">
          ⚠️ Cache Issues Detected
        </div>
        <div style="margin-bottom: 12px; font-size: 12px; opacity: 0.9;">
          App works in incognito but has issues in normal mode.
        </div>
        <button onclick="window.cacheRecovery.clearAndReload()" style="
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          width: 100%;
          margin-bottom: 4px;
        ">
          Clear Cache & Reload
        </button>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          border: none;
          padding: 4px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 10px;
          width: 100%;
        ">
          Dismiss
        </button>
      </div>
    `;

    document.body.appendChild(button);
    log('Recovery button created');
  }

  // Main recovery function
  function performRecovery() {
    log('Performing cache recovery...');
    
    const success = clearCache({
      clearLocalStorage: true,
      clearSessionStorage: true,
      clearCookies: false,
    });

    if (success) {
      log('Cache recovery completed, reloading page...');
      window.location.reload();
    } else {
      error('Cache recovery failed');
    }
  }

  // Error handler for React errors
  function handleReactError(event) {
    const error = event.error;
    if (error && (
      error.message?.includes('useState is not defined') ||
      error.message?.includes('useEffect is not defined') ||
      error.message?.includes('Hydration') ||
      error.message?.includes('hydration')
    )) {
      warn('Detected React hydration error:', error.message);
      
      if (CONFIG.AUTO_CLEAR_ON_ERROR) {
        log('Auto-clearing cache due to React error...');
        setTimeout(() => {
          performRecovery();
        }, 1000);
      } else {
        createRecoveryButton();
      }
    }
  }

  // Initialize
  function init() {
    log('Initializing cache recovery system...');

    // Check if we're in incognito mode
    if (isIncognitoMode()) {
      log('Running in incognito mode, cache recovery not needed');
      return;
    }

    // Detect issues
    const issues = detectCacheIssues();
    if (issues.length > 0) {
      warn('Cache issues detected:', issues);
      
      if (CONFIG.AUTO_CLEAR_ON_ERROR) {
        log('Auto-clearing cache due to detected issues...');
        setTimeout(() => {
          performRecovery();
        }, 2000);
      } else {
        createRecoveryButton();
      }
    } else {
      log('No cache issues detected');
    }

    // Listen for React errors
    window.addEventListener('error', handleReactError);
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason?.message?.includes('useState') || 
          event.reason?.message?.includes('hydration')) {
        handleReactError({ error: event.reason });
      }
    });

    // Expose global recovery functions
    window.cacheRecovery = {
      clearCache,
      performRecovery,
      detectIssues: detectCacheIssues,
      clearAndReload: () => {
        clearCache();
        window.location.reload();
      },
    };

    log('Cache recovery system initialized');
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
