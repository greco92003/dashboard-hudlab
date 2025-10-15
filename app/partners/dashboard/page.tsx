"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { ChartAreaGradient } from "@/components/ui/chart-area-gradient";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";
import { Label } from "@/components/ui/label";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { useFranchiseFilter } from "@/hooks/useFranchiseFilter";
import {
  isZenithProduct,
  calculateFranchiseRevenue,
  NuvemshopOrder as FranchiseNuvemshopOrder,
} from "@/types/franchise";
import { RefreshCw, Settings, Package, Tag, BarChart3 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PartnersGlobalHeader } from "@/components/PartnersGlobalHeader";
import { FranchiseSelector } from "@/components/FranchiseSelector";
import { useNuvemshopSync } from "@/hooks/useNuvemshopSync";

import { toast } from "sonner";

import { ChartPieEstadosNuvemshop } from "@/components/ui/chart-pie-estados-nuvemshop";
import { TopProductCard } from "@/components/ui/top-product-card";

interface NuvemshopOrder extends FranchiseNuvemshopOrder {
  id: string;
  order_number: string | null;
  total: number | null;
  shipping_cost_customer: number | null;
  province: string | null;
}

interface ChartDataPoint {
  date: string;
  revenue: number;
}

interface CommissionSettings {
  percentage: number;
  updated_by: string;
  updated_at: string;
}

interface Brand {
  brand: string;
  product_count: number;
}

function PartnersDashboardPage() {
  const router = useRouter();

  // Initialize with empty state to prevent glitch
  const [orders, setOrders] = useState<NuvemshopOrder[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);
  const [commissionPercentage, setCommissionPercentage] = useState(5); // Default 5%
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [showCommissionSettings, setShowCommissionSettings] = useState(false);
  const [newCommissionPercentage, setNewCommissionPercentage] = useState(5);

  const [lastUpdateCheck, setLastUpdateCheck] = useState<string | null>(null);
  const isInitialLoad = useRef(true);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Brand selection state
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [selectedBrand, setSelectedBrandState] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hooks - moved to top to avoid hoisting issues
  const { isOwnerOrAdmin, isPartnersMedia } = usePermissions();
  const {
    assignedBrand,
    isPartnersMediaWithBrand,
    shouldFilterByBrand,
    loading: brandFilterLoading,
  } = useBrandFilter();
  const { selectedFranchise, shouldShowFranchiseFilter } =
    useFranchiseFilter(selectedBrand);
  const { isSyncing, syncFull } = useNuvemshopSync();
  const {
    period,
    dateRange,
    useCustomPeriod,
    handleDateRangeChange,
    handlePeriodChange,
  } = useGlobalDateRange();

  // Use selected brand for API calls if available, otherwise fall back to assigned brand
  const effectiveBrand = selectedBrand || assignedBrand;

  // Check permissions
  const canUseBrandFilter = isOwnerOrAdmin;
  // For owners/admins: only show data if a brand is selected (not null)
  // For partners-media: only show data if they have an assigned brand
  const shouldShowData = canUseBrandFilter
    ? !!selectedBrand
    : isPartnersMediaWithBrand;

  // Determine if we're still loading initial state
  // Show loading until we have hydrated the brand selection and permissions are loaded
  const isInitialLoading =
    !isHydrated || brandFilterLoading || (loading && isInitialLoad.current);

  // Brand selection functions
  const setSelectedBrand = useCallback(
    (brand: string | null) => {
      if (!canUseBrandFilter) return;

      setSelectedBrandState(brand);

      try {
        if (brand) {
          localStorage.setItem("hudlab_partners_brand_filter", brand);
        } else {
          localStorage.removeItem("hudlab_partners_brand_filter");
        }
      } catch (error) {
        console.warn("Error saving brand selection to localStorage:", error);
      }

      // Refresh the page to hydrate with new brand data
      router.refresh();
    },
    [canUseBrandFilter, router]
  );

  // Load brands from API
  const fetchBrands = useCallback(async () => {
    if (!canUseBrandFilter) return;

    try {
      setBrandsLoading(true);
      const response = await fetch("/api/brands");

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setBrands(data.brands || []);
    } catch (error) {
      console.error("Error fetching brands:", error);
      toast.error("Erro ao carregar marcas");
    } finally {
      setBrandsLoading(false);
    }
  }, [canUseBrandFilter]);

  // Load selected brand from localStorage on mount
  useEffect(() => {
    if (!canUseBrandFilter) {
      setSelectedBrandState(null);
      setIsHydrated(true);
      return;
    }

    try {
      const saved = localStorage.getItem("hudlab_partners_brand_filter");
      if (saved) {
        setSelectedBrandState(saved);
      }
    } catch (error) {
      console.warn("Error loading brand selection from localStorage:", error);
    } finally {
      setIsHydrated(true);
    }
  }, [canUseBrandFilter]);

  // Load brands on mount
  useEffect(() => {
    if (canUseBrandFilter) {
      fetchBrands();
    }
  }, [canUseBrandFilter, fetchBrands]);

  // Clear data when brand changes
  const clearDataForBrandChange = useCallback(() => {
    setOrders([]);
    setTotalSales(0);
    setTotalCommission(0);
    setChartData([]);
  }, []);

  // Clear data immediately when brand filter becomes available but no brand is selected
  useEffect(() => {
    if (isOwnerOrAdmin && !effectiveBrand && !isInitialLoad.current) {
      clearDataForBrandChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnerOrAdmin, effectiveBrand]); // Remove clearDataForBrandChange to prevent infinite loop

  // Function to calculate real revenue (subtotal - discounts, without shipping)
  // For Zenith with franchise filter, calculates only revenue from franchise products
  const calculateRealRevenue = useCallback(
    (order: NuvemshopOrder): number => {
      // For Zenith brand with franchise filter, use franchise-specific revenue calculation
      if (
        selectedFranchise &&
        effectiveBrand &&
        isZenithProduct(effectiveBrand)
      ) {
        return calculateFranchiseRevenue(order, selectedFranchise);
      }

      // Standard revenue calculation for other brands
      const subtotal =
        typeof order.subtotal === "string"
          ? parseFloat(order.subtotal)
          : order.subtotal || 0;

      const promotionalDiscount =
        typeof order.promotional_discount === "string"
          ? parseFloat(order.promotional_discount)
          : order.promotional_discount || 0;

      const discountCoupon =
        typeof order.discount_coupon === "string"
          ? parseFloat(order.discount_coupon)
          : order.discount_coupon || 0;

      const discountGateway =
        typeof order.discount_gateway === "string"
          ? parseFloat(order.discount_gateway)
          : order.discount_gateway || 0;

      // Calculate: subtotal - all discounts (without shipping)
      const realRevenue =
        subtotal - promotionalDiscount - discountCoupon - discountGateway;

      return isNaN(realRevenue) ? 0 : Math.max(0, realRevenue); // Ensure non-negative
    },
    [selectedFranchise, effectiveBrand]
  );

  // Format date to local timezone for API calls
  const formatDateToLocal = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);

  // Generate date range for chart data
  const generateDateRange = useCallback(
    (startDate: Date, endDate: Date): string[] => {
      const dates: string[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        dates.push(formatDateToLocal(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return dates;
    },
    [formatDateToLocal]
  );

  // Prepare chart data for period-based filtering
  const prepareChartData = useCallback(
    (orders: NuvemshopOrder[], days: number) => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days + 1);

      const allDates = generateDateRange(startDate, endDate);

      // Group orders by date
      const groupedByDate: Record<string, number> = {};

      orders.forEach((order) => {
        // Use completed_at if available, otherwise use created_at_nuvemshop
        const orderDateStr = order.completed_at || order.created_at_nuvemshop;
        if (orderDateStr) {
          const orderDate = new Date(orderDateStr);
          const dateKey = formatDateToLocal(orderDate);

          if (!groupedByDate[dateKey]) {
            groupedByDate[dateKey] = 0;
          }

          // Use real revenue calculation (subtotal - discounts, without shipping)
          const realRevenue = calculateRealRevenue(order);
          groupedByDate[dateKey] += realRevenue;
        }
      });

      // Create chart data with zero values for missing dates
      const chartData = allDates.map((date) => ({
        date,
        revenue: groupedByDate[date] || 0,
      }));

      setChartData(chartData);
    },
    [generateDateRange, formatDateToLocal, calculateRealRevenue]
  );

  // Prepare chart data for custom date range
  const prepareChartDataCustom = useCallback(
    (orders: NuvemshopOrder[], customDateRange: DateRange) => {
      if (!customDateRange.from || !customDateRange.to) return;

      const allDates = generateDateRange(
        customDateRange.from,
        customDateRange.to
      );

      // Group orders by date
      const groupedByDate: Record<string, number> = {};

      orders.forEach((order) => {
        // Use completed_at if available, otherwise use created_at_nuvemshop
        const orderDateStr = order.completed_at || order.created_at_nuvemshop;
        if (orderDateStr) {
          const orderDate = new Date(orderDateStr);
          const dateKey = formatDateToLocal(orderDate);

          if (!groupedByDate[dateKey]) {
            groupedByDate[dateKey] = 0;
          }

          // Use real revenue calculation (subtotal - discounts, without shipping)
          const realRevenue = calculateRealRevenue(order);
          groupedByDate[dateKey] += realRevenue;
        }
      });

      // Create chart data with zero values for missing dates
      const chartData = allDates.map((date) => ({
        date,
        revenue: groupedByDate[date] || 0,
      }));

      setChartData(chartData);
    },
    [generateDateRange, formatDateToLocal, calculateRealRevenue]
  );

  // Debounced fetch function
  const debouncedFetchOrders = useCallback(
    (periodDays?: number, customDateRange?: DateRange) => {
      // Clear any existing timeout
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }

      // Set a new timeout
      fetchTimeoutRef.current = setTimeout(async () => {
        try {
          setLoading(true);
          setIsDataLoading(true);

          let url = "/api/partners/orders";
          const params = new URLSearchParams();

          if (customDateRange?.from && customDateRange?.to) {
            params.append(
              "start_date",
              formatDateToLocal(customDateRange.from)
            );
            params.append("end_date", formatDateToLocal(customDateRange.to));
          } else if (periodDays) {
            params.append("period", periodDays.toString());
          }

          // Add brand filter for owners/admins or partners-media with assigned brand
          if (effectiveBrand) {
            params.append("brand", effectiveBrand);
          }

          // Add cache buster to prevent caching
          params.append("_t", Date.now().toString());

          if (params.toString()) {
            url += `?${params.toString()}`;
          }

          const response = await fetch(url, {
            cache: "no-store", // Disable caching
          });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          if (data.orders) {
            setOrders(data.orders);

            // Use totalRevenue from API summary (already calculated with franchise-aware logic)
            // This ensures consistency between API and frontend calculations
            const total = data.summary?.totalRevenue || 0;

            setTotalSales(total);
            setTotalCommission((total * commissionPercentage) / 100);

            // Prepare chart data
            if (customDateRange?.from && customDateRange?.to) {
              prepareChartDataCustom(data.orders, customDateRange);
            } else if (periodDays) {
              prepareChartData(data.orders, periodDays);
            }
          } else {
            setOrders([]);
            setTotalSales(0);
            setTotalCommission(0);
            setChartData([]);
          }
        } catch (error) {
          console.error("Error fetching orders:", error);
          setOrders([]);
          setTotalSales(0);
          setTotalCommission(0);
          setChartData([]);
        } finally {
          setLoading(false);
          setIsDataLoading(false);
        }
      }, 300); // 300ms debounce
    },
    [
      formatDateToLocal,
      effectiveBrand,
      calculateRealRevenue,
      commissionPercentage,
      prepareChartDataCustom,
      prepareChartData,
    ]
  );

  // Fetch orders data
  const fetchOrders = useCallback(
    async (periodDays?: number, customDateRange?: DateRange) => {
      try {
        setLoading(true);
        setIsDataLoading(true);

        let url = "/api/partners/orders";
        const params = new URLSearchParams();

        if (customDateRange?.from && customDateRange?.to) {
          params.append("start_date", formatDateToLocal(customDateRange.from));
          params.append("end_date", formatDateToLocal(customDateRange.to));
        } else if (periodDays) {
          params.append("period", periodDays.toString());
        }

        // Add brand filter for owners/admins or partners-media with assigned brand
        if (effectiveBrand) {
          params.append("brand", effectiveBrand);
        }

        // Add franchise filter for Zenith brand
        if (selectedFranchise) {
          params.append("franchise", selectedFranchise);
        }

        // Add cache buster to prevent caching
        params.append("_t", Date.now().toString());

        if (params.toString()) {
          url += `?${params.toString()}`;
        }

        const response = await fetch(url, {
          cache: "no-store", // Disable caching
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.orders) {
          setOrders(data.orders);

          // Use totalRevenue from API summary (already calculated with franchise-aware logic)
          // This ensures consistency between API and frontend calculations
          const total = data.summary?.totalRevenue || 0;

          setTotalSales(total);
          setTotalCommission((total * commissionPercentage) / 100);

          // Prepare chart data
          if (customDateRange?.from && customDateRange?.to) {
            prepareChartDataCustom(data.orders, customDateRange);
          } else if (periodDays) {
            prepareChartData(data.orders, periodDays);
          }
        } else {
          setOrders([]);
          setTotalSales(0);
          setTotalCommission(0);
          setChartData([]);
        }
      } catch (error) {
        console.error("Error fetching orders:", error);
        setOrders([]);
        setTotalSales(0);
        setTotalCommission(0);
        setChartData([]);
      } finally {
        setLoading(false);
        setIsDataLoading(false);
      }
    },
    [
      prepareChartData,
      prepareChartDataCustom,
      formatDateToLocal,
      commissionPercentage,
      effectiveBrand,
      selectedFranchise,
      calculateRealRevenue,
    ]
  );

  // Function to check for recent updates
  const checkForUpdates = useCallback(async () => {
    if (!isOwnerOrAdmin && !isPartnersMediaWithBrand) return;

    try {
      const response = await fetch("/api/nuvemshop-sync/last-update", {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        const latestUpdate = data.last_update;

        if (lastUpdateCheck && latestUpdate && latestUpdate > lastUpdateCheck) {
          // There's a newer update, refresh the data
          console.log("🔄 Detected data updates, refreshing dashboard...");
          if (useCustomPeriod && dateRange?.from && dateRange?.to) {
            fetchOrders(undefined, dateRange);
          } else {
            fetchOrders(period);
          }
        }

        setLastUpdateCheck(latestUpdate);
      }
    } catch (error) {
      console.error("Error checking for updates:", error);
    }
  }, [
    isOwnerOrAdmin,
    isPartnersMediaWithBrand,
    lastUpdateCheck,
    fetchOrders,
    useCustomPeriod,
    dateRange,
    period,
  ]);

  // Handle period change
  const handlePeriodChangeLocal = async (newPeriod: number) => {
    handlePeriodChange(newPeriod);
    await fetchOrders(newPeriod);
  };

  // Handle date range change
  const handleDateRangeChangeLocal = async (
    newDateRange: DateRange | undefined
  ) => {
    handleDateRangeChange(newDateRange);
    if (newDateRange?.from && newDateRange?.to) {
      await fetchOrders(undefined, newDateRange);
    }
  };

  // Update commission percentage
  const updateCommissionPercentage = async () => {
    if (!isOwnerOrAdmin || !effectiveBrand) return;

    try {
      setCommissionLoading(true);
      const response = await fetch("/api/partners/commission-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          percentage: newCommissionPercentage,
          brand: effectiveBrand,
        }),
      });

      if (response.ok) {
        setCommissionPercentage(newCommissionPercentage);
        setTotalCommission((totalSales * newCommissionPercentage) / 100);
        setShowCommissionSettings(false);
        toast.success(
          `Comissão atualizada para ${effectiveBrand}: ${newCommissionPercentage}%`
        );
      } else {
        const errorData = await response.json();
        toast.error(`Erro ao atualizar comissão: ${errorData.error}`);
      }
    } catch (error) {
      console.error("Error updating commission percentage:", error);
      toast.error("Erro ao atualizar comissão");
    } finally {
      setCommissionLoading(false);
    }
  };

  // Fetch commission settings (stable function)
  const fetchCommissionSettingsStable = useCallback(async (brand?: string) => {
    try {
      let url = "/api/partners/commission-settings";
      if (brand) {
        url += `?brand=${encodeURIComponent(brand)}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setCommissionPercentage(data.percentage || 5);
        setNewCommissionPercentage(data.percentage || 5);
      }
    } catch (error) {
      console.error("Error fetching commission settings:", error);
    }
  }, []);

  // Initial data fetch and brand change handler
  useEffect(() => {
    const initializeData = async () => {
      // Wait for brand filter to be hydrated before making API calls
      if (!isHydrated) {
        return;
      }

      // Only fetch data if we should show data
      if (!shouldShowData) {
        // Clear data when user doesn't have permission (owners/admins without selected brand)
        setOrders([]);
        setTotalSales(0);
        setTotalCommission(0);
        setChartData([]);
        setLoading(false);
        return;
      }

      // Fetch commission settings for the effective brand
      if (effectiveBrand) {
        await fetchCommissionSettingsStable(effectiveBrand);
      }

      // Show toast notification when brand changes (only for owners/admins and not on initial load)
      if (isOwnerOrAdmin && !isInitialLoad.current) {
        if (effectiveBrand) {
          toast.info(`Carregando dados para a marca: ${effectiveBrand}`);
        } else {
          toast.info("Carregando dados de todas as marcas");
        }
      }

      // Fetch orders data (debounced to avoid multiple rapid calls)
      if (useCustomPeriod && dateRange?.from && dateRange?.to) {
        debouncedFetchOrders(undefined, dateRange);
      } else {
        debouncedFetchOrders(period, undefined);
      }

      // Mark that initial load is complete
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
      }
    };

    initializeData();

    // Cleanup function
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    period,
    useCustomPeriod,
    dateRange,
    effectiveBrand, // Re-fetch when effective brand changes
    selectedBrand, // Track selected brand changes
    assignedBrand, // Track assigned brand changes
    isOwnerOrAdmin,
    shouldShowData,
    isHydrated,
    fetchCommissionSettingsStable,

    // Remove debouncedFetchOrders and clearDataForBrandChange to prevent infinite loop
  ]);

  // Reset form states when brand changes
  useEffect(() => {
    if (isHydrated) {
      setShowCommissionSettings(false);
      setNewCommissionPercentage(commissionPercentage);
    }
  }, [selectedBrand, isHydrated, commissionPercentage]);

  // Reload data when franchise changes for Zenith brand
  useEffect(() => {
    if (!isHydrated || !effectiveBrand || !shouldShowFranchiseFilter) return;

    console.log(
      "[Franchise Change] Reloading dashboard data for franchise:",
      selectedFranchise
    );

    // Reload orders with current period/date range
    if (useCustomPeriod && dateRange?.from && dateRange?.to) {
      fetchOrders(undefined, dateRange);
    } else {
      fetchOrders(period);
    }
  }, [
    selectedFranchise,
    isHydrated,
    effectiveBrand,
    shouldShowFranchiseFilter,
    fetchOrders,
    useCustomPeriod,
    dateRange,
    period,
  ]);

  // Set up polling for updates every 10 seconds
  useEffect(() => {
    if (!isOwnerOrAdmin && !isPartnersMediaWithBrand) return;

    // Initial check
    checkForUpdates();

    // Set up interval for periodic checks
    const interval = setInterval(() => {
      checkForUpdates();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [isOwnerOrAdmin, isPartnersMediaWithBrand, checkForUpdates]);

  // Update commission when percentage changes
  useEffect(() => {
    setTotalCommission((totalSales * commissionPercentage) / 100);
  }, [totalSales, commissionPercentage]);

  // Handle sync button click
  const handleSync = async () => {
    if (!isOwnerOrAdmin) {
      toast.error("Você não tem permissão para sincronizar dados");
      return;
    }

    toast.info("Iniciando sincronização completa da Nuvemshop...");
    const result = await syncFull({
      ordersLimit: 100,
      productsLimit: 100,
      ordersPages: 1,
      productsPages: 1,
    });

    if (result.success) {
      // Refresh data after successful sync
      if (useCustomPeriod && dateRange?.from && dateRange?.to) {
        await fetchOrders(undefined, dateRange);
      } else {
        await fetchOrders(period);
      }
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
        <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8" />
        Dashboard de Parceiros
        {loading && (
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </h1>

      {/* Controls Section */}
      {!isInitialLoading && (
        <div className="flex flex-col gap-4 mb-4">
          {/* Brand Selection for Owners/Admins */}
          {canUseBrandFilter && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <Label className="text-sm sm:text-base whitespace-nowrap">
                Selecione uma marca:
              </Label>
              <div className="flex items-center gap-2 w-full sm:max-w-xs">
                {brandsLoading ? (
                  <Skeleton className="h-9 flex-1" />
                ) : (
                  <Select
                    value={selectedBrand || "none"}
                    onValueChange={(value) =>
                      setSelectedBrand(value === "none" ? null : value)
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione uma marca" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <div className="flex items-center gap-2">
                          <Tag className="h-3 w-3" />
                          Nenhuma Marca
                        </div>
                      </SelectItem>
                      {brands.map((brand) => (
                        <SelectItem key={brand.brand} value={brand.brand}>
                          <div className="flex items-center gap-2">
                            <Tag className="h-3 w-3" />
                            {brand.brand}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchBrands}
                  disabled={brandsLoading}
                  title="Atualizar lista de marcas"
                  className="shrink-0"
                >
                  {brandsLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {/* Selected Brand Display */}
              {selectedBrand && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {selectedBrand}
                </Badge>
              )}
            </div>
          )}

          {/* Franchise Selection for Zenith brand */}
          {shouldShowFranchiseFilter && isHydrated && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <FranchiseSelector
                className="w-full sm:max-w-xs"
                selectedBrand={effectiveBrand}
              />
            </div>
          )}

          {/* Partners-media brand badge */}
          {isPartnersMediaWithBrand && assignedBrand && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                Marca: {assignedBrand}
              </Badge>
            </div>
          )}

          {/* Sync Button and Period Controls Row */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Period Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
                {[7, 15, 30, 60, 90].map((days) => (
                  <Button
                    key={days}
                    variant={
                      period === days && !useCustomPeriod
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => handlePeriodChangeLocal(days)}
                    className="text-xs sm:text-sm"
                  >
                    {days} dias
                  </Button>
                ))}
              </div>
            </div>

            {/* Calendar and Sync Button */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <Label className="text-sm sm:text-base whitespace-nowrap">
                Período personalizado:
              </Label>
              <div className="flex items-center gap-2">
                <div className="w-full sm:min-w-[250px] sm:w-auto">
                  <Calendar23
                    value={dateRange}
                    onChange={handleDateRangeChangeLocal}
                    hideLabel
                  />
                </div>
                {/* Sync Button */}
                {isOwnerOrAdmin && (
                  <Button
                    onClick={handleSync}
                    disabled={isSyncing}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 shrink-0"
                  >
                    {isSyncing ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {isSyncing ? "Sincronizando..." : "Sincronizar"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isInitialLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="text-6xl">⏳</div>
            <h3 className="text-xl font-semibold text-muted-foreground">
              Carregando dashboard...
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Aguarde enquanto carregamos as informações do dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Message when no brand is selected for owners/admins */}
      {!isInitialLoading && !shouldShowData && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="text-6xl">🏷️</div>
            <h3 className="text-xl font-semibold text-muted-foreground">
              Selecione uma marca para visualizar os dados
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Como owner/admin, você precisa escolher uma marca específica para
              filtrar as informações do dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Message when Zenith brand is selected but no franchise is chosen */}
      {!isInitialLoading &&
        shouldShowData &&
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        !selectedFranchise && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <div className="text-6xl">🏪</div>
              <h3 className="text-xl font-semibold text-muted-foreground">
                Selecione uma franquia para ver os dados do dashboard
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                A marca Zenith possui múltiplas franquias. Escolha uma franquia
                específica para visualizar as métricas e dados de vendas.
              </p>
            </div>
          </div>
        )}

      {/* Main Content */}
      {!isInitialLoading &&
        shouldShowData &&
        (!effectiveBrand ||
          !isZenithProduct(effectiveBrand) ||
          selectedFranchise) && (
          <>
            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {/* Total Sales */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm sm:text-base">
                    Faturamento Real
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {loading ? (
                    <Skeleton className="h-6 sm:h-8 w-[150px] sm:w-[200px]" />
                  ) : (
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold">
                      {formatCurrency(totalSales, "BRL")}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Total Commission */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm sm:text-base">
                    Valor Total de Comissão ({commissionPercentage}%)
                    {effectiveBrand && (
                      <div className="text-xs text-muted-foreground font-normal mt-1 flex items-center gap-2 flex-wrap">
                        <span>Marca: {effectiveBrand}</span>
                        {selectedFranchise &&
                          isZenithProduct(effectiveBrand) && (
                            <Badge variant="outline" className="text-xs">
                              🏪 {selectedFranchise}
                            </Badge>
                          )}
                      </div>
                    )}
                  </CardTitle>
                  {isOwnerOrAdmin && effectiveBrand && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowCommissionSettings(!showCommissionSettings)
                      }
                      title={`Configurar comissão para ${effectiveBrand}`}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  {loading ? (
                    <Skeleton className="h-6 sm:h-8 w-[150px] sm:w-[200px]" />
                  ) : (
                    <p className="text-lg sm:text-xl lg:text-2xl font-bold">
                      {formatCurrency(totalCommission, "BRL")}
                    </p>
                  )}

                  {/* Commission Settings */}
                  {showCommissionSettings &&
                    isOwnerOrAdmin &&
                    effectiveBrand && (
                      <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                        <div className="mb-3">
                          <h4 className="text-sm font-medium">
                            Configuração de Comissão - {effectiveBrand}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Esta configuração é específica para a marca
                            selecionada
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <Label htmlFor="commission-percentage">
                            Porcentagem de Comissão:
                          </Label>
                          <input
                            id="commission-percentage"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={newCommissionPercentage}
                            onChange={(e) =>
                              setNewCommissionPercentage(
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-20 px-2 py-1 border rounded text-sm"
                          />
                          <span>%</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={updateCommissionPercentage}
                            disabled={commissionLoading}
                          >
                            {commissionLoading ? "Salvando..." : "Salvar"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setShowCommissionSettings(false);
                              setNewCommissionPercentage(commissionPercentage);
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {/* Sales Chart */}
              <div className="w-full">
                {loading ? (
                  <Skeleton className="h-[400px] w-full" />
                ) : (
                  <ChartAreaGradient
                    title="Vendas por Período"
                    description={
                      useCustomPeriod && dateRange?.from && dateRange?.to
                        ? `Vendas de ${dateRange.from.toLocaleDateString(
                            "pt-BR"
                          )} até ${dateRange.to.toLocaleDateString("pt-BR")}`
                        : `Vendas nos últimos ${period} dias`
                    }
                    data={chartData}
                    period={period}
                  />
                )}
              </div>

              {/* States Chart */}
              <div className="w-full">
                <ChartPieEstadosNuvemshop orders={orders} loading={loading} />
              </div>
            </div>

            {/* Most Sold Product */}
            <div className="w-full">
              <TopProductCard
                period={period}
                dateRange={dateRange}
                useCustomPeriod={useCustomPeriod}
                selectedBrand={effectiveBrand}
                orders={orders}
              />
            </div>
          </>
        )}
    </div>
  );
}

export default function PartnersDashboardPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />

            {/* Loading skeleton for dashboard metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent className="pt-0">
                  <Skeleton className="h-8 w-40" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent className="pt-0">
                  <Skeleton className="h-8 w-40" />
                </CardContent>
              </Card>
            </div>

            {/* Loading skeleton for charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="flex-1">
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-[300px] w-full" />
                </CardContent>
              </Card>
              <Card className="flex-1">
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-[300px] w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      }
    >
      <PartnersDashboardPage />
    </Suspense>
  );
}
