"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { useFranchiseFilter } from "@/hooks/useFranchiseFilter";
import { isZenithProduct } from "@/types/franchise";
import { useNuvemshopSync } from "@/hooks/useNuvemshopSync";
import { useGlobalDateRange } from "@/hooks/useGlobalDateRange";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Calendar23 from "@/components/calendar-23";
import { DateRange } from "react-day-picker";
import {
  RefreshCw,
  ShoppingCart,
  MapPin,
  User,
  Package,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { FranchiseSelector } from "@/components/FranchiseSelector";
import { storage } from "@/lib/storage";

interface OrderProduct {
  name: string;
  price: string;
  quantity: number;
}

interface PaymentDetails {
  method?: string | null;
  credit_card_company?: string | null;
  installments?: number;
}

interface Order {
  id: string;
  order_id: string;
  order_number?: string;
  completed_at: string;
  created_at_nuvemshop: string;
  contact_name?: string;
  shipping_address?: any;
  province?: string;
  products: OrderProduct[];
  subtotal: string;
  shipping_cost_customer?: string;
  coupon?: string;
  promotional_discount?: string;
  total_discount_amount?: string;
  discount_coupon?: string;
  discount_gateway?: string;
  total: string;
  payment_details?: PaymentDetails;
  payment_method?: string;
  status?: string;
  last_synced_at: string;
  sync_status: string;
}

interface Brand {
  brand: string;
  product_count: number;
}

export default function PartnersOrdersPage() {
  const router = useRouter();
  const {
    isOwnerOrAdmin,
    isPartnersMedia,
    loading: permissionsLoading,
  } = usePermissions();
  const { assignedBrand, isPartnersMediaWithBrand } = useBrandFilter();
  const { isSyncing, syncOrders } = useNuvemshopSync();

  // Brand selection state
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [selectedBrand, setSelectedBrandState] = useState<string | null>(null);
  const [isBrandHydrated, setIsBrandHydrated] = useState(false);

  // Franchise filter hook - must be after selectedBrand declaration
  const { selectedFranchise, shouldShowFranchiseFilter } =
    useFranchiseFilter(selectedBrand);

  // Use global date range hook
  const {
    dateRange,
    period,
    useCustomPeriod,
    isHydrated,
    handleDateRangeChange,
    handlePeriodChange,
  } = useGlobalDateRange();

  // Use selected brand for API calls if available, otherwise fall back to assigned brand
  const effectiveBrand = selectedBrand || assignedBrand;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  const [lastUpdateCheck, setLastUpdateCheck] = useState<string | null>(null);
  const [lastCouponUpdateCheck, setLastCouponUpdateCheck] = useState<
    string | null
  >(null);

  const itemsPerPage = 5;

  // Check permissions
  const canViewPage = isOwnerOrAdmin || isPartnersMedia;
  const canSync = isOwnerOrAdmin;
  const canUseBrandFilter = isOwnerOrAdmin;
  // For owners/admins: show data when a brand is selected OR when "all" is selected (selectedBrand === null but isBrandHydrated)
  // For partners-media: only show data if they have an assigned brand
  const shouldShowData = canUseBrandFilter
    ? isBrandHydrated // Show data for owners/admins once brand selection is hydrated (includes "all" option)
    : isPartnersMediaWithBrand;

  // Brand selection functions
  const setSelectedBrand = useCallback(
    (brand: string | null) => {
      if (!canUseBrandFilter) return;

      setSelectedBrandState(brand);

      try {
        if (brand) {
          storage.setItem("hudlab_partners_brand_filter", brand);
        } else {
          storage.removeItem("hudlab_partners_brand_filter");
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
        throw new Error("Failed to fetch brands");
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

  // Load brands on mount
  useEffect(() => {
    if (canUseBrandFilter) {
      fetchBrands();
    }
  }, [canUseBrandFilter, fetchBrands]);

  // Load selected brand from localStorage on mount
  useEffect(() => {
    if (!canUseBrandFilter) {
      setSelectedBrandState(null);
      setIsBrandHydrated(true);
      return;
    }

    try {
      const saved = storage.getItem("hudlab_partners_brand_filter");
      if (saved) {
        setSelectedBrandState(saved);
      }
    } catch (error) {
      console.warn("Error loading brand selection from localStorage:", error);
    } finally {
      setIsBrandHydrated(true);
    }
  }, [canUseBrandFilter]);

  // Helper function to format date as local YYYY-MM-DD without timezone conversion
  const formatDateToLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const fetchOrders = useCallback(
    async (periodDays?: number, customDateRange?: DateRange) => {
      try {
        setLoading(true);

        const params = new URLSearchParams({
          limit: itemsPerPage.toString(),
          offset: ((currentPage - 1) * itemsPerPage).toString(),
          _t: Date.now().toString(), // Cache buster
        });

        // Use date range logic similar to other pages
        if (customDateRange?.from && customDateRange?.to) {
          // Custom date range
          params.append("start_date", formatDateToLocal(customDateRange.from));
          params.append("end_date", formatDateToLocal(customDateRange.to));
        } else if (periodDays) {
          // Period-based filtering
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(endDate.getDate() - periodDays);

          params.append("start_date", formatDateToLocal(startDate));
          params.append("end_date", formatDateToLocal(endDate));
        }

        // Add brand filter for owners/admins or partners-media with assigned brand
        if (effectiveBrand) {
          params.append("brand", effectiveBrand);
        }

        // Add franchise filter for Zenith brand
        if (selectedFranchise) {
          params.append("franchise", selectedFranchise);
        }

        const response = await fetch(`/api/nuvemshop-sync/orders?${params}`, {
          cache: "no-store", // Disable caching
        });

        if (!response.ok) {
          throw new Error("Erro ao carregar pedidos");
        }

        const data = await response.json();
        setOrders(data.orders || []);
        setTotalOrders(data.total || 0);
      } catch (error) {
        console.error("Error fetching orders:", error);
        toast.error("Erro ao carregar pedidos");
      } finally {
        setLoading(false);
      }
    },
    [currentPage, itemsPerPage, effectiveBrand, selectedFranchise]
  );

  // Function to check for recent updates
  const checkForUpdates = useCallback(async () => {
    if (!canViewPage) return;

    try {
      const response = await fetch("/api/nuvemshop-sync/orders/last-update", {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        const latestUpdate = data.last_update;

        if (lastUpdateCheck && latestUpdate && latestUpdate > lastUpdateCheck) {
          // There's a newer update, refresh the orders
          console.log("🔄 Detected order updates, refreshing...");
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
    canViewPage,
    lastUpdateCheck,
    fetchOrders,
    useCustomPeriod,
    dateRange,
    period,
  ]);

  // Function to check for recent coupon updates
  const checkForCouponUpdates = useCallback(async () => {
    if (!canViewPage) return;

    try {
      const response = await fetch("/api/partners/coupons/last-update", {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        const latestUpdate = data.last_update;

        if (
          lastCouponUpdateCheck &&
          latestUpdate &&
          latestUpdate > lastCouponUpdateCheck
        ) {
          // There's a newer coupon update, refresh the orders to show updated coupon info
          console.log("🎫 Detected coupon updates, refreshing orders...");
          if (useCustomPeriod && dateRange?.from && dateRange?.to) {
            fetchOrders(undefined, dateRange);
          } else {
            fetchOrders(period);
          }
        }

        setLastCouponUpdateCheck(latestUpdate);
      }
    } catch (error) {
      console.error("Error checking for coupon updates:", error);
    }
  }, [
    canViewPage,
    lastCouponUpdateCheck,
    fetchOrders,
    useCustomPeriod,
    dateRange,
    period,
  ]);

  // Handle period change using global hook
  const handlePeriodChangeLocal = (newPeriod: number) => {
    handlePeriodChange(newPeriod);
    fetchOrders(newPeriod);
  };

  // Handle custom date range change using global hook
  const handleDateRangeChangeLocal = (newDateRange: DateRange | undefined) => {
    handleDateRangeChange(newDateRange);
    if (newDateRange?.from && newDateRange?.to) {
      fetchOrders(undefined, newDateRange);
    }
  };

  // Initial data fetch using global date state
  useEffect(() => {
    if (!permissionsLoading && !canViewPage) {
      toast.error("Você não tem permissão para acessar esta página");
      return;
    }

    // Wait for global date range to be hydrated
    if (!isHydrated) {
      return;
    }

    // Wait for brand to be hydrated
    if (!isBrandHydrated) {
      return;
    }

    // Only fetch data if we should show data
    if (canViewPage && shouldShowData) {
      if (useCustomPeriod && dateRange?.from && dateRange?.to) {
        // Use custom date range
        fetchOrders(undefined, dateRange);
      } else {
        // Use period-based filtering
        fetchOrders(period);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    permissionsLoading,
    canViewPage,
    shouldShowData,
    currentPage,
    period,
    useCustomPeriod,
    dateRange,
    isHydrated,
    isBrandHydrated,
    selectedBrand, // Track selected brand changes
    selectedFranchise, // Track selected franchise changes
    // fetchOrders is intentionally omitted - it's stable via useCallback with the right deps
  ]);

  // Set up polling for updates every 10 seconds
  useEffect(() => {
    if (!canViewPage) return;

    // Initial checks
    checkForUpdates();
    checkForCouponUpdates();

    // Set up interval for periodic checks
    const interval = setInterval(() => {
      checkForUpdates();
      checkForCouponUpdates();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [canViewPage, checkForUpdates, checkForCouponUpdates]);

  const handleSync = async () => {
    if (!canSync) {
      toast.error("Você não tem permissão para sincronizar dados");
      return;
    }

    toast.info("Iniciando sincronização de pedidos...");
    const result = await syncOrders({ limit: 100, page: 1, status: "any" });

    if (result.success) {
      // Refresh data after successful sync
      if (useCustomPeriod && dateRange?.from && dateRange?.to) {
        await fetchOrders(undefined, dateRange);
      } else {
        await fetchOrders(period);
      }
    }
  };

  const formatCurrency = (value: string | null | undefined) => {
    // Handle null, undefined, empty string, or string representations of null/undefined
    if (
      !value ||
      value === "null" ||
      value === "undefined" ||
      (typeof value === "string" && value.trim() === "")
    ) {
      return "R$ 0,00";
    }

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return "R$ 0,00";
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numValue);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Enhanced function to detect payment method from multiple sources
  const detectPaymentMethod = (order: Order): string | null => {
    // 1. Try payment_details.method first
    if (order.payment_details?.method) {
      return order.payment_details.method;
    }

    // 2. Try to infer from gateway information
    if (order.payment_details?.credit_card_company) {
      return "credit_card";
    }

    // 3. Try to infer from installments (credit cards usually have installments)
    if (
      order.payment_details?.installments &&
      order.payment_details.installments > 1
    ) {
      return "credit_card";
    }

    // 4. Check if total > 0 and payment_status is paid (likely credit card if no other method detected)
    if (order.total && parseFloat(order.total) > 0 && order.payment_details) {
      // If we have payment_details but no method, it's likely credit_card
      return "credit_card";
    }

    return null;
  };

  const getPaymentMethodBadge = (order: Order) => {
    const method = detectPaymentMethod(order);

    if (!method) {
      // Show a generic payment badge if we can't determine the method
      return <Badge className="bg-gray-100 text-gray-800">Pagamento</Badge>;
    }

    const methodColors: Record<string, string> = {
      credit_card: "bg-blue-100 text-blue-800",
      debit_card: "bg-green-100 text-green-800",
      pix: "bg-purple-100 text-purple-800",
      bank_slip: "bg-orange-100 text-orange-800",
      paypal: "bg-yellow-100 text-yellow-800",
      cash: "bg-green-100 text-green-800",
      wire_transfer: "bg-purple-100 text-purple-800",
    };

    const methodNames: Record<string, string> = {
      credit_card: "Cartão de Crédito",
      debit_card: "Cartão de Débito",
      pix: "PIX",
      bank_slip: "Boleto",
      paypal: "PayPal",
      cash: "Dinheiro",
      wire_transfer: "Transferência",
    };

    return (
      <Badge className={methodColors[method] || "bg-gray-100 text-gray-800"}>
        {methodNames[method] || method}
      </Badge>
    );
  };

  if (permissionsLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="space-y-4 flex-1">
          <Skeleton className="h-8 w-64" />

          {/* Loading skeleton for controls */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-48" />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-48" />
            </div>
          </div>

          {/* Loading skeleton for orders */}
          <div className="space-y-4 flex-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Order Info */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-6 w-20" />
                      </div>
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-40" />
                    </div>

                    {/* Customer Info */}
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-28" />
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-44" />
                    </div>

                    {/* Products */}
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-20" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!canViewPage) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-1 items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-center">Acesso Negado</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground">
                Você não tem permissão para acessar esta página.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalOrders / itemsPerPage);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
        <ShoppingCart className="h-6 w-6 sm:h-8 sm:w-8" />
        Vendas dos Parceiros
      </h1>

      {/* Controls Section */}
      <div className="flex flex-col gap-4 mb-4">
        {/* Brand Selection for Owners/Admins */}
        {canUseBrandFilter && isBrandHydrated && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <Label className="text-sm sm:text-base whitespace-nowrap">
              Selecione uma marca:
            </Label>
            <div className="flex items-center gap-2 w-full sm:max-w-xs">
              {brandsLoading ? (
                <Skeleton className="h-9 flex-1" />
              ) : (
                <Select
                  value={selectedBrand || "all"}
                  onValueChange={(value) =>
                    setSelectedBrand(value === "all" ? null : value)
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione uma marca" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as marcas</SelectItem>
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
        {shouldShowFranchiseFilter && isBrandHydrated && (
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

        {/* Sync Button */}
        {canSync && (
          <div className="flex justify-start">
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isSyncing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isSyncing ? "Sincronizando..." : "Sincronizar Pedidos"}
            </Button>
          </div>
        )}
      </div>

      {/* Message when no brand is selected for owners/admins */}
      {!shouldShowData && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="text-6xl">🏷️</div>
            <h3 className="text-xl font-semibold text-muted-foreground">
              Selecione uma marca
            </h3>
            <p className="text-muted-foreground max-w-md">
              Escolha uma marca acima para visualizar os pedidos específicos
              dessa marca.
            </p>
          </div>
        </div>
      )}

      {/* Message when Zenith brand is selected but no franchise is chosen */}
      {shouldShowData &&
        effectiveBrand &&
        isZenithProduct(effectiveBrand) &&
        !selectedFranchise && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <div className="text-6xl">🏪</div>
              <h3 className="text-xl font-semibold text-muted-foreground">
                Selecione uma franquia para ver os pedidos
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                A marca Zenith possui múltiplas franquias. Escolha uma franquia
                específica para visualizar os pedidos.
              </p>
            </div>
          </div>
        )}

      {/* Orders Content - Only show when brand is selected or user doesn't need brand filter */}
      {shouldShowData &&
        (!effectiveBrand ||
          !isZenithProduct(effectiveBrand) ||
          selectedFranchise) && (
          <>
            {/* Period Selector */}
            <div className="flex flex-col gap-4">
              {/* Period Buttons - Stack on mobile, horizontal on larger screens */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <Button
                  variant={
                    !useCustomPeriod && period === 30 ? "default" : "outline"
                  }
                  onClick={() => handlePeriodChangeLocal(30)}
                  className="w-full sm:w-auto"
                >
                  Último mês
                </Button>
                <Button
                  variant={
                    !useCustomPeriod && period === 60 ? "default" : "outline"
                  }
                  onClick={() => handlePeriodChangeLocal(60)}
                  className="w-full sm:w-auto"
                >
                  Últimos 2 meses
                </Button>
                <Button
                  variant={
                    !useCustomPeriod && period === 90 ? "default" : "outline"
                  }
                  onClick={() => handlePeriodChangeLocal(90)}
                  className="w-full sm:w-auto"
                >
                  Últimos 3 meses
                </Button>
              </div>

              {/* Calendar Section - Stack on mobile */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <Label className="text-sm sm:text-base whitespace-nowrap">
                  Selecione o período desejado:
                </Label>
                <div className="w-full sm:min-w-[250px] sm:w-auto">
                  <Calendar23
                    value={dateRange}
                    onChange={handleDateRangeChangeLocal}
                    hideLabel
                  />
                </div>
              </div>
            </div>

            {/* Orders List */}
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Order Info */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-5 w-24" />
                            <Skeleton className="h-6 w-20" />
                          </div>
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-4 w-40" />
                        </div>

                        {/* Customer Info */}
                        <div className="space-y-3">
                          <Skeleton className="h-5 w-28" />
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-4 w-44" />
                        </div>

                        {/* Products */}
                        <div className="space-y-3">
                          <Skeleton className="h-5 w-20" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">
                    Nenhum pedido encontrado
                  </h3>
                  <p className="text-muted-foreground">
                    {canSync
                      ? "Clique em 'Sincronizar Pedidos' para importar pedidos da Nuvemshop."
                      : "Não há pedidos disponíveis no momento."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-4">
                  {orders.map((order) => (
                    <Card
                      key={order.id}
                      className="hover:shadow-lg transition-shadow"
                    >
                      <CardContent className="p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {/* Order Info */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-lg">
                                Pedido #{order.order_number || order.order_id}
                              </h3>
                              <Badge variant="outline">
                                {order.sync_status}
                              </Badge>
                            </div>

                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span>
                                  {order.contact_name ||
                                    "Cliente não informado"}
                                </span>
                              </div>

                              {order.province && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span>{order.province}</span>
                                </div>
                              )}

                              <div className="text-muted-foreground">
                                {formatDate(order.created_at_nuvemshop)}
                              </div>

                              <div>{getPaymentMethodBadge(order)}</div>
                            </div>
                          </div>

                          {/* Products */}
                          <div className="space-y-3">
                            <h4 className="font-medium flex items-center gap-2">
                              <Package className="h-4 w-4" />
                              Produtos ({order.products.length})
                            </h4>

                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {order.products.map((product, index) => (
                                <div
                                  key={index}
                                  className="text-sm border-l-2 border-gray-200 pl-3"
                                >
                                  <div className="font-medium">
                                    {product.name}
                                  </div>
                                  <div className="text-muted-foreground">
                                    {product.quantity}x{" "}
                                    {formatCurrency(product.price)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Financial Summary */}
                          <div className="space-y-3">
                            <h4 className="font-medium">Resumo Financeiro</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span>Subtotal:</span>
                                <span>{formatCurrency(order.subtotal)}</span>
                              </div>

                              {/* Always show shipping cost if it exists */}
                              {order.shipping_cost_customer !== null &&
                                order.shipping_cost_customer !== undefined &&
                                order.shipping_cost_customer !== "null" &&
                                order.shipping_cost_customer !==
                                  "undefined" && (
                                  <div className="flex justify-between">
                                    <span>Frete:</span>
                                    <span>
                                      {formatCurrency(
                                        order.shipping_cost_customer
                                      )}
                                    </span>
                                  </div>
                                )}

                              {/* Always show coupon section */}
                              <div className="flex justify-between">
                                <span>Cupom:</span>
                                <span className="text-blue-600">
                                  {order.coupon &&
                                  order.coupon.trim() !== "" &&
                                  order.coupon !== "null" &&
                                  order.coupon !== "undefined"
                                    ? order.coupon
                                    : "Sem cupom"}
                                </span>
                              </div>

                              {/* Always show discount fields if they exist, including 0.00 values */}
                              {order.discount_coupon !== null &&
                                order.discount_coupon !== undefined &&
                                order.discount_coupon !== "null" &&
                                order.discount_coupon !== "undefined" && (
                                  <div className="flex justify-between">
                                    <span>Desconto cupom:</span>
                                    <span>
                                      -{formatCurrency(order.discount_coupon)}
                                    </span>
                                  </div>
                                )}

                              {order.promotional_discount !== null &&
                                order.promotional_discount !== undefined &&
                                order.promotional_discount !== "null" &&
                                order.promotional_discount !== "undefined" && (
                                  <div className="flex justify-between">
                                    <span>Desconto promocional:</span>
                                    <span>
                                      -
                                      {formatCurrency(
                                        order.promotional_discount
                                      )}
                                    </span>
                                  </div>
                                )}

                              {order.total_discount_amount !== null &&
                                order.total_discount_amount !== undefined &&
                                order.total_discount_amount !== "null" &&
                                order.total_discount_amount !== "undefined" && (
                                  <div className="flex justify-between">
                                    <span>Desconto total:</span>
                                    <span>
                                      -
                                      {formatCurrency(
                                        order.total_discount_amount
                                      )}
                                    </span>
                                  </div>
                                )}

                              {order.discount_gateway !== null &&
                                order.discount_gateway !== undefined &&
                                order.discount_gateway !== "null" &&
                                order.discount_gateway !== "undefined" && (
                                  <div className="flex justify-between">
                                    <span>Desconto pagamento:</span>
                                    <span>
                                      -{formatCurrency(order.discount_gateway)}
                                    </span>
                                  </div>
                                )}

                              <div className="flex justify-between font-semibold border-t pt-2">
                                <span>Total:</span>
                                <span className="text-primary">
                                  {formatCurrency(order.total)}
                                </span>
                              </div>

                              <div className="flex justify-between">
                                <span>Pagamento:</span>
                                {getPaymentMethodBadge(order)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                    >
                      Anterior
                    </Button>

                    <span className="text-sm text-muted-foreground">
                      Página {currentPage} de {totalPages} ({totalOrders}{" "}
                      pedidos)
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Próxima
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
    </div>
  );
}
