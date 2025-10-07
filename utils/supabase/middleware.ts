import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    // Log auth errors in production for debugging
    if (userError && process.env.NODE_ENV === "production") {
      console.error("Middleware auth error:", {
        error: userError.message,
        path: request.nextUrl.pathname,
        timestamp: new Date().toISOString(),
      });
    }

    // Get user profile to check approval status
    let userProfile = null;
    if (user) {
      try {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("approved, role")
          .eq("id", user.id)
          .single();
        userProfile = profile;
      } catch (error) {
        console.error("Error fetching user profile in middleware:", error);
      }
    }

    // Define protected and auth routes
    const protectedRoutes = [
      "/dashboard",
      "/pairs-sold",
      "/direct-costs",
      "/taxes",
      "/fixed-costs",
      "/variable-costs",
      "/profile-settings",
      "/deals",
      "/sellers",
      "/designers",
      "/partners",
      "/goals",
    ];

    // Define routes that require admin or owner role
    const adminOwnerRoutes = [
      "/direct-costs",
      "/taxes",
      "/fixed-costs",
      "/variable-costs",
    ];

    const authRoutes = [
      "/home",
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
    ];

    const isPendingApproval = request.nextUrl.pathname === "/pending-approval";
    const isProtected = protectedRoutes.some((route) =>
      request.nextUrl.pathname.startsWith(route)
    );
    const isAuth = authRoutes.includes(request.nextUrl.pathname);
    const isRoot = request.nextUrl.pathname === "/";

    // Redirect logic
    if (isProtected && !user) {
      // No user, redirect to home
      if (process.env.NODE_ENV === "production") {
        console.log("Redirecting to home:", {
          path: request.nextUrl.pathname,
          hasUser: !!user,
          timestamp: new Date().toISOString(),
        });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/home";
      return NextResponse.redirect(url);
    }

    // Check if user is authenticated but not approved
    if (user && userProfile && !userProfile.approved) {
      // User is authenticated but not approved
      if (isProtected) {
        // Trying to access protected route, redirect to pending approval
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        return NextResponse.redirect(url);
      }

      if (isAuth && !isPendingApproval) {
        // Trying to access auth routes (login, signup), redirect to pending approval
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        return NextResponse.redirect(url);
      }

      if (isRoot) {
        // Root path, redirect to pending approval
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        return NextResponse.redirect(url);
      }
    }

    if (isAuth && user && userProfile?.approved) {
      // Allow authenticated and approved users to access reset-password page
      if (request.nextUrl.pathname === "/reset-password") {
        return supabaseResponse;
      }

      // User is authenticated and approved, redirect to dashboard for other auth pages
      if (process.env.NODE_ENV === "production") {
        console.log("Redirecting authenticated user to dashboard:", {
          path: request.nextUrl.pathname,
          userId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    if (isRoot && user && userProfile?.approved) {
      // Root path with authenticated and approved user, redirect to dashboard
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // If user is on pending-approval but is approved, redirect to dashboard
    if (isPendingApproval && user && userProfile?.approved) {
      const url = request.nextUrl.clone();
      // Redirect partners-media users to their home page
      if (userProfile.role === "partners-media") {
        url.pathname = "/partners/home";
      } else {
        url.pathname = "/dashboard";
      }
      return NextResponse.redirect(url);
    }

    // Role-based access control
    if (user && userProfile?.approved) {
      const partnersRoutes = [
        "/partners/home",
        "/partners/dashboard",
        "/partners/products",
        "/partners/orders",
      ];
      const isPartnersRoute = partnersRoutes.includes(request.nextUrl.pathname);

      // Partners-media users can only access partners routes
      if (userProfile.role === "partners-media") {
        // If partners-media user is trying to access non-partners routes, redirect to partners dashboard
        if (
          isProtected &&
          !isPartnersRoute &&
          !request.nextUrl.pathname.startsWith("/profile-settings")
        ) {
          if (process.env.NODE_ENV === "production") {
            console.log(
              "Redirecting partners-media user to partners dashboard:",
              {
                path: request.nextUrl.pathname,
                userId: user.id,
                role: userProfile.role,
                timestamp: new Date().toISOString(),
              }
            );
          }
          const url = request.nextUrl.clone();
          url.pathname = "/partners/home";
          return NextResponse.redirect(url);
        }
      }

      // Users with role "user" cannot access partners routes
      if (userProfile.role === "user" && isPartnersRoute) {
        if (process.env.NODE_ENV === "production") {
          console.log("Blocking user role from accessing partners routes:", {
            path: request.nextUrl.pathname,
            userId: user.id,
            role: userProfile.role,
            timestamp: new Date().toISOString(),
          });
        }
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }

      // Only admins and owners can access cost management routes
      const isAdminOwnerRoute = adminOwnerRoutes.some((route) =>
        request.nextUrl.pathname.startsWith(route)
      );

      if (isAdminOwnerRoute && !["admin", "owner"].includes(userProfile.role)) {
        if (process.env.NODE_ENV === "production") {
          console.log("Blocking non-admin/owner from accessing cost routes:", {
            path: request.nextUrl.pathname,
            userId: user.id,
            role: userProfile.role,
            timestamp: new Date().toISOString(),
          });
        }
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }

    if (isRoot && !user) {
      // Root path without user, redirect to home
      const url = request.nextUrl.clone();
      url.pathname = "/home";
      return NextResponse.redirect(url);
    }

    // Handle root path for authenticated and approved users
    if (isRoot && user && userProfile?.approved) {
      const url = request.nextUrl.clone();
      // Redirect partners-media users to their dashboard
      if (userProfile.role === "partners-media") {
        url.pathname = "/partners/dashboard";
      } else {
        url.pathname = "/dashboard";
      }
      return NextResponse.redirect(url);
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
    // creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it, like so:
    //    const myNewResponse = NextResponse.next({ request })
    // 2. Copy over the cookies, like so:
    //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
    // 3. Change the myNewResponse object to fit your needs, but avoid changing
    //    the cookies!
    // 4. Finally:
    //    return myNewResponse
    // If this is not done, you may be causing the browser and server to go out
    // of sync and terminate the user's session prematurely!
    return supabaseResponse;
  } catch (error) {
    console.error("Middleware error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      path: request.nextUrl.pathname,
      timestamp: new Date().toISOString(),
    });

    // In case of error, allow the request to continue
    return supabaseResponse;
  }
}
