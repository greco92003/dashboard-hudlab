function requireKey(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing Supabase environment variable: ${name}`);
  }
  return value;
}

/** Browser-safe key. Legacy JWT anon keys are not accepted. */
export function getSupabasePublishableKey(): string {
  return requireKey(
    process.env.NEXT_PUBLIC_DASHBOARD_PUBLISHABLE,
    "DASHBOARD_PUBLISHABLE",
  );
}
