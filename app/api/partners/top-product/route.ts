import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

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

    let query = supabase
      .from("nuvemshop_orders")
      .select(
        `
        products,
        completed_at,
        created_at_nuvemshop
      `
      )
      .not("products", "is", null)
      .not("total", "is", null)
      .eq("payment_status", "paid"); // Only show orders with payment status "paid"

    // Apply date filtering - use created_at_nuvemshop as fallback for completed_at
    if (startDate && endDate) {
      // Custom date range - filter by completed_at if available, otherwise created_at_nuvemshop
      query = query.or(
        `and(completed_at.gte.${startDate}T00:00:00.000Z,completed_at.lte.${endDate}T23:59:59.999Z),and(completed_at.is.null,created_at_nuvemshop.gte.${startDate}T00:00:00.000Z,created_at_nuvemshop.lte.${endDate}T23:59:59.999Z)`
      );
    } else if (period) {
      // Period-based filtering
      const days = parseInt(period);
      if (!isNaN(days) && days > 0) {
        const endDateTime = new Date();
        const startDateTime = new Date();
        startDateTime.setDate(endDateTime.getDate() - days + 1);
        startDateTime.setHours(0, 0, 0, 0);
        endDateTime.setHours(23, 59, 59, 999);

        const startISO = startDateTime.toISOString();
        const endISO = endDateTime.toISOString();

        // Filter by completed_at if available, otherwise created_at_nuvemshop
        query = query.or(
          `and(completed_at.gte.${startISO},completed_at.lte.${endISO}),and(completed_at.is.null,created_at_nuvemshop.gte.${startISO},created_at_nuvemshop.lte.${endISO})`
        );
      }
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Error fetching orders for top product:", error);
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
          topProduct: null,
          totalProducts: 0,
          allProducts: [],
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

    if (!filteredOrders || filteredOrders.length === 0) {
      return NextResponse.json({
        topProduct: null,
        message: "No orders found for the specified period",
        filtered_by_brand: brandToFilter,
      });
    }

    // Process products from all filtered orders
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

    filteredOrders.forEach((order) => {
      if (order.products && Array.isArray(order.products)) {
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
            productStats[productId].revenue += price * quantity;

            // Update image if we don't have one yet
            if (!productStats[productId].image && image) {
              productStats[productId].image = image;
            }
          }
        });
      }
    });

    // Find the product with highest quantity sold
    let topProduct: {
      id: string;
      name: string;
      quantity: number;
      revenue: number;
      image?: string;
    } | null = null;
    let maxQuantity = 0;

    Object.values(productStats).forEach((product) => {
      if (product.quantity > maxQuantity) {
        maxQuantity = product.quantity;
        topProduct = product;
      }
    });

    // If we have a top product, try to get additional details from products table
    if (topProduct !== null) {
      const productId = (topProduct as any).id;
      const { data: productDetails } = await supabase
        .from("nuvemshop_products")
        .select(
          `
          name_pt,
          brand,
          featured_image_src,
          images
        `
        )
        .eq("product_id", productId)
        .single();

      if (productDetails) {
        // Use more detailed information if available
        (topProduct as any).name =
          productDetails.name_pt || (topProduct as any).name;
        (topProduct as any).image =
          productDetails.featured_image_src || (topProduct as any).image;

        // If still no image, try to get from images array
        if (
          !(topProduct as any).image &&
          productDetails.images &&
          Array.isArray(productDetails.images)
        ) {
          const firstImage = productDetails.images.find((img: any) => img.src);
          if (firstImage) {
            (topProduct as any).image = firstImage.src;
          }
        }

        // Add brand information
        if (productDetails.brand) {
          (topProduct as any).name = `${productDetails.brand} - ${
            (topProduct as any).name
          }`;
        }
      }
    }

    return NextResponse.json({
      topProduct,
      totalProducts: Object.keys(productStats).length,
      allProducts: Object.values(productStats)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10), // Top 10 for reference
      filtered_by_brand: brandToFilter,
    });
  } catch (error) {
    console.error("Error in top product API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
