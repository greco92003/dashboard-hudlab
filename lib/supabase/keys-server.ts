import "server-only";

/** Server-only elevated key. Legacy JWT service_role keys are not accepted. */
export function getSupabaseSecretKey(): string {
  const key = process.env.DASHBOARD_SECRET;

  if (!key) {
    throw new Error(
      "Missing Supabase server key: configure DASHBOARD_SECRET",
    );
  }

  return key;
}
