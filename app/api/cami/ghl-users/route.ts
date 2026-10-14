import { NextResponse } from "next/server";
import { requireRole } from "@/lib/security/route-guards";
import { fetchGhlLocationUsers } from "@/lib/ghl/api";

// Pessoas do GHL que podem receber as passagens da Cami (Controle, só owner).
export async function GET() {
  const access = await requireRole(["owner"]);
  if (!access.ok) return access.response;
  try {
    return NextResponse.json({ users: await fetchGhlLocationUsers() });
  } catch (error) {
    console.error("cami ghl users error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno" }, { status: 500 });
  }
}
