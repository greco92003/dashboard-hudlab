import "server-only";

/** Server-only elevated key; legacy service_role is a temporary fallback. */
export function getSupabaseSecretKey(): string {
  const key =
    process.env.DASHBOARD_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      "Missing Supabase server key: configure DASHBOARD_SECRET",
    );
  }

  return key;
}
