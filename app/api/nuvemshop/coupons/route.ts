import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  buildBrandIndex,
  inferCouponBrand,
  brandEquals,
} from "@/lib/nuvemshop/coupon-brand";

// Nuvemshop API configuration
const NUVEMSHOP_API_BASE_URL = "https://api.nuvemshop.com.br/v1";

// Helper function to make authenticated requests to Nuvemshop API
async function fetchNuvemshopAPI(endpoint: string, options: RequestInit = {}) {
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
  const userId = process.env.NUVEMSHOP_USER_ID;

  if (!accessToken || !userId) {
    throw new Error("Nuvemshop credentials not configured");
  }

  const url = `${NUVEMSHOP_API_BASE_URL}/${userId}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authentication: `bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "HudLab Dashboard (contato@hudlab.com.br)",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nuvemshop API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Fetch all coupons from Nuvemshop, paginating defensively. Nuvemshop returns
// a 404 with "Last page is X" once we go past the end, so we treat that as the
// natural termination condition (same pattern used by the sync route).
async function fetchAllNuvemshopCoupons(): Promise<any[]> {
  const all: any[] = [];
  const perPage = 200;
  let page = 1;
  const maxPages = 10;

  while (page <= maxPages) {
    try {
      const data = await fetchNuvemshopAPI(
        `/coupons?per_page=${perPage}&page=${page}`,
      );
      const batch = Array.isArray(data) ? data : data.coupons || [];
      if (batch.length === 0) break;
      all.push(...batch);
      if (batch.length < perPage) break;
      page++;
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) break;
      throw err;
    }
  }

  return all;
}

// GET - Fetch coupons live from Nuvemshop and resolve their brand on the fly.
//
// Nuvemshop is the single source of truth: we never read coupon state from the
// local generated_coupons mirror. Brand resolution is computed server-side by
// cross-referencing each coupon's products with nuvemshop_products (and falling
// back to token matching against product names / coupon code).
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved, role, assigned_brand")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    const allowedRoles = ["owner", "admin", "manager", "partners-media"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedBrand = searchParams.get("brand");
    const includeInvalid = searchParams.get("include_invalid") === "true";

    const isPartnersMedia = profile.role === "partners-media";
    const effectiveBrand = isPartnersMedia
      ? profile.assigned_brand
      : requestedBrand;

    if (isPartnersMedia && !profile.assigned_brand) {
      return NextResponse.json({
        success: true,
        coupons: [],
        message: "No brand assigned to user",
      });
    }

    // Load brand index once (product_id -> brand + tokenised matchers)
    const { data: productRows, error: productRowsError } = await supabase
      .from("nuvemshop_products")
      .select("product_id, brand")
      .not("brand", "is", null);

    if (productRowsError) {
      console.error("Error loading nuvemshop_products:", productRowsError);
      return NextResponse.json(
        { error: "Failed to load product/brand index" },
        { status: 500 },
      );
    }

    const brandIndex = buildBrandIndex(productRows || []);

    // Live fetch from Nuvemshop (single paginated call)
    const remoteCoupons = await fetchAllNuvemshopCoupons();

    // Enrich with resolved brand and apply server-side filters
    const enriched = remoteCoupons.map((c) => ({
      ...c,
      brand: inferCouponBrand(c, brandIndex) ?? "Unknown",
    }));

    const filtered = enriched.filter((c) => {
      if (!includeInvalid && c.valid !== true) return false;
      if (effectiveBrand) return brandEquals(c.brand, effectiveBrand);
      return true;
    });

    return NextResponse.json({
      success: true,
      coupons: filtered,
      message: "Coupons fetched live from Nuvemshop",
    });
  } catch (error) {
    console.error("Error fetching coupons from Nuvemshop:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch coupons",
      },
      { status: 500 },
    );
  }
}

// POST - Create a new coupon in Nuvemshop
export async function POST(request: NextRequest) {
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
      .select("approved, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.approved) {
      return NextResponse.json({ error: "User not approved" }, { status: 403 });
    }

    const allowedRoles = ["owner", "admin"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const body = await request.json();

    // Create coupon in Nuvemshop
    const newCoupon = await fetchNuvemshopAPI("/coupons", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return NextResponse.json({
      success: true,
      coupon: newCoupon,
      message: "Coupon created successfully in Nuvemshop",
    });
  } catch (error) {
    console.error("Error creating coupon in Nuvemshop:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create coupon",
      },
      { status: 500 },
    );
  }
}
