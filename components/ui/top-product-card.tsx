"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { Package, TrendingUp, ShoppingCart } from "lucide-react";
import { DateRange } from "react-day-picker";
import Image from "next/image";
import { usePermissions } from "@/hooks/usePermissions";

interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  image?: string;
}

interface NuvemshopOrder {
  id: string;
  order_id: string;
  order_number: string | null;
  completed_at: string | null;
  created_at_nuvemshop: string | null;
  total: number | null;
  subtotal: number | null;
  promotional_discount: number | null;
  discount_coupon: number | null;
  discount_gateway: number | null;
  shipping_cost_customer: number | null;
  province: string | null;
  products: any[] | null;
}

interface TopProductCardProps {
  period?: number;
  dateRange?: DateRange;
  useCustomPeriod?: boolean;
  selectedBrand?: string | null;
  orders?: NuvemshopOrder[];
}

export function TopProductCard({
  period,
  dateRange,
  useCustomPeriod,
  selectedBrand: propSelectedBrand,
  orders,
}: TopProductCardProps) {
  const [topProduct, setTopProduct] = useState<TopProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Note: searchParams and permissions are kept for potential future use
  // but currently not needed since we're processing local data
  const searchParams = useSearchParams();
  const { isOwnerOrAdmin } = usePermissions();

  // Use prop selectedBrand if provided, otherwise fall back to searchParams
  const selectedBrand =
    propSelectedBrand !== undefined
      ? propSelectedBrand
      : searchParams.get("brand");

  // Function to calculate real revenue (subtotal - discounts, without shipping)
  const calculateRealRevenue = useCallback((order: NuvemshopOrder): number => {
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
  }, []);

  // Process orders data to find top product
  const processTopProduct = useCallback(
    (ordersData: NuvemshopOrder[]) => {
      try {
        setLoading(true);
        setError(null);

        if (!ordersData || ordersData.length === 0) {
          setTopProduct(null);
          setLoading(false);
          return;
        }

        // Process products from all orders
        const productStats: Record<
          string,
          {
            id: string;
            name: string;
            quantity: number;
            revenue: number;
            image?: string;
          }
        > = {};

        ordersData.forEach((order) => {
          if (order.products && Array.isArray(order.products)) {
            // Calculate the order's real revenue
            const orderRealRevenue = calculateRealRevenue(order);
            const orderTotal = order.subtotal || 0;

            // Calculate the proportion of real revenue to subtotal
            const revenueRatio =
              orderTotal > 0 ? orderRealRevenue / orderTotal : 0;

            order.products.forEach((product: any) => {
              const productId =
                product.product_id?.toString() || product.id?.toString();
              const productName = product.name || "Produto sem nome";
              const quantity = parseInt(product.quantity) || 1;
              const price = parseFloat(product.price) || 0;
              const image = product.image?.src || product.image || null;

              if (productId) {
                if (!productStats[productId]) {
                  productStats[productId] = {
                    id: productId,
                    name: productName,
                    quantity: 0,
                    revenue: 0,
                    image: image,
                  };
                }

                productStats[productId].quantity += quantity;
                // Apply the same revenue calculation logic as the main dashboard
                productStats[productId].revenue +=
                  price * quantity * revenueRatio;

                // Update image if we don't have one yet
                if (!productStats[productId].image && image) {
                  productStats[productId].image = image;
                }
              }
            });
          }
        });

        // Find the product with highest quantity sold
        let topProduct: TopProduct | null = null;
        let maxQuantity = 0;

        Object.values(productStats).forEach((product) => {
          if (product.quantity > maxQuantity) {
            maxQuantity = product.quantity;
            topProduct = product;
          }
        });

        setTopProduct(topProduct);
      } catch (error) {
        console.error("Error processing top product:", error);
        setError("Erro ao processar produto mais vendido");
        setTopProduct(null);
      } finally {
        setLoading(false);
      }
    },
    [calculateRealRevenue]
  );

  // Effect to process data when orders change
  useEffect(() => {
    if (orders) {
      processTopProduct(orders);
    } else {
      setTopProduct(null);
      setLoading(false);
    }
  }, [orders, processTopProduct]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Produto Mais Vendido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Produto Mais Vendido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!topProduct) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Produto Mais Vendido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                Nenhum produto encontrado no período selecionado
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="h-5 w-5" />
          Produto Mais Vendido
          <TrendingUp className="h-4 w-4 text-green-500" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {/* Product Image */}
          <div className="relative h-20 w-20 flex-shrink-0">
            {topProduct.image ? (
              <Image
                src={topProduct.image}
                alt={topProduct.name}
                fill
                className="object-cover rounded-lg border"
                sizes="80px"
                onError={(e) => {
                  // Hide image on error and show placeholder
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                }}
              />
            ) : (
              <div className="h-full w-full bg-muted rounded-lg border flex items-center justify-center">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base leading-tight mb-2 truncate">
              {topProduct.name}
            </h3>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <ShoppingCart className="h-4 w-4 text-blue-500" />
                <span className="font-medium">
                  {topProduct.quantity} unidades vendidas
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="font-medium">
                  {formatCurrency(topProduct.revenue, "BRL")} em vendas
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="mt-4 pt-4 border-t">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {topProduct.quantity}
              </p>
              <p className="text-xs text-muted-foreground">Unidades</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(topProduct.revenue, "BRL")}
              </p>
              <p className="text-xs text-muted-foreground">Receita</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
