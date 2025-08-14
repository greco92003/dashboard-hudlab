"use client";

import React, { useEffect, useState } from "react";
import { clearAllCache, diagnoseCacheIssues, autoRecoverFromHydrationError } from "@/lib/cache-recovery";

interface CacheRecoveryProviderProps {
  children: React.ReactNode;
  autoRecover?: boolean;
  showRecoveryButton?: boolean;
}

export function CacheRecoveryProvider({ 
  children, 
  autoRecover = true,
  showRecoveryButton = true 
}: CacheRecoveryProviderProps) {
  const [hasIssues, setHasIssues] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    // Check for cache issues
    const issues = diagnoseCacheIssues();
    const hasAnyIssues = issues.hasLocalStorageIssues || 
                        issues.hasSessionStorageIssues || 
                        issues.hasCookieIssues;

    setHasIssues(hasAnyIssues);

    // Auto-recover if enabled and issues detected
    if (autoRecover && hasAnyIssues) {
      console.log('🔍 Cache issues detected:', issues);
      autoRecoverFromHydrationError();
    }

    // Show recovery button if issues persist
    if (showRecoveryButton && hasAnyIssues) {
      // Delay showing button to avoid flash
      setTimeout(() => setShowButton(true), 2000);
    }

    // Listen for unhandled errors that might be cache-related
    const handleError = (event: ErrorEvent) => {
      const error = event.error;
      if (error && (
        error.message?.includes('useState is not defined') ||
        error.message?.includes('useEffect is not defined') ||
        error.message?.includes('Hydration') ||
        error.message?.includes('hydration')
      )) {
        console.log('🚨 Detected cache-related error, attempting recovery...');
        autoRecoverFromHydrationError();
        
        // Show recovery button
        setShowButton(true);
      }
    };

    window.addEventListener('error', handleError);
    
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, [autoRecover, showRecoveryButton]);

  const handleManualRecovery = async () => {
    setIsRecovering(true);
    
    try {
      await clearAllCache({
        clearLocalStorage: true,
        clearSessionStorage: true,
        clearCookies: false, // Don't clear auth cookies by default
        preserveKeys: ['theme'], // Preserve theme preference
      });
      
      // Reload the page after clearing cache
      window.location.reload();
    } catch (error) {
      console.error('Manual recovery failed:', error);
      setIsRecovering(false);
    }
  };

  return (
    <>
      {children}
      
      {/* Recovery Button */}
      {showButton && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            background: 'rgba(239, 68, 68, 0.95)',
            color: 'white',
            border: 'none',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
            ⚠️ Cache Issues Detected
          </div>
          <div style={{ marginBottom: '12px', fontSize: '12px', opacity: 0.9 }}>
            The app works in incognito mode but has issues in normal mode.
          </div>
          <button
            onClick={handleManualRecovery}
            disabled={isRecovering}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '8px 12px',
              borderRadius: '4px',
              cursor: isRecovering ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              width: '100%',
              opacity: isRecovering ? 0.6 : 1,
            }}
          >
            {isRecovering ? 'Clearing Cache...' : 'Clear Cache & Reload'}
          </button>
          <button
            onClick={() => setShowButton(false)}
            style={{
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.7)',
              border: 'none',
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '10px',
              width: '100%',
              marginTop: '4px',
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      
      {/* Development Mode Indicator */}
      {process.env.NODE_ENV === 'development' && hasIssues && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: 9998,
            background: 'rgba(251, 146, 60, 0.95)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            backdropFilter: 'blur(8px)',
          }}
        >
          🔧 DEV: Cache issues detected - check console
        </div>
      )}
    </>
  );
}

/**
 * Hook to manually trigger cache recovery
 */
export function useCacheRecovery() {
  const [isRecovering, setIsRecovering] = useState(false);

  const recoverCache = async (options?: {
    clearLocalStorage?: boolean;
    clearSessionStorage?: boolean;
    clearCookies?: boolean;
    preserveKeys?: string[];
    reload?: boolean;
  }) => {
    const {
      clearLocalStorage = true,
      clearSessionStorage = true,
      clearCookies = false,
      preserveKeys = ['theme'],
      reload = true,
    } = options || {};

    setIsRecovering(true);

    try {
      await clearAllCache({
        clearLocalStorage,
        clearSessionStorage,
        clearCookies,
        preserveKeys,
      });

      if (reload) {
        window.location.reload();
      } else {
        setIsRecovering(false);
      }
    } catch (error) {
      console.error('Cache recovery failed:', error);
      setIsRecovering(false);
      throw error;
    }
  };

  return {
    recoverCache,
    isRecovering,
  };
}

/**
 * Error boundary that can trigger cache recovery
 */
export class CacheRecoveryErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<any> },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('CacheRecoveryErrorBoundary caught an error:', error, errorInfo);
    
    // Check if it's a cache-related error
    if (
      error.message?.includes('useState is not defined') ||
      error.message?.includes('useEffect is not defined') ||
      error.message?.includes('Hydration') ||
      error.message?.includes('hydration')
    ) {
      console.log('🔄 Triggering automatic cache recovery...');
      autoRecoverFromHydrationError();
    }
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback;
      
      if (FallbackComponent) {
        return <FallbackComponent error={this.state.error} />;
      }

      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          margin: '20px',
        }}>
          <h2 style={{ color: '#dc2626', marginBottom: '10px' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#7f1d1d', marginBottom: '15px' }}>
            This might be a cache-related issue. Try clearing your browser cache.
          </p>
          <button
            onClick={() => {
              clearAllCache();
              window.location.reload();
            }}
            style={{
              background: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            Clear Cache & Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
