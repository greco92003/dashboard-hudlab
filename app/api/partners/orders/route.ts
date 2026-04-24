import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  calculateBrazilDayRange,
  logTimezoneDebug,
} from "@/lib/utils/timezone";
import {
  isZenithProduct,
  getFranchiseFromOrderProduct,
} from "@/types/franchise";
import { getEffectiveOrderFees } from "@/lib/payment-fees";
import { sliceOrderByProducts } from "@/lib/order-brand-slicing";

/**
 * IMPORTANT NOTE about Transaction Data:
 *
 * The following fields are NOT available via Nuvemshop's regular store API:
 * - gateway_fees (payment processing fees)
 * - transaction_taxes (taxes on transaction)
 * - installment_interest (interest rate on installments)
 *
 * These fields are ONLY accessible through the Transaction API, which is
 * exclusively available to Payment Provider apps (payment gateway integrations).
 *
 * Reference: https://tiendanube.github.io/api-documentation/resources/transaction
 *
 * These fields will always be NULL unless you integrate as a Payment Provider.
 */

// Interface for database order data
interface DatabaseOrder {
  id: any;
  order_id: any;
  order_number: any;
  completed_at: any;
  created_at_nuvemshop: any;
  total: any;
  subtotal: any;
  promotional_discount: any;
  discount_coupon: any;
  discount_gateway: any;
  total_discount_amount: any;
  shipping_cost_customer: any;
  shipping_cost_owner: any;
  shipping_discount: any;
  gateway_fees: any;
  transaction_taxes: any;
  installment_interest: any;
  coupon: any;
  province: any;
  products: any;
  contact_name: any;
  payment_details: any;
  payment_method: any;
  status: any;
  last_synced_at: any;
  sync_status: any;
}

// Calculate net (real) revenue for a raw database order using effective fees
function calculateOrderRealRevenue(order: DatabaseOrder): number {
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

  const shippingDiscount =
    typeof order.shipping_discount === "string"
      ? parseFloat(order.shipping_discount)
      : order.shipping_discount || 0;

  const { gatewayFees, transactionTaxes, installmentInterest } =
    getEffectiveOrderFees(order as any);

  // NOTE: shipping_cost_owner is NOT deducted as it's an operational cost of the store, not the partner
  const realRevenue =
    subtotal -
    promotionalDiscount -
    discountCoupon -
    discountGateway -
    shippingDiscount -
    gatewayFees -
    transactionTaxes -
    installmentInterest;

  return Math.max(0, realRevenue);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is approved and get role/brand info
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Check if user has permission to access partners data
    // Users with role "user" cannot access partners data
    const allowedRoles = ["owner", "admin", "manager", "partners-media"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const selectedBrand = searchParams.get("brand"); // Brand filter for owners/admins
    const selectedFranchise = searchParams.get("franchise"); // Franchise filter for Zenith brand

    console.log("[Orders API] Query params:", {
      selectedBrand,
      selectedFranchise,
    });

    let query = supabase
      .from("nuvemshop_orders")
      .select(
        `
        id,
        order_id,
        order_number,
        completed_at,
        created_at_nuvemshop,
        total,
        subtotal,
        promotional_discount,
        discount_coupon,
        discount_gateway,
        total_discount_amount,
        shipping_cost_customer,
        shipping_cost_owner,
        shipping_discount,
        gateway_fees,
        transaction_taxes,
        installment_interest,
        coupon,
        province,
        products,
        contact_name,
        payment_details,
        payment_method,
        status,
        last_synced_at,
        sync_status
      `,
      )
      .eq("payment_status", "paid") // Only show orders with payment status "paid"
      .neq("status", "cancelled") // Exclude cancelled orders from commission calculations
      .not("total", "is", null) // Only orders with valid total
      .order("created_at_nuvemshop", { ascending: false })
      .limit(2000); // Increase limit to get more orders before filtering

    // Apply date filtering - use created_at_nuvemshop as fallback for completed_at
    if (startDate && endDate) {
      // Custom date range - filter by completed_at if available, otherwise created_at_nuvemshop
      query = query.or(
        `and(completed_at.gte.${startDate}T00:00:00.000Z,completed_at.lte.${endDate}T23:59:59.999Z),and(completed_at.is.null,created_at_nuvemshop.gte.${startDate}T00:00:00.000Z,created_at_nuvemshop.lte.${endDate}T23:59:59.999Z)`,
      );
    } else if (period) {
      // Period-based filtering in Brazilian timezone
      const days = parseInt(period);
      if (!isNaN(days) && days > 0) {
        logTimezoneDebug("partners/orders API");
        const brazilDateRange = calculateBrazilDayRange(days);
        const startDateTime = brazilDateRange.startDate;
        const endDateTime = brazilDateRange.endDate;

        const startISO = startDateTime.toISOString();
        const endISO = endDateTime.toISOString();

        console.log(
          "Partners Orders API: Period-based date range calculated in Brazil timezone:",
          {
            days,
            startDateTime: startDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
          },
        );

        // Filter by completed_at if available, otherwise created_at_nuvemshop
        query = query.or(
          `and(completed_at.gte.${startISO},completed_at.lte.${endISO}),and(completed_at.is.null,created_at_nuvemshop.gte.${startISO},created_at_nuvemshop.lte.${endISO})`,
        );
      }
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Error fetching orders:", error);
      return NextResponse.json(
        { error: "Failed to fetch orders" },
        { status: 500 },
      );
    }

    // Determine which brand to filter by
    let brandToFilter: string | null = null;

    // For partners-media users, use their assigned brand
    if (profile.role === "partners-media" && profile.assigned_brand) {
      brandToFilter = profile.assigned_brand;
    }
    // For owners/admins, use the selected brand from query params
    else if (["owner", "admin"].includes(profile.role)) {
      if (selectedBrand && selectedBrand !== "all") {
        brandToFilter = selectedBrand;
      } else if (selectedBrand === "all") {
        // "all" means show data from all brands (no filter)
        brandToFilter = null;
      } else {
        // For owners/admins without a selected brand, return empty results
        return NextResponse.json({
          orders: [],
          summary: {
            totalOrders: 0,
            totalRevenue: 0,
            provinceStats: [],
          },
          filtered_by_brand: null,
        });
      }
    }

    // Build brand map (only needed when we actually filter by brand)
    let productBrandMap: Map<string, string> | null = null;
    if (brandToFilter) {
      const productIds = new Set<string>();
      (orders || []).forEach((order) => {
        if (order.products && Array.isArray(order.products)) {
          order.products.forEach((product: any) => {
            if (product.product_id) {
              productIds.add(product.product_id.toString());
            }
          });
        }
      });

      const { data: productsWithBrands } = await supabase
        .from("nuvemshop_products")
        .select("product_id, brand")
        .in("product_id", Array.from(productIds));

      productBrandMap = new Map<string, string>();
      (productsWithBrands || []).forEach((product) => {
        if (product.product_id && product.brand) {
          productBrandMap!.set(product.product_id.toString(), product.brand);
        }
      });
    }

    // Build a single product-level predicate combining brand + franchise.
    // When both apply, a product must match BOTH to be included in the slice.
    const franchiseFilterActive = Boolean(
      selectedFranchise && brandToFilter && isZenithProduct(brandToFilter),
    );

    const productPredicate: ((product: any) => boolean) | null = (() => {
      if (!brandToFilter && !franchiseFilterActive) return null;

      return (product: any) => {
        if (brandToFilter) {
          if (!product.product_id) return false;
          const productBrand = productBrandMap!.get(
            product.product_id.toString(),
          );
          if (productBrand !== brandToFilter) return false;
        }

        if (franchiseFilterActive) {
          const productFranchise = getFranchiseFromOrderProduct(product);
          if (!productFranchise || productFranchise !== selectedFranchise) {
            return false;
          }
        }

        return true;
      };
    })();

    // Slice each order down to the matching-brand (and matching-franchise)
    // portion, proportionally adjusting subtotal / discounts / fees so that
    // the orders list, the province chart, the top-product card and the
    // revenue summary all stay consistent with the selected filters.
    let filteredOrders: DatabaseOrder[] = orders || [];
    if (productPredicate) {
      filteredOrders = (orders || [])
        .map((order) => sliceOrderByProducts(order, productPredicate))
        .filter((order): order is DatabaseOrder => order !== null);
    }

    // Calculate summary statistics. Because orders are already sliced, the
    // standard net-revenue calculation gives the correct brand/franchise
    // share automatically.
    const totalOrders = filteredOrders.length;
    const totalRevenue = filteredOrders.reduce(
      (sum, order) => sum + calculateOrderRealRevenue(order),
      0,
    );

    console.log(
      `Dashboard API: total orders before filter=${orders?.length}, after filter=${totalOrders}, brand=${brandToFilter}, franchise=${selectedFranchise}`,
    );

    // Group by province for state analysis using the same sliced revenue
    const provinceStats = filteredOrders.reduce(
      (acc, order) => {
        const province = order.province || "Não informado";
        if (!acc[province]) {
          acc[province] = {
            count: 0,
            revenue: 0,
          };
        }
        acc[province].count += 1;
        acc[province].revenue += calculateOrderRealRevenue(order);
        return acc;
      },
      {} as Record<string, { count: number; revenue: number }>,
    );

    return NextResponse.json({
      orders: filteredOrders,
      summary: {
        totalOrders,
        totalRevenue,
        provinceStats,
      },
      filtered_by_brand: brandToFilter,
      filtered_by_franchise: selectedFranchise,
    });
  } catch (error) {
    console.error("Error in partners orders API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
