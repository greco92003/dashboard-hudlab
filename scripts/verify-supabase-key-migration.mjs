import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.DASHBOARD_PUBLISHABLE;
const secretKey = process.env.DASHBOARD_SECRET;

assert(url, "NEXT_PUBLIC_SUPABASE_URL is missing");
assert(
  publishableKey?.startsWith("sb_publishable_"),
  "DASHBOARD_PUBLISHABLE is missing or has an unexpected format",
);
assert(
  secretKey?.startsWith("sb_secret_"),
  "DASHBOARD_SECRET is missing or has an unexpected format",
);

const authSettingsResponse = await fetch(`${url}/auth/v1/settings`, {
  headers: { apikey: publishableKey },
});
assert.equal(
  authSettingsResponse.ok,
  true,
  `Publishable key validation failed with HTTP ${authSettingsResponse.status}`,
);

const dataApiResponse = await fetch(
  `${url}/rest/v1/user_profiles?select=id&limit=0`,
  { headers: { apikey: secretKey } },
);
assert.equal(
  dataApiResponse.ok,
  true,
  `Secret key Data API validation failed with HTTP ${dataApiResponse.status}`,
);

const adminClient = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: sdkError } = await adminClient
  .from("user_profiles")
  .select("id")
  .limit(1);
assert.equal(
  sdkError,
  null,
  `Secret key supabase-js validation failed: ${sdkError?.code || "unknown"}`,
);

console.log(
  JSON.stringify({
    publishableAuthApi: "ok",
    secretDataApi: "ok",
    secretSupabaseJs: "ok",
  }),
);
