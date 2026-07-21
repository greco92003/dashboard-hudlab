import { getSupabaseSecretKey } from "@/lib/supabase/keys-server";
import { getSupabasePublishableKey } from "@/lib/supabase/keys-public";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Create Supabase server client for API routes
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// Legacy alias for backward compatibility
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// Create Supabase client for sync operations (uses service key)
export async function createSupabaseServerForSync() {
  const { createClient } = await import("@supabase/supabase-js");

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseSecretKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: "public",
      },
    }
  );
}
