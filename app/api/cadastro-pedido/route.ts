import { NextResponse } from "next/server";
import {
  getOrderRegistrationSnapshot,
  OrderRegistrationError,
} from "@/lib/ghl/order-registration";
import { requireApprovedUser } from "@/lib/security/route-guards";

export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const snapshot = await getOrderRegistrationSnapshot();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Order registration snapshot failed", error);
    const status =
      error instanceof OrderRegistrationError ? error.status : 502;
    return NextResponse.json(
      {
        error:
          error instanceof OrderRegistrationError
            ? error.message
            : "Não foi possível carregar as oportunidades do GHL.",
      },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
