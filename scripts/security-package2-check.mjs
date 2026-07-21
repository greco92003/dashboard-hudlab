import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260721141158_harden_rls_and_privileged_functions.sql",
);

for (const table of [
  "deals_cache_dup_bkp_20260703",
  "deals_live_dup_bkp_20260703",
  "deals_cache_stale_won_bkp_20260710",
  "deals_live_stale_won_bkp_20260710",
]) {
  assert.match(migration, new RegExp(table), table);
}

assert.match(migration, /revoke all on all tables in schema public from anon/i);
assert.match(
  migration,
  /revoke truncate, references, trigger on all tables in schema public from authenticated/i,
);
assert.match(migration, /create schema if not exists private/i);
assert.match(migration, /create policy approved_user_gate[\s\S]*as restrictive/i);
assert.match(
  migration,
  /grant update \(first_name, last_name, avatar_url, sector, updated_at\)/i,
);
assert.match(migration, /revoke execute on function %s from public, anon, authenticated/i);
assert.match(migration, /auth\.uid\(\)\) is distinct from p_user_id/i);
assert.match(migration, /create policy avatars_insert_own/i);
assert.match(migration, /create policy contracts_insert_approved/i);
assert.match(migration, /create policy nct_assets_insert_manager/i);
assert.doesNotMatch(
  migration,
  /allowed_mime_types\s*=\s*array\[[^\]]*image\/svg\+xml/i,
);

const adminRoute = read("app/api/admin/users/[id]/route.ts");
assert.match(adminRoute, /requireAdmin\(\)/);
assert.match(adminRoute, /createServiceClient\(\)/);
for (const field of ["role", "approved", "assigned_brand", "setor_liderado"]) {
  assert.match(adminRoute, new RegExp(`"${field}"`), field);
}
assert.match(adminRoute, /target\.role === "owner"/);

const userManagement = read("components/UserManagement.tsx");
assert.match(userManagement, /\/api\/admin\/users\/\$\{userId\}/);
assert.doesNotMatch(
  userManagement,
  /\.from\("user_profiles"\)[\s\S]{0,120}\.update\(/,
);

const deleteUser = read("app/api/delete-user/route.ts");
assert.match(deleteUser, /auth\.admin\.deleteUser\(userId\)/);
assert.doesNotMatch(deleteUser, /delete_user_account/);

const narratives = read("app/ncts/narrativas/page.tsx");
assert.doesNotMatch(narratives, /image\/svg\+xml/);

const detectBrands = read("app/api/partners/brands/detect-new/route.ts");
assert.match(detectBrands, /createServiceClient\(\)/);
assert.match(detectBrands, /service\.rpc\(\s*"generate_auto_coupon_for_brand"/);

console.log("Package 2 security checks passed.");
