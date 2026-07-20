import { requireCronSecret } from "@/lib/security/route-guards";
import { GET as runSyncDeals } from "@/app/api/test/robust-deals-sync-parallel/route";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  return runSyncDeals(request);
}

export const maxDuration = 300;
