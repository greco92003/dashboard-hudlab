"use client";

import { useState, useEffect, useCallback } from "react";
import { DateRange } from "react-day-picker";
import { storage } from "@/lib/storage";

// Global storage key for shared date range
const GLOBAL_DATE_RANGE_KEY = "globalDateRange";
const GLOBAL_PERIOD_KEY = "globalPeriod";
const GLOBAL_USE_CUSTOM_PERIOD_KEY = "globalUseCustomPeriod";

// Utility functions for date handling
const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateString: string): Date => {
  // Parse YYYY-MM-DD format without timezone conversion
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
};

interface UseGlobalDateRangeReturn {
  dateRange: DateRange | undefined;
  period: number;
  useCustomPeriod: boolean;
  isHydrated: boolean;
  setDateRange: (range: DateRange | undefined) => void;
  setPeriod: (period: number) => void;
  setUseCustomPeriod: (useCustom: boolean) => void;
  handleDateRangeChange: (newDateRange: DateRange | undefined) => void;
  handlePeriodChange: (newPeriod: number) => void;
  getApiUrl: (baseUrl: string) => string;
  clearGlobalDateState: () => void;
}

/**
 * Hook para gerenciar o estado global da data entre todas as páginas
 * Sincroniza automaticamente entre dashboard, deals e pairs-sold
 */
export function useGlobalDateRange(): UseGlobalDateRangeReturn {
  const [dateRange, setDateRangeState] = useState<DateRange | undefined>();
  const [period, setPeriodState] = useState(30);
  const [useCustomPeriod, setUseCustomPeriodState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load initial state from localStorage after hydration
  useEffect(() => {
    // Mark as hydrated first to prevent hydration mismatch
    setIsHydrated(true);

    const savedDateRange = storage.getItem(GLOBAL_DATE_RANGE_KEY);
    const savedPeriod = storage.getItem(GLOBAL_PERIOD_KEY);
    const savedUseCustomPeriod = storage.getItem(
      GLOBAL_USE_CUSTOM_PERIOD_KEY,
    );

    if (savedDateRange) {
      try {
        const parsedRange = JSON.parse(savedDateRange);
        console.log("📅 Loading date range from localStorage:", parsedRange);
        const dateRange = {
          from: parsedRange.from ? parseLocalDate(parsedRange.from) : undefined,
          to: parsedRange.to ? parseLocalDate(parsedRange.to) : undefined,
        };
        console.log("📅 Parsed date range:", {
          from: dateRange.from?.toISOString(),
          to: dateRange.to?.toISOString(),
        });
        setDateRangeState(dateRange);
      } catch (error) {
        console.error("Error parsing saved date range:", error);
        storage.removeItem(GLOBAL_DATE_RANGE_KEY);
      }
    }

    if (savedPeriod) {
      setPeriodState(parseInt(savedPeriod));
    }

    if (savedUseCustomPeriod) {
      setUseCustomPeriodState(savedUseCustomPeriod === "true");
    }
  }, []);

  // Listen for localStorage changes from other tabs/pages
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === GLOBAL_DATE_RANGE_KEY && e.newValue) {
        try {
          const parsedRange = JSON.parse(e.newValue);
          const dateRange = {
            from: parsedRange.from
              ? parseLocalDate(parsedRange.from)
              : undefined,
            to: parsedRange.to ? parseLocalDate(parsedRange.to) : undefined,
          };
          setDateRangeState(dateRange);
        } catch (error) {
          console.error("Error parsing date range from storage event:", error);
        }
      }

      if (e.key === GLOBAL_PERIOD_KEY && e.newValue) {
        setPeriodState(parseInt(e.newValue));
      }

      if (e.key === GLOBAL_USE_CUSTOM_PERIOD_KEY && e.newValue) {
        setUseCustomPeriodState(e.newValue === "true");
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Set date range and sync to localStorage
  const setDateRange = useCallback((range: DateRange | undefined) => {
    setDateRangeState(range);
    if (range) {
      // Save dates as YYYY-MM-DD strings to avoid timezone issues
      const serializedRange = {
        from: range.from ? formatDateToLocal(range.from) : undefined,
        to: range.to ? formatDateToLocal(range.to) : undefined,
      };
      console.log("💾 Saving date range to localStorage:", serializedRange);
      storage.setItem(
        GLOBAL_DATE_RANGE_KEY,
        JSON.stringify(serializedRange),
      );
    } else {
      storage.removeItem(GLOBAL_DATE_RANGE_KEY);
    }
  }, []);

  // Set period and sync to localStorage
  const setPeriod = useCallback((newPeriod: number) => {
    setPeriodState(newPeriod);
    storage.setItem(GLOBAL_PERIOD_KEY, newPeriod.toString());
  }, []);

  // Set use custom period and sync to localStorage
  const setUseCustomPeriod = useCallback((useCustom: boolean) => {
    setUseCustomPeriodState(useCustom);
    storage.setItem(GLOBAL_USE_CUSTOM_PERIOD_KEY, useCustom.toString());
  }, []);

  // Handle date range change
  const handleDateRangeChange = useCallback(
    (newDateRange: DateRange | undefined) => {
      console.log("Global: Date range changed:", {
        newDateRange,
        fromFormatted: newDateRange?.from
          ? formatDateToLocal(newDateRange.from)
          : null,
        toFormatted: newDateRange?.to
          ? formatDateToLocal(newDateRange.to)
          : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setDateRange(newDateRange);
      if (newDateRange?.from && newDateRange?.to) {
        setUseCustomPeriod(true);
        // Clear period-based storage from individual pages
        storage.removeItem("dashboardPeriod");
        storage.removeItem("dealsPeriod");
        storage.removeItem("pairsSoldPeriod");
        // Clear individual page date ranges
        storage.removeItem("dashboardDateRange");
        storage.removeItem("dealsDateRange");
        storage.removeItem("pairsSoldDateRange");
      }
    },
    [setDateRange, setUseCustomPeriod],
  );

  // Handle period change
  const handlePeriodChange = useCallback(
    (newPeriod: number) => {
      setPeriod(newPeriod);
      setUseCustomPeriod(false);
      setDateRange(undefined);
      // Clear individual page storage
      storage.removeItem("dashboardDateRange");
      storage.removeItem("dealsDateRange");
      storage.removeItem("pairsSoldDateRange");
      storage.removeItem("dashboardPeriod");
      storage.removeItem("dealsPeriod");
      storage.removeItem("pairsSoldPeriod");
    },
    [setPeriod, setUseCustomPeriod, setDateRange],
  );

  // Get API URL based on current state
  const getApiUrl = useCallback(
    (baseUrl: string): string => {
      if (useCustomPeriod && dateRange?.from && dateRange?.to) {
        const startDate = formatDateToLocal(dateRange.from);
        const endDate = formatDateToLocal(dateRange.to);
        return `${baseUrl}?startDate=${startDate}&endDate=${endDate}`;
      } else {
        return `${baseUrl}?period=${period}`;
      }
    },
    [useCustomPeriod, dateRange, period],
  );

  // Clear all global date state
  const clearGlobalDateState = useCallback(() => {
    setDateRange(undefined);
    setPeriod(30);
    setUseCustomPeriod(false);
    storage.removeItem(GLOBAL_DATE_RANGE_KEY);
    storage.removeItem(GLOBAL_PERIOD_KEY);
    storage.removeItem(GLOBAL_USE_CUSTOM_PERIOD_KEY);
    // Also clear individual page storage
    storage.removeItem("dashboardDateRange");
    storage.removeItem("dealsDateRange");
    storage.removeItem("pairsSoldDateRange");
    storage.removeItem("dashboardPeriod");
    storage.removeItem("dealsPeriod");
    storage.removeItem("pairsSoldPeriod");
  }, [setDateRange, setPeriod, setUseCustomPeriod]);

  return {
    dateRange,
    period,
    useCustomPeriod,
    isHydrated,
    setDateRange,
    setPeriod,
    setUseCustomPeriod,
    handleDateRangeChange,
    handlePeriodChange,
    getApiUrl,
    clearGlobalDateState,
  };
}
