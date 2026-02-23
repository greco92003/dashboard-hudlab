import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  calculateFranchiseRevenue,
  isZenithProduct,
  getFranchiseFromOrderProduct,
} from "@/types/franchise";

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

    // Check if user is approved and has permission
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    // Allow partners-media to view their brand's summary and owners/admins to view any brand
    const allowedRoles = ["owner", "admin", "partners-media"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const selectedBrand = searchParams.get("brand"); // Brand filter for owners/admins
    const selectedFranchise = searchParams.get("franchise"); // Franchise filter for Zenith brand

    // Determine which brand to calculate for
    let targetBrand: string | null = null;

    if (profile.role === "partners-media") {
      if (!profile.assigned_brand) {
        return NextResponse.json(
          { error: "No brand assigned" },
          { status: 403 },
        );
      }
      targetBrand = profile.assigned_brand;
    } else if (selectedBrand && selectedBrand !== "all") {
      targetBrand = selectedBrand;
    } else {
      // For owners/admins without brand filter, return error since we need a specific brand
      return NextResponse.json(
        { error: "Brand parameter is required" },
        { status: 400 },
      );
    }

    // Get commission settings for the specific brand
    const { data: commissionSettings } = await supabase
      .from("partners_commission_settings")
      .select("percentage")
      .eq("brand", targetBrand)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    const commissionPercentage = commissionSettings?.percentage || 5.0;

    // Calculate total commission earned for the brand
    // This uses the same logic as the dashboard: (subtotal - discounts) * commission_percentage
    // Filter orders from 2025-06-01 onwards (start point for all commission calculations)
    // This date represents when we started tracking partner commissions - before this date there were no sales
    const commissionStartDate = "2025-06-01";

    const { data: orders, error: ordersError } = await supabase
      .from("nuvemshop_orders")
      .select(
        `
        order_id,
        subtotal,
        promotional_discount,
        discount_coupon,
        discount_gateway,
        shipping_discount,
        shipping_cost_owner,
        gateway_fees,
        transaction_taxes,
        installment_interest,
        products,
        completed_at,
        created_at_nuvemshop
      `,
      )
      .eq("payment_status", "paid")
      .neq("status", "cancelled") // Exclude cancelled orders from commission calculations
      .not("subtotal", "is", null)
      .or(
        `and(completed_at.gte.${commissionStartDate}T00:00:00.000Z),and(completed_at.is.null,created_at_nuvemshop.gte.${commissionStartDate}T00:00:00.000Z)`,
      );

    if (ordersError) {
      console.error(
        "Error fetching orders for commission calculation:",
        ordersError,
      );
      return NextResponse.json(
        { error: "Failed to calculate commission" },
        { status: 500 },
      );
    }

    console.log(
      `[Commission Summary] Found ${
        orders?.length || 0
      } orders for brand ${targetBrand} since ${commissionStartDate}, franchise filter: ${selectedFranchise}`,
    );

    // Get all product IDs from orders to filter by brand (same logic as orders API)
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
    const { data: productsWithBrands, error: productsError } = await supabase
      .from("nuvemshop_products")
      .select("product_id, brand")
      .in("product_id", Array.from(productIds));

    if (productsError) {
      console.error("Error fetching brand products:", productsError);
      return NextResponse.json(
        { error: "Failed to fetch brand products" },
        { status: 500 },
      );
    }

    // Create a map of product_id to brand
    const productBrandMap = new Map<string, string>();
    (productsWithBrands || []).forEach((product) => {
      if (product.product_id && product.brand) {
        productBrandMap.set(product.product_id.toString(), product.brand);
      }
    });

    console.log(
      `[Commission Summary] Found ${productIds.size} unique product IDs in orders`,
    );
    console.log(
      `[Commission Summary] Found ${
        productsWithBrands?.length || 0
      } products with brand info`,
    );
    console.log(
      `[Commission Summary] Products for brand ${targetBrand}:`,
      Array.from(productBrandMap.entries()).filter(
        ([_, brand]) => brand === targetBrand,
      ).length,
    );

    // Calculate total commission earned
    let totalCommissionEarned = 0;
    let processedOrders = 0;

    for (const order of orders || []) {
      // Check if order contains products from this brand using the same logic as orders API
      const orderProducts = order.products || [];
      const hasBrandProducts = orderProducts.some((product: any) => {
        if (!product.product_id) return false;
        const productBrand = productBrandMap.get(product.product_id.toString());
        return productBrand === targetBrand;
      });

      if (!hasBrandProducts) continue;

      // For Zenith brand with franchise filter, check if order has products from the selected franchise
      if (selectedFranchise && targetBrand && isZenithProduct(targetBrand)) {
        const hasFranchiseProducts = orderProducts.some((product: any) => {
          const productFranchise = getFranchiseFromOrderProduct(product);
          return productFranchise === selectedFranchise;
        });

        if (!hasFranchiseProducts) continue;
      }

      processedOrders++;

      // Calculate commission based on franchise filter
      let commission = 0;

      if (selectedFranchise && targetBrand && isZenithProduct(targetBrand)) {
        // For Zenith with franchise filter, calculate revenue only for franchise products
        const franchiseRevenue = calculateFranchiseRevenue(
          order,
          selectedFranchise,
        );
        commission =
          Math.max(0, franchiseRevenue) * (commissionPercentage / 100);
      } else {
        // Standard commission calculation (net revenue after all costs)
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

        const gatewayFees =
          typeof order.gateway_fees === "string"
            ? parseFloat(order.gateway_fees)
            : order.gateway_fees || 0;

        const transactionTaxes =
          typeof order.transaction_taxes === "string"
            ? parseFloat(order.transaction_taxes)
            : order.transaction_taxes || 0;

        const installmentInterest =
          typeof order.installment_interest === "string"
            ? parseFloat(order.installment_interest)
            : order.installment_interest || 0;

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

        commission = Math.max(0, realRevenue) * (commissionPercentage / 100);
      }

      totalCommissionEarned += commission;
    }

    console.log(
      `[Commission Summary] Processed ${processedOrders} orders for brand ${targetBrand}`,
    );
    console.log(
      `[Commission Summary] Total commission earned: R$ ${totalCommissionEarned.toFixed(
        2,
      )}`,
    );
    console.log(
      `[Commission Summary] Commission percentage: ${commissionPercentage}%`,
    );

    // Get total payments made for the brand (and franchise if applicable)
    let paymentsQuery = supabase
      .from("commission_payments")
      .select("*")
      .eq("brand", targetBrand)
      .in("status", ["sent", "confirmed"]);

    // Filter by franchise for Zenith brand
    if (selectedFranchise && targetBrand && isZenithProduct(targetBrand)) {
      paymentsQuery = paymentsQuery.eq("franchise", selectedFranchise);
    }

    console.log(
      `[Commission Summary] Fetching payments for brand: ${targetBrand}, franchise: ${selectedFranchise}`,
    );

    const { data: payments, error: paymentsError } = await paymentsQuery;

    if (paymentsError) {
      console.error("Error fetching commission payments:", paymentsError);
      return NextResponse.json(
        { error: "Failed to fetch commission payments" },
        { status: 500 },
      );
    }

    console.log(
      `[Commission Summary] Found ${payments?.length || 0} payments:`,
    );
    (payments || []).forEach((payment, index) => {
      console.log(
        `  Payment ${index + 1}: R$ ${payment.amount} - ${payment.description || "N/A"} - Status: ${payment.status} - Date: ${payment.payment_date} - ID: ${payment.id}`,
      );
    });

    const totalPaid = (payments || []).reduce((sum, payment) => {
      const amount =
        typeof payment.amount === "string"
          ? parseFloat(payment.amount)
          : payment.amount || 0;
      return sum + amount;
    }, 0);

    // Calculate balance
    const balance = totalCommissionEarned - totalPaid;

    console.log(
      `[Commission Summary] Final calculation for brand ${targetBrand}, franchise ${selectedFranchise}:`,
    );
    console.log(
      `  - Total Commission Earned: R$ ${totalCommissionEarned.toFixed(2)}`,
    );
    console.log(`  - Total Paid: R$ ${totalPaid.toFixed(2)}`);
    console.log(`  - Balance: R$ ${balance.toFixed(2)}`);
    console.log(`  - Number of payments: ${payments?.length || 0}`);

    return NextResponse.json(
      {
        brand: targetBrand,
        franchise: selectedFranchise,
        commission_percentage: commissionPercentage,
        total_earned: totalCommissionEarned,
        total_paid: totalPaid,
        balance: balance,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    console.error("Error in commission summary GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
