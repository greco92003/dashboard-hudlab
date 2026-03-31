import { NextRequest, NextResponse } from "next/server";

// Interface para os dados da tabela de Análise de Cadastros
export interface TrafficAnalysisData {
  periodo: string;
  investimento: number;
  leads: number;
  custoPorLead: number;
  mockup: number;
  mediaMock: number;
  pares: number;
  custoMockup: number;
  percentualConversao: number;
}

export async function GET(request: NextRequest) {
  try {
    console.log("📊 Fetching Traffic Analysis data from Google Sheets...");

    // ID da planilha (mesma usada em /designers)
    const spreadsheetId = "1YF8vQBGo6Z6ka4uvS5UY75GDpI-YHRMQLkDDlPbEwU4";
    const range = "Tráfego Pago!A1:I100";

    // Buscar dados do Google Sheets usando a API existente
    const baseUrl = request.nextUrl.origin;
    const response = await fetch(`${baseUrl}/api/google-sheets/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spreadsheetId,
        range,
        includeHeaders: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Sheets API error: ${errorText}`);
    }

    const result = await response.json();

    console.log("📊 Raw data from Google Sheets:", {
      success: result.success,
      headers: result.data?.headers,
      dataLength: result.data?.data?.length,
      firstRow: result.data?.data?.[0],
    });

    if (!result.success || !result.data?.data) {
      throw new Error("Failed to fetch data from Google Sheets");
    }

    // Processar os dados
    const processedData: TrafficAnalysisData[] = result.data.data
      .map((row: any) => {
        // Pular linhas vazias
        if (!row["Periodo"] && !row["Período"]) {
          return null;
        }

        // Função auxiliar para converter string de moeda para número
        const parseCurrency = (value: string | number): number => {
          if (typeof value === "number") return value;
          if (!value) return 0;

          // Remove "R$", espaços, e converte vírgula para ponto
          const cleaned = value
            .toString()
            .replace(/R\$/g, "")
            .replace(/\s/g, "")
            .replace(/\./g, "") // Remove separador de milhar
            .replace(/,/g, "."); // Converte vírgula decimal para ponto

          return parseFloat(cleaned) || 0;
        };

        // Função auxiliar para converter string de número para número
        const parseNumber = (value: string | number): number => {
          if (typeof value === "number") return value;
          if (!value) return 0;

          const cleaned = value
            .toString()
            .replace(/\./g, "")
            .replace(/,/g, ".");
          return parseFloat(cleaned) || 0;
        };

        // Função auxiliar para converter percentual (ex: "16,73%" ou "0,1673")
        const parsePercent = (value: string | number): number => {
          if (typeof value === "number") return value;
          if (!value) return 0;
          const cleaned = value
            .toString()
            .replace(/%/g, "")
            .replace(/\./g, "")
            .replace(/,/g, ".");
          return parseFloat(cleaned) || 0;
        };

        return {
          periodo: row["Periodo"] || row["Período"] || "",
          investimento: parseCurrency(row["Investimento"]),
          leads: parseNumber(row["Leads"]),
          custoPorLead: parseCurrency(row["C. por Lead"]),
          mockup: parseNumber(row["Mockup"]),
          mediaMock: parseNumber(row["Média Mock"]),
          pares: parseNumber(row["Pares"]),
          custoMockup: parseCurrency(row["C. Mockup"]),
          percentualConversao: parsePercent(row["% de Conv."]),
        };
      })
      .filter((item: TrafficAnalysisData | null) => item !== null);

    console.log("✅ Processed traffic analysis data:", {
      totalRecords: processedData.length,
      sample: processedData.slice(0, 3),
    });

    return NextResponse.json({
      success: true,
      data: processedData,
      cached: result.cached || false,
      lastSync: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching traffic analysis data:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch traffic analysis data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
