"use client";

import React, { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

// Sistema global simples para gerenciar estado de sync
class SimpleSyncManager {
  private static instance: SimpleSyncManager;
  private listeners = new Set<(isSyncing: boolean) => void>();
  private _isSyncing = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private isChecking = false;

  static getInstance(): SimpleSyncManager {
    if (!SimpleSyncManager.instance) {
      SimpleSyncManager.instance = new SimpleSyncManager();
    }
    return SimpleSyncManager.instance;
  }

  constructor() {
    // Don't start API checking in constructor - wait for first subscription
  }

  get isSyncing(): boolean {
    return this._isSyncing;
  }

  startSync() {
    console.log("🚀 SimpleSyncManager: Starting sync");
    this._isSyncing = true;
    this.notifyListeners();
  }

  stopSync() {
    console.log("✅ SimpleSyncManager: Stopping sync");
    this._isSyncing = false;
    this.notifyListeners();
  }

  private async checkApiSync() {
    // Only check API if we're in the browser
    if (typeof window === "undefined") {
      return;
    }

    try {
      const response = await fetch("/api/deals-health", {
        method: "GET",
        cache: "no-cache",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const apiSync = data.sync?.isRunning || false;

        // Only update if API says there's a sync and we don't know about it
        if (apiSync && !this._isSyncing) {
          console.log(
            "🌐 SimpleSyncManager: API detected sync, updating state"
          );
          this._isSyncing = true;
          this.notifyListeners();
        }
        // If API says no sync and we think there is one, check if it's been too long
        else if (!apiSync && this._isSyncing) {
          console.log(
            "🕐 SimpleSyncManager: API says no sync, but we think there is one"
          );
          // Could add timeout logic here if needed
        }
      }
    } catch (error) {
      console.warn("❌ SimpleSyncManager: API check failed:", error);
    }
  }

  private startApiChecking() {
    // Only start checking if we're in the browser
    if (typeof window === "undefined") {
      return;
    }

    // Smart polling: only check frequently when sync is running
    const smartCheck = async () => {
      if (!this.isChecking) return; // Stop if no more listeners

      await this.checkApiSync();

      if (!this.isChecking) return; // Check again after async operation

      if (this._isSyncing) {
        // If sync is running, check every 2 seconds
        setTimeout(smartCheck, 2000);
      } else {
        // If no sync, check every 10 seconds for new syncs
        setTimeout(smartCheck, 10000);
      }
    };

    // Start smart checking
    smartCheck();
  }

  private notifyListeners() {
    console.log(
      "📢 SimpleSyncManager: Notifying listeners, isSyncing:",
      this._isSyncing
    );
    this.listeners.forEach((listener) => listener(this._isSyncing));
  }

  subscribe(listener: (isSyncing: boolean) => void): () => void {
    this.listeners.add(listener);

    // Start API checking when first listener subscribes
    if (this.listeners.size === 1 && !this.isChecking) {
      console.log(
        "🔗 SimpleSyncManager: Starting API checking (first subscriber)"
      );
      this.isChecking = true;
      this.startApiChecking();
    }

    // Immediately notify with current state
    listener(this._isSyncing);

    // Also check API immediately when someone subscribes (if in browser)
    if (typeof window !== "undefined") {
      this.checkApiSync();
    }

    return () => {
      this.listeners.delete(listener);

      // Stop API checking when no more listeners
      if (this.listeners.size === 0 && this.isChecking) {
        console.log(
          "🔌 SimpleSyncManager: Stopping API checking (no more subscribers)"
        );
        this.isChecking = false;
        this.checkInterval = null;
      }
    };
  }
}

const simpleSyncManager = SimpleSyncManager.getInstance();

// Export para uso em outros componentes
export { simpleSyncManager };

export function SyncAlert() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Prevent hydration mismatch
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    console.log("🔗 SyncAlert: Subscribing to SimpleSyncManager");

    // Subscribe to the simple sync manager
    const unsubscribe = simpleSyncManager.subscribe((newState) => {
      console.log("🔄 SyncAlert: Received state update:", newState);
      setIsSyncing(newState);
    });

    return unsubscribe;
  }, [isHydrated]);

  // Log quando o estado muda
  useEffect(() => {
    console.log("🚨 SyncAlert state changed:", isSyncing);
  }, [isSyncing]);

  // Don't render anything until hydrated to prevent mismatch
  if (!isHydrated || !isSyncing) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
      <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 shadow-xl rounded-lg p-3 min-w-[250px]">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <span className="text-blue-800 dark:text-blue-200 font-medium text-sm">
            Sincronizando dados...
          </span>
        </div>
      </div>
    </div>
  );
}
