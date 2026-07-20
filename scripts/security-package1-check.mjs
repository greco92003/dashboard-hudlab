import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const guards = read("lib/security/route-guards.ts");
assert.match(guards, /timingSafeEqual/);
assert.match(guards, /if \(!secret\)/);
assert.match(guards, /status: 503/);
assert.match(guards, /requireAdminOrInternal/);

const middleware = read("middleware.ts");
assert.match(middleware, /isDiagnosticApi/);
assert.match(middleware, /NODE_ENV === "production"/);
assert.doesNotMatch(middleware, /\(\?!api\|/);

for (const route of [
  "refresh-tiny-token",
  "sync-deals",
  "sync-designer-mockups",
  "sync-programacao",
  "validate-won-deals",
]) {
  const source = read(`app/api/cron/${route}/route.ts`);
  assert.match(source, /requireCronSecret\(request\)/, route);
}

for (const route of [
  "app/api/google-sheets/read/route.ts",
  "app/api/nuvemshop-sync/full/route.ts",
  "app/api/admin/configure-nuvemshop-credentials/route.ts",
]) {
  assert.match(read(route), /requireAdmin/, route);
}

for (const route of [
  "app/api/live-dashboard/route.ts",
  "app/api/financial-dashboard/summary/route.ts",
  "app/api/ghl/deals/route.ts",
  "app/api/meta-marketing/insights/route.ts",
]) {
  assert.match(read(route), /requireApprovedUser/, route);
}

assert.doesNotMatch(
  read("app/api/internal/auto-coupon-trigger/route.ts"),
  /internal-secret|SUPABASE_SERVICE_ROLE_KEY/,
);

console.log("Package 1 security checks passed.");
