import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/security/route-guards";

const MANYCHAT_BASE_URL = "https://api.manychat.com";

// Ordered funnel stages — ManyChat tag names use "Webhook Manus " prefix.
// Display names strip that prefix. Order defines the funnel sequence.
export const FUNNEL_STAGES = [
  { manychatName: "Webhook Manus Lead", displayName: "Lead" },
  {
    manychatName: "Webhook Manus EmailColetado",
    displayName: "Email Coletado",
  },
  {
    manychatName: "Webhook Manus ViuMockupAutomatico",
    displayName: "Viu Mockup Automático",
  },
  {
    manychatName: "Webhook Manus ConheceuModelosEPrecos",
    displayName: "Conheceu Modelos e Preços",
  },
  {
    manychatName: "Webhook Manus SolicitouOrçamento",
    displayName: "Solicitou Orçamento",
  },
  {
    manychatName: "Webhook Manus InformouQuantidade",
    displayName: "Informou Quantidade",
  },
  {
    manychatName: "Webhook Manus InformouEstado",
    displayName: "Informou Estado",
  },
  {
    manychatName: "Webhook Manus OrcamentoGerado",
    displayName: "Orçamento Gerado",
  },
  {
    manychatName: "Webhook Manus SolicitouMockupOficial",
    displayName: "Solicitou Mockup Oficial",
  },
  {
    manychatName: "Webhook Manus NegocioFechado",
    displayName: "Negócio Fechado",
  },
] as const;

export async function GET() {
  const access = await requireApprovedUser();
  if (!access.ok) return access.response;

  try {
    const token = process.env.MANYCHAT_API_TOKEN;

    if (!token || token === "seu_token_manychat_aqui") {
      return NextResponse.json({
        status: "success",
        data: FUNNEL_STAGES.map((s, i) => ({ id: i + 1, name: s.displayName })),
        isMock: true,
      });
    }

    const response = await fetch(`${MANYCHAT_BASE_URL}/fb/page/getTags`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("ManyChat API error:", response.status, errorData);
      return NextResponse.json(
        {
          error: `Erro ao buscar tags do ManyChat: ${response.status}`,
          details: errorData,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    const allTags: { id: number; name: string }[] = data.data || [];

    // Filter & order only the funnel stages, stripping the "Webhook Manus " prefix
    const funnelTags = FUNNEL_STAGES.map((stage, i) => {
      const match = allTags.find(
        (t) => t.name.toLowerCase() === stage.manychatName.toLowerCase(),
      );
      return {
        id: match?.id ?? i + 1,
        name: stage.displayName,
      };
    });

    return NextResponse.json({
      status: "success",
      data: funnelTags,
      isMock: false,
    });
  } catch (error) {
    console.error("Erro ao buscar tags ManyChat:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar tags do ManyChat" },
      { status: 500 },
    );
  }
}
