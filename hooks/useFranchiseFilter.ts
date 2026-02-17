import { useState, useEffect, useCallback } from "react";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import {
  ZENITH_FRANCHISES,
  isZenithProduct,
  type Franchise,
} from "@/types/franchise";
import { storage } from "@/lib/storage";

const FRANCHISE_STORAGE_KEY = "zenith-franchise-filter";

// Custom event for franchise changes
const FRANCHISE_CHANGE_EVENT = "franchise-filter-changed";

export interface UseFranchiseFilterReturn {
  selectedFranchise: string | null;
  setSelectedFranchise: (franchise: string | null) => void;
  availableFranchises: Franchise[];
  isZenithBrand: boolean;
  shouldShowFranchiseFilter: boolean;
  clearFranchiseFilter: () => void;
  getFranchiseDisplayName: (franchiseName: string) => string;
}

export function useFranchiseFilter(
  selectedBrand?: string | null,
): UseFranchiseFilterReturn {
  const { assignedBrand } = useBrandFilter();
  const [selectedFranchise, setSelectedFranchiseState] = useState<
    string | null
  >(null);

  // Use selectedBrand parameter or fall back to assignedBrand
  const effectiveBrand = selectedBrand || assignedBrand;

  // Check if current brand is Zenith
  const isZenithBrand = effectiveBrand
    ? isZenithProduct(effectiveBrand)
    : false;

  // Only show franchise filter for Zenith brand
  const shouldShowFranchiseFilter = isZenithBrand;

  // Load franchise from sessionStorage on mount, or set default to first franchise
  useEffect(() => {
    if (typeof window !== "undefined" && shouldShowFranchiseFilter) {
      try {
        const parsedData = storage.getJSON<{
          franchise: string;
          brand: string;
          timestamp: number;
        }>(FRANCHISE_STORAGE_KEY);

        if (parsedData) {
          // Validate that the stored franchise is still valid
          const isValidFranchise = ZENITH_FRANCHISES.some(
            (f) => f.name === parsedData.franchise,
          );
          if (isValidFranchise && parsedData.brand === effectiveBrand) {
            setSelectedFranchiseState(parsedData.franchise);
            return; // Exit early if we found a valid stored franchise
          } else {
            // Clear invalid data
            storage.removeItem(FRANCHISE_STORAGE_KEY);
          }
        }

        // If no valid stored franchise, default to first franchise
        if (!selectedFranchise && ZENITH_FRANCHISES.length > 0) {
          const defaultFranchise = ZENITH_FRANCHISES[0].name;
          setSelectedFranchiseState(defaultFranchise);

          // Save default to sessionStorage
          const dataToStore = {
            franchise: defaultFranchise,
            brand: effectiveBrand,
            timestamp: Date.now(),
          };
          storage.setJSON(FRANCHISE_STORAGE_KEY, dataToStore);
        }
      } catch (error) {
        console.error(
          "Error loading franchise filter from sessionStorage:",
          error,
        );
        storage.removeItem(FRANCHISE_STORAGE_KEY);

        // Still set default even if there was an error
        if (!selectedFranchise && ZENITH_FRANCHISES.length > 0) {
          setSelectedFranchiseState(ZENITH_FRANCHISES[0].name);
        }
      }
    }
  }, [shouldShowFranchiseFilter, effectiveBrand]);

  // Listen for franchise changes from other components
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFranchiseChange = (event: CustomEvent) => {
      const { franchise, brand } = event.detail;

      // Only update if the brand matches
      if (brand === effectiveBrand) {
        setSelectedFranchiseState(franchise);
      }
    };

    window.addEventListener(
      FRANCHISE_CHANGE_EVENT,
      handleFranchiseChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        FRANCHISE_CHANGE_EVENT,
        handleFranchiseChange as EventListener,
      );
    };
  }, [effectiveBrand]);

  // Clear franchise filter when brand changes away from Zenith
  useEffect(() => {
    if (!shouldShowFranchiseFilter && selectedFranchise) {
      setSelectedFranchiseState(null);
      if (typeof window !== "undefined") {
        storage.removeItem(FRANCHISE_STORAGE_KEY);
      }
    }
  }, [shouldShowFranchiseFilter, selectedFranchise]);

  // Set franchise and save to sessionStorage
  const setSelectedFranchise = useCallback(
    (franchise: string | null) => {
      setSelectedFranchiseState(franchise);

      if (typeof window !== "undefined") {
        if (franchise && shouldShowFranchiseFilter) {
          try {
            const dataToStore = {
              franchise,
              brand: effectiveBrand,
              timestamp: Date.now(),
            };
            storage.setJSON(FRANCHISE_STORAGE_KEY, dataToStore);
          } catch (error) {
            console.error(
              "Error saving franchise filter to sessionStorage:",
              error,
            );
          }
        } else {
          storage.removeItem(FRANCHISE_STORAGE_KEY);
        }

        // Dispatch custom event to notify other components
        const event = new CustomEvent(FRANCHISE_CHANGE_EVENT, {
          detail: { franchise, brand: effectiveBrand },
        });
        window.dispatchEvent(event);
      }
    },
    [shouldShowFranchiseFilter, effectiveBrand],
  );

  // Clear franchise filter
  const clearFranchiseFilter = useCallback(() => {
    setSelectedFranchise(null);
  }, [setSelectedFranchise]);

  // Get display name for a franchise
  const getFranchiseDisplayName = useCallback(
    (franchiseName: string): string => {
      const franchise = ZENITH_FRANCHISES.find((f) => f.name === franchiseName);
      return franchise?.displayName || franchiseName;
    },
    [],
  );

  return {
    selectedFranchise: shouldShowFranchiseFilter ? selectedFranchise : null,
    setSelectedFranchise,
    availableFranchises: ZENITH_FRANCHISES,
    isZenithBrand,
    shouldShowFranchiseFilter,
    clearFranchiseFilter,
    getFranchiseDisplayName,
  };
}
