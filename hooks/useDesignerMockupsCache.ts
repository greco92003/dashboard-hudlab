import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { normalizeDesignerName } from "@/lib/utils/normalize-names";

interface DesignerMockupStats {
  quantidadeNegocios: number;
  mockupsFeitos: number;
  alteracoesFeitas: number;
}

interface MockupsCacheState {
  data: Record<string, DesignerMockupStats>;
  loading: boolean;
  error: string | null;
  lastSync: Date | null;
  cached: boolean;
}

interface SyncStats {
  totalRecords: number;
  processedRecords: number;
  newRecords: number;
  updatedRecords: number;
  errorRecords: number;
}

export function useDesignerMockupsCache() {
  const [state, setState] = useState<MockupsCacheState>({
    data: {},
    loading: false,
    error: null,
    lastSync: null,
    cached: false,
  });

  const isLoadingRef = useRef(false);

  // Usar a função de normalização centralizada
  const normalizeDesignerNameLocal = useCallback((name: string): string => {
    return normalizeDesignerName(name);
  }, []);

  const findMatchingDesigner = useCallback(
    (sheetDesignerName: string, designersList: string[]): string | null => {
      const normalizedSheetName = normalizeDesignerNameLocal(sheetDesignerName);

      return (
        designersList.find((designer) => {
          const normalizedDesigner = normalizeDesignerNameLocal(designer);
          return normalizedDesigner === normalizedSheetName;
        }) || null
      );
    },
    [normalizeDesignerNameLocal]
  );

  // Helper function to format date as local YYYY-MM-DD without timezone conversion
  const formatDateToLocal = useCallback((date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  // Fetch cached data (fast)
  const fetchCachedData = useCallback(
    async (designers: string[], startDate?: Date, endDate?: Date) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        console.log("📋 CACHE - Fetching cached mockups data...");
        console.log("📋 CACHE - Parameters:", {
          designers,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          startDateLocal: startDate ? formatDateToLocal(startDate) : null,
          endDateLocal: endDate ? formatDateToLocal(endDate) : null,
        });

        const params = new URLSearchParams();
        if (designers.length > 0) {
          params.append("designers", designers.join(","));
        }
        if (startDate) {
          // Use local date formatting to avoid timezone conversion issues
          params.append("startDate", formatDateToLocal(startDate));
        }
        if (endDate) {
          // Use local date formatting to avoid timezone conversion issues
          params.append("endDate", formatDateToLocal(endDate));
        }

        const response = await fetch(
          `/api/designer-mockups-cache?${params.toString()}`
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || result.details || "Erro ao buscar dados do cache"
          );
        }

        console.log("📋 CACHE - Cached data received:", {
          success: result.success,
          cached: result.cached,
          dataKeys: Object.keys(result.data || {}),
          fullData: result.data,
          lastSync: result.lastSync,
          requestParams: {
            designers,
            startDate: startDate?.toISOString().split("T")[0],
            endDate: endDate?.toISOString().split("T")[0],
          },
        });

        // Normalize designer names in the result
        const normalizedData: Record<string, DesignerMockupStats> = {};

        console.log("🔍 CACHE - Processing result data:", {
          resultDataKeys: Object.keys(result.data || {}),
          requestedDesigners: designers,
        });

        if (result.data) {
          Object.entries(result.data).forEach(([designer, stats]) => {
            console.log(`🔍 CACHE - Processing designer "${designer}":`, stats);
            const matchingDesigner = findMatchingDesigner(designer, designers);
            console.log(
              `🔍 CACHE - Matching designer found: "${matchingDesigner}"`
            );
            if (matchingDesigner) {
              normalizedData[matchingDesigner] = stats as DesignerMockupStats;
            }
          });
        }

        console.log("🔍 CACHE - Normalized data:", normalizedData);

        // Fill missing designers with zeros
        designers.forEach((designer) => {
          if (!normalizedData[designer]) {
            console.log(
              `⚠️ CACHE - Designer "${designer}" not found in result, filling with zeros`
            );
            normalizedData[designer] = {
              quantidadeNegocios: 0,
              mockupsFeitos: 0,
              alteracoesFeitas: 0,
            };
          }
        });

        console.log("✅ CACHE - Final normalized data:", normalizedData);

        setState((prev) => ({
          ...prev,
          data: normalizedData,
          loading: false,
          lastSync: result.lastSync?.timestamp
            ? new Date(result.lastSync.timestamp)
            : null,
          cached: result.cached || false,
        }));

        return normalizedData;
      } catch (error) {
        console.error("❌ Error fetching cached data:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Erro desconhecido";

        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));

        // Don't show toast for cache errors, just log them
        console.warn(`Cache miss: ${errorMessage}`);
        throw error;
      }
    },
    [findMatchingDesigner, formatDateToLocal]
  );

  // Sync data from Google Sheets to cache (slower, but fresh data)
  const syncToCache = useCallback(
    async (
      designers: string[],
      startDate?: Date,
      endDate?: Date,
      forceSync = false
    ) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        console.log("🔄 CACHE - Syncing data to cache...");
        console.log("🔄 CACHE - Parameters:", {
          designers,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          forceSync,
        });

        const response = await fetch("/api/designer-mockups-cache", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            designers,
            startDate: startDate ? formatDateToLocal(startDate) : undefined,
            endDate: endDate ? formatDateToLocal(endDate) : undefined,
            forceSync,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          // Handle "Sync already in progress" error gracefully
          if (response.status === 429) {
            console.log("⚠️ Sync already in progress, trying cache instead...");
            // Try to fetch from cache instead
            return await fetchCachedData(designers, startDate, endDate);
          }
          throw new Error(
            result.error || result.details || "Erro ao sincronizar dados"
          );
        }

        console.log("🔄 CACHE - Sync completed:", {
          success: result.success,
          cached: result.cached,
          syncStats: result.syncStats,
          message: result.message,
        });

        // Normalize designer names in the result
        const normalizedData: Record<string, DesignerMockupStats> = {};

        if (result.data) {
          Object.entries(result.data).forEach(([designer, stats]) => {
            const matchingDesigner = findMatchingDesigner(designer, designers);
            if (matchingDesigner) {
              normalizedData[matchingDesigner] = stats as DesignerMockupStats;
            }
          });
        }

        // Fill missing designers with zeros
        designers.forEach((designer) => {
          if (!normalizedData[designer]) {
            normalizedData[designer] = {
              quantidadeNegocios: 0,
              mockupsFeitos: 0,
              alteracoesFeitas: 0,
            };
          }
        });

        setState((prev) => ({
          ...prev,
          data: normalizedData,
          loading: false,
          lastSync: new Date(),
          cached: result.cached || false,
        }));

        if (result.cached) {
          toast.success("Dados carregados do cache!");
        } else {
          toast.success("Dados sincronizados com sucesso!");
        }

        return normalizedData;
      } catch (error) {
        console.error("❌ Error syncing to cache:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Erro desconhecido";

        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));

        toast.error(`Erro ao sincronizar: ${errorMessage}`);
        throw error;
      }
    },
    [findMatchingDesigner, formatDateToLocal, fetchCachedData]
  );

  // Smart fetch: try cache first, fallback to sync if needed
  const fetchMockupsData = useCallback(
    async (designers: string[], startDate?: Date, endDate?: Date) => {
      // Prevent concurrent requests
      if (isLoadingRef.current) {
        console.log("🚫 SMART FETCH - Already loading, skipping request");
        return state.data;
      }

      isLoadingRef.current = true;

      try {
        // Try cache first
        console.log("🎯 SMART FETCH - Trying cache first...");
        const result = await fetchCachedData(designers, startDate, endDate);
        return result;
      } catch (cacheError) {
        console.log("⚠️ SMART FETCH - Cache failed, trying sync...");

        try {
          // Fallback to sync
          const result = await syncToCache(
            designers,
            startDate,
            endDate,
            false
          );
          return result;
        } catch (syncError) {
          console.error(
            "❌ SMART FETCH - Both cache and sync failed:",
            syncError
          );

          // Initialize with empty data
          const emptyData: Record<string, DesignerMockupStats> = {};
          designers.forEach((designer) => {
            emptyData[designer] = {
              quantidadeNegocios: 0,
              mockupsFeitos: 0,
              alteracoesFeitas: 0,
            };
          });

          setState((prev) => ({
            ...prev,
            data: emptyData,
            loading: false,
            error: "Não foi possível carregar os dados. Tente novamente.",
          }));

          return emptyData;
        }
      } finally {
        // Reset loading flag after a delay to prevent rapid successive calls
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 1000);
      }
    },
    [fetchCachedData, syncToCache, state.data]
  );

  // Manual sync (force refresh)
  const syncMockups = useCallback(
    async (designers: string[], startDate?: Date, endDate?: Date) => {
      return syncToCache(designers, startDate, endDate, true);
    },
    [syncToCache]
  );

  return {
    ...state,
    fetchMockupsData,
    syncMockups,
    fetchCachedData,
    syncToCache,
  };
}
