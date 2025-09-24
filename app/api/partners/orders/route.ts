import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  calculateBrazilDayRange,
  logTimezoneDebug,
} from "@/lib/utils/timezone";
import {
  calculateFranchiseRevenue,
  isZenithProduct,
  getFranchiseFromOrderProduct,
  type NuvemshopOrder,
} from "@/types/franchise";

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
  shipping_cost_customer: any;
  province: any;
  products: any;
  contact_name: any;
  status: any;
}

// Helper function to filter database orders by franchise
function filterDatabaseOrdersByFranchise(
  orders: DatabaseOrder[],
  franchise: string | null
): DatabaseOrder[] {
  if (!franchise) return orders;

  return orders
    .map((order) => {
      // Filter products to only include those from the selected franchise
      const filteredProducts = (order.products || []).filter((product: any) => {
        const productFranchise = getFranchiseFromOrderProduct(product);

        // If no franchise info, it's not a Zenith product, so include it
        if (!productFranchise) return true;

        // If it has franchise info, only include if it matches
        return productFranchise === franchise;
      });

      return {
        ...order,
        products: filteredProducts,
      };
    })
    .filter((order) => (order.products || []).length > 0); // Only keep orders with products
}

// Helper function to convert database order to NuvemshopOrder for revenue calculation
function convertToNuvemshopOrder(dbOrder: DatabaseOrder): NuvemshopOrder {
  return {
    order_id: dbOrder.order_id,
    products: dbOrder.products || [],
    subtotal: dbOrder.subtotal || 0,
    promotional_discount: dbOrder.promotional_discount || 0,
    discount_coupon: dbOrder.discount_coupon || 0,
    discount_gateway: dbOrder.discount_gateway || 0,
    completed_at: dbOrder.completed_at,
    created_at_nuvemshop: dbOrder.created_at_nuvemshop,
  };
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
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const selectedBrand = searchParams.get("brand"); // Brand filter for owners/admins
    const selectedFranchise = searchParams.get("franchise"); // Franchise filter for Zenith brand

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
        shipping_cost_customer,
        province,
        products,
        contact_name,
        status
      `
      )
      .eq("payment_status", "paid") // Only show orders with payment status "paid"
      .not("total", "is", null) // Only orders with valid total
      .order("created_at_nuvemshop", { ascending: false })
      .limit(2000); // Increase limit to get more orders before filtering

    // Apply date filtering - use created_at_nuvemshop as fallback for completed_at
    if (startDate && endDate) {
      // Custom date range - filter by completed_at if available, otherwise created_at_nuvemshop
      query = query.or(
        `and(completed_at.gte.${startDate}T00:00:00.000Z,completed_at.lte.${endDate}T23:59:59.999Z),and(completed_at.is.null,created_at_nuvemshop.gte.${startDate}T00:00:00.000Z,created_at_nuvemshop.lte.${endDate}T23:59:59.999Z)`
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
          }
        );

        // Filter by completed_at if available, otherwise created_at_nuvemshop
        query = query.or(
          `and(completed_at.gte.${startISO},completed_at.lte.${endISO}),and(completed_at.is.null,created_at_nuvemshop.gte.${startISO},created_at_nuvemshop.lte.${endISO})`
        );
      }
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Error fetching orders:", error);
      return NextResponse.json(
        { error: "Failed to fetch orders" },
        { status: 500 }
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

    // Filter orders by brand if needed
    let filteredOrders = orders || [];
    if (brandToFilter) {
      // Get all product IDs from orders
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

      // Get products with their brands from nuvemshop_products table
      const { data: productsWithBrands } = await supabase
        .from("nuvemshop_products")
        .select("product_id, brand")
        .in("product_id", Array.from(productIds));

      // Create a map of product_id to brand
      const productBrandMap = new Map<string, string>();
      (productsWithBrands || []).forEach((product) => {
        if (product.product_id && product.brand) {
          productBrandMap.set(product.product_id.toString(), product.brand);
        }
      });

      // Filter orders based on brand information
      filteredOrders = (orders || []).filter((order) => {
        if (!order.products || !Array.isArray(order.products)) {
          return false;
        }

        // Check if any product in the order matches the target brand
        return order.products.some((product: any) => {
          if (!product.product_id) return false;
          const productBrand = productBrandMap.get(
            product.product_id.toString()
          );
          return productBrand === brandToFilter;
        });
      });
    }

    // Apply franchise filtering for Zenith brand
    if (selectedFranchise && brandToFilter && isZenithProduct(brandToFilter)) {
      filteredOrders = filterDatabaseOrdersByFranchise(
        filteredOrders,
        selectedFranchise
      );
    }

    // Calculate summary statistics with franchise-aware revenue calculation
    const totalOrders = filteredOrders?.length || 0;
    let totalRevenue = 0;

    if (selectedFranchise && brandToFilter && isZenithProduct(brandToFilter)) {
      // For Zenith with franchise filter, calculate revenue only for franchise products
      totalRevenue =
        filteredOrders?.reduce((sum, order) => {
          const nuvemshopOrder = convertToNuvemshopOrder(order);
          return (
            sum + calculateFranchiseRevenue(nuvemshopOrder, selectedFranchise)
          );
        }, 0) || 0;
    } else {
      // Standard revenue calculation
      totalRevenue =
        filteredOrders?.reduce((sum, order) => sum + (order.total || 0), 0) ||
        0;
    }

    console.log(
      `Dashboard API: total orders before filter=${orders?.length}, after filter=${totalOrders}, brand=${brandToFilter}, franchise=${selectedFranchise}`
    );

    // Group by province for state analysis with franchise-aware revenue
    const provinceStats =
      filteredOrders?.reduce((acc, order) => {
        const province = order.province || "Não informado";
        if (!acc[province]) {
          acc[province] = {
            count: 0,
            revenue: 0,
          };
        }
        acc[province].count += 1;

        // Use franchise-aware revenue calculation if applicable
        if (
          selectedFranchise &&
          brandToFilter &&
          isZenithProduct(brandToFilter)
        ) {
          const nuvemshopOrder = convertToNuvemshopOrder(order);
          acc[province].revenue += calculateFranchiseRevenue(
            nuvemshopOrder,
            selectedFranchise
          );
        } else {
          acc[province].revenue += order.total || 0;
        }

        return acc;
      }, {} as Record<string, { count: number; revenue: number }>) || {};

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
      { status: 500 }
    );
  }
}
