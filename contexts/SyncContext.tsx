"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

// Create a global sync manager that works outside React
class SyncManager {
  private static instance: SyncManager;
  private _isSyncing = false;
  private listeners = new Set<(isSyncing: boolean) => void>();
  private storageKey = "hudlab_sync_state";

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  constructor() {
    // Initialize from storage
    this.loadFromStorage();

    // Listen for storage changes from other tabs
    if (typeof window !== "undefined") {
      window.addEventListener("storage", this.handleStorageChange.bind(this));
    }
  }

  private loadFromStorage() {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem(this.storageKey);
      this._isSyncing = stored === "true";
    } catch (error) {
      console.warn("Could not load sync state from storage:", error);
    }
  }

  private saveToStorage() {
    if (typeof window === "undefined") return;

    try {
      if (this._isSyncing) {
        localStorage.setItem(this.storageKey, "true");
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch (error) {
      console.warn("Could not save sync state to storage:", error);
    }
  }

  private handleStorageChange(event: StorageEvent) {
    if (event.key === this.storageKey) {
      const newValue = event.newValue === "true";
      if (newValue !== this._isSyncing) {
        this._isSyncing = newValue;
        this.notifyListeners();
      }
    }
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this._isSyncing));
  }

  get isSyncing(): boolean {
    return this._isSyncing;
  }

  startSync() {
    console.log("🚀 SyncManager: Starting sync");
    this._isSyncing = true;
    this.saveToStorage();
    this.notifyListeners();
  }

  stopSync() {
    console.log("✅ SyncManager: Stopping sync");
    this._isSyncing = false;
    this.saveToStorage();
    this.notifyListeners();
  }

  // Force sync state update (useful when localStorage is changed externally)
  forceUpdate() {
    this.loadFromStorage();
    this.notifyListeners();
    console.log(
      "🔄 SyncManager: Force updated from storage, isSyncing:",
      this._isSyncing
    );
  }

  subscribe(listener: (isSyncing: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

// Get the singleton instance
const syncManager = SyncManager.getInstance();

// Data refresh manager for handling page updates after sync
class DataRefreshManager {
  private static instance: DataRefreshManager;
  private refreshCallbacks = new Map<string, () => void>();

  static getInstance(): DataRefreshManager {
    if (!DataRefreshManager.instance) {
      DataRefreshManager.instance = new DataRefreshManager();
    }
    return DataRefreshManager.instance;
  }

  // Register a refresh callback for a specific page/component
  registerRefreshCallback(key: string, callback: () => void) {
    this.refreshCallbacks.set(key, callback);
    console.log(
      `📝 DataRefreshManager: Registered refresh callback for ${key}`
    );
  }

  // Unregister a refresh callback
  unregisterRefreshCallback(key: string) {
    this.refreshCallbacks.delete(key);
    console.log(
      `🗑️ DataRefreshManager: Unregistered refresh callback for ${key}`
    );
  }

  // Trigger refresh for specific pages
  refreshBusinessDataPages() {
    const businessDataPages = ["dashboard", "deals", "pairs-sold"];
    businessDataPages.forEach((page) => {
      const callback = this.refreshCallbacks.get(page);
      if (callback) {
        console.log(`🔄 DataRefreshManager: Refreshing ${page}`);
        callback();
      }
    });
  }

  // Trigger refresh for follow-up pages
  refreshFollowUpPages() {
    const followUpPages = ["sellers", "designers"];
    followUpPages.forEach((page) => {
      const callback = this.refreshCallbacks.get(page);
      if (callback) {
        console.log(`🔄 DataRefreshManager: Refreshing ${page}`);
        callback();
      }
    });
  }

  // Trigger refresh for all registered pages
  refreshAllPages() {
    console.log(
      `🔄 DataRefreshManager: Refreshing all ${this.refreshCallbacks.size} registered pages`
    );
    this.refreshCallbacks.forEach((callback, key) => {
      console.log(`🔄 DataRefreshManager: Refreshing ${key}`);
      callback();
    });
  }
}

// Get the singleton instance
const dataRefreshManager = DataRefreshManager.getInstance();

interface SyncContextType {
  isSyncing: boolean;
  startSync: () => void;
  stopSync: () => void;
  registerPageRefresh: (pageKey: string, refreshCallback: () => void) => void;
  unregisterPageRefresh: (pageKey: string) => void;
  triggerDataRefresh: () => void;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [isSyncing, setIsSyncing] = useState(false); // Start with false to prevent hydration mismatch
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Prevent hydration mismatch
    setIsHydrated(true);

    // Subscribe to sync manager updates
    const unsubscribe = syncManager.subscribe((newState) => {
      setIsSyncing(newState);
    });

    // Initialize with current state after subscription
    setIsSyncing(syncManager.isSyncing);

    return unsubscribe;
  }, []);

  const startSync = () => {
    syncManager.startSync();
  };

  const stopSync = () => {
    syncManager.stopSync();
  };

  const registerPageRefresh = useCallback(
    (pageKey: string, refreshCallback: () => void) => {
      dataRefreshManager.registerRefreshCallback(pageKey, refreshCallback);
    },
    []
  );

  const unregisterPageRefresh = useCallback((pageKey: string) => {
    dataRefreshManager.unregisterRefreshCallback(pageKey);
  }, []);

  const triggerDataRefresh = useCallback(() => {
    // Refresh both business data and follow-up pages
    dataRefreshManager.refreshBusinessDataPages();
    dataRefreshManager.refreshFollowUpPages();
  }, []);

  return (
    <SyncContext.Provider
      value={{
        isSyncing: isHydrated ? isSyncing : false, // Prevent hydration mismatch
        startSync,
        stopSync,
        registerPageRefresh,
        unregisterPageRefresh,
        triggerDataRefresh,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error("useSyncContext must be used within a SyncProvider");
  }
  return context;
}
