import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get URL from query parameters
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const brand = searchParams.get("brand");

    if (!url) {
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Get user profile to check permissions
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // For partners-media users, verify they have access to the brand
    if (profile.role === "partners-media" && brand) {
      const { data: userBrand } = await supabase
        .from("user_profiles")
        .select("assigned_brand")
        .eq("id", user.id)
        .single();

      if (userBrand?.assigned_brand !== brand) {
        return NextResponse.json(
          { error: "Access denied to this brand" },
          { status: 403 }
        );
      }
    }

    // Generate QR code
    const qrBuffer = await QRCode.toBuffer(url, {
      margin: 4,
      color: {
        dark: "#000000", // Black
        light: "#FFFFFF", // White
      },
      errorCorrectionLevel: "M", // 15% error correction
    });

    // Generate filename with brand if available
    const filename = brand
      ? `qrcode-afiliado-${brand.replace(/\s+/g, "-").toLowerCase()}.png`
      : "qrcode-afiliado.png";

    // Return the QR code as a downloadable PNG
    return new Response(qrBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    return NextResponse.json(
      {
        error: "Failed to generate QR code",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST method for generating QR code with preview (returns base64)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url, brand } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Get user profile to check permissions
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // For partners-media users, verify they have access to the brand
    if (profile.role === "partners-media" && brand) {
      const { data: userBrand } = await supabase
        .from("user_profiles")
        .select("assigned_brand")
        .eq("id", user.id)
        .single();

      if (userBrand?.assigned_brand !== brand) {
        return NextResponse.json(
          { error: "Access denied to this brand" },
          { status: 403 }
        );
      }
    }

    // Generate QR code as data URL for preview
    const qrDataURL = await QRCode.toDataURL(url, {
      margin: 4,
      color: {
        dark: "#000000", // Black
        light: "#FFFFFF", // White
      },
      errorCorrectionLevel: "M", // 15% error correction
    });

    return NextResponse.json({
      success: true,
      qrCode: qrDataURL,
      url: url,
      brand: brand || null,
    });
  } catch (error) {
    console.error("Error generating QR code preview:", error);
    return NextResponse.json(
      {
        error: "Failed to generate QR code preview",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
