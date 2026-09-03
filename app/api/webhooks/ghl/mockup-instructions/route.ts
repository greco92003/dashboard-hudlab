import { NextRequest } from "next/server";
import {
  getGhlOpportunityWebhookStatus,
  handleGhlOpportunityWebhook,
} from "@/lib/ghl/opportunity-webhook-handler";

export async function POST(request: NextRequest) {
  return handleGhlOpportunityWebhook(request);
}

export const GET = getGhlOpportunityWebhookStatus;

export const runtime = "nodejs";
export const maxDuration = 300;
