import { useState, useEffect, useCallback } from "react";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import {
  ZENITH_FRANCHISES,
  isZenithProduct,
  type Franchise,
} from "@/types/franchise";

const FRANCHISE_STORAGE_KEY = "zenith-franchise-filter";

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
  selectedBrand?: string | null
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

  // Load franchise from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined" && shouldShowFranchiseFilter) {
      try {
        const stored = localStorage.getItem(FRANCHISE_STORAGE_KEY);
        if (stored) {
          const parsedData = JSON.parse(stored);
          // Validate that the stored franchise is still valid
          const isValidFranchise = ZENITH_FRANCHISES.some(
            (f) => f.name === parsedData.franchise
          );
          if (isValidFranchise && parsedData.brand === effectiveBrand) {
            setSelectedFranchiseState(parsedData.franchise);
          } else {
            // Clear invalid data
            localStorage.removeItem(FRANCHISE_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error(
          "Error loading franchise filter from localStorage:",
          error
        );
        localStorage.removeItem(FRANCHISE_STORAGE_KEY);
      }
    }
  }, [shouldShowFranchiseFilter, effectiveBrand]);

  // Clear franchise filter when brand changes away from Zenith
  useEffect(() => {
    if (!shouldShowFranchiseFilter && selectedFranchise) {
      setSelectedFranchiseState(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem(FRANCHISE_STORAGE_KEY);
      }
    }
  }, [shouldShowFranchiseFilter, selectedFranchise]);

  // Set franchise and save to localStorage
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
            localStorage.setItem(
              FRANCHISE_STORAGE_KEY,
              JSON.stringify(dataToStore)
            );
          } catch (error) {
            console.error(
              "Error saving franchise filter to localStorage:",
              error
            );
          }
        } else {
          localStorage.removeItem(FRANCHISE_STORAGE_KEY);
        }
      }
    },
    [shouldShowFranchiseFilter, effectiveBrand]
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
    []
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
