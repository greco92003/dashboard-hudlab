import { getSupabasePublishableKey } from "@/lib/supabase/keys-public";
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublishableKey()
  )
}
