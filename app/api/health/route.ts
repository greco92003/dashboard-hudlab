import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Create Supabase client
async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function GET() {
  const startTime = Date.now();
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    checks: {
      database: { status: "unknown", responseTime: 0 },
      api: { status: "healthy", responseTime: 0 },
      cache: { status: "unknown", responseTime: 0 },
    },
    performance: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      responseTime: 0,
    },
  };

  try {
    // Test database connection
    const dbStartTime = Date.now();
    const supabase = await createSupabaseServer();

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("count")
        .limit(1);

      health.checks.database = {
        status: error ? "unhealthy" : "healthy",
        responseTime: Date.now() - dbStartTime,
      };
    } catch (dbError) {
      health.checks.database = {
        status: "unhealthy",
        responseTime: Date.now() - dbStartTime,
      };
    }

    // Test cache system (simple check)
    const cacheStartTime = Date.now();
    try {
      // Simple cache test - check if we can query deals table
      const { data: dealsCount } = await supabase
        .from("deals_cache")
        .select("count")
        .limit(1);

      health.checks.cache = {
        status: "healthy",
        responseTime: Date.now() - cacheStartTime,
      };
    } catch (cacheError) {
      health.checks.cache = {
        status: "unhealthy",
        responseTime: Date.now() - cacheStartTime,
      };
    }

    // Calculate overall response time
    health.performance.responseTime = Date.now() - startTime;

    // Determine overall status
    const allChecksHealthy = Object.values(health.checks).every(
      (check) => check.status === "healthy"
    );

    health.status = allChecksHealthy ? "healthy" : "degraded";

    // Return appropriate status code
    const statusCode = health.status === "healthy" ? 200 : 503;

    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    console.error("Health check error:", error);

    health.status = "unhealthy";
    health.performance.responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        ...health,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}

// Also handle POST for external monitoring services
export async function POST() {
  return GET();
}

// Set timeout for health check
export const config = {
  maxDuration: 10, // 10 seconds
};
