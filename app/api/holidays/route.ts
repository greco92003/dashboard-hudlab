import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface Holiday {
  date: string;
  name: string;
  type: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = searchParams.get("year") || new Date().getFullYear().toString();

    // Verificar se o token está configurado
    const token = process.env.INVERTEXTO_API_TOKEN;
    
    if (!token) {
      console.error("INVERTEXTO_API_TOKEN não configurado");
      return NextResponse.json(
        { error: "Token da API não configurado" },
        { status: 500 }
      );
    }

    // Fazer requisição para a API de feriados
    const apiUrl = `https://api.invertexto.com/v1/holidays/${year}?token=${token}&state=BR`;
    
    console.log(`Buscando feriados para o ano ${year}...`);
    
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      // Cache por 24 horas (feriados não mudam frequentemente)
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro na API de feriados:", response.status, errorText);
      
      // Se o token for inválido ou houver erro de autenticação
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: "Token da API inválido ou expirado" },
          { status: 401 }
        );
      }
      
      throw new Error(`Erro ao buscar feriados: ${response.status}`);
    }

    const holidays: Holiday[] = await response.json();
    
    console.log(`✅ ${holidays.length} feriados encontrados para ${year}`);
    
    return NextResponse.json(holidays);
  } catch (error) {
    console.error("Erro ao buscar feriados:", error);
    return NextResponse.json(
      { 
        error: "Erro ao buscar feriados",
        details: error instanceof Error ? error.message : "Erro desconhecido"
      },
      { status: 500 }
    );
  }
}

