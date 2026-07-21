function requireKey(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing Supabase environment variable: ${name}`);
  }
  return value;
}

/** Browser-safe key; the legacy anon key is a temporary migration fallback. */
export function getSupabasePublishableKey(): string {
  return requireKey(
    process.env.NEXT_PUBLIC_DASHBOARD_PUBLISHABLE ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "DASHBOARD_PUBLISHABLE",
  );
}
