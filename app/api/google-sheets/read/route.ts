import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// Rate limiting e retry logic
const RATE_LIMIT_DELAY = 1000; // 1 segundo entre requests
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 segundos

// Cache simples em memória para evitar requests desnecessários
const requestCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Função para delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Função para retry com exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delayMs: number = INITIAL_RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.status === 429 || error.code === 429)) {
      console.log(
        `⏳ Rate limit hit, retrying in ${delayMs}ms... (${retries} retries left)`
      );
      await delay(delayMs);
      return retryWithBackoff(fn, retries - 1, delayMs * 2);
    }
    throw error;
  }
}

// Função para verificar cache
function getCachedData(cacheKey: string) {
  const cached = requestCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`📋 Using cached data for key: ${cacheKey}`);
    return cached.data;
  }
  return null;
}

// Função para salvar no cache
function setCachedData(cacheKey: string, data: any) {
  requestCache.set(cacheKey, { data, timestamp: Date.now() });
  console.log(`💾 Cached data for key: ${cacheKey}`);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const spreadsheetId = searchParams.get("spreadsheetId");
    const range = searchParams.get("range");
    const includeHeaders = searchParams.get("includeHeaders") !== "false";

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "spreadsheetId is required" },
        { status: 400 }
      );
    }

    if (!range) {
      return NextResponse.json(
        { error: "range is required (ex: 'Sheet1!A1:Z100')" },
        { status: 400 }
      );
    }

    // Criar chave de cache
    const cacheKey = `${spreadsheetId}-${range}-${includeHeaders}`;

    // Verificar cache primeiro
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return NextResponse.json({
        success: true,
        data: cachedData,
        cached: true,
        metadata: {
          totalRows: cachedData.values?.length || 0,
          totalColumns: cachedData.values?.[0]?.length || 0,
          hasHeaders: includeHeaders,
          headersCount: cachedData.headers?.length || 0,
          dataRowsCount: cachedData.data?.length || 0,
        },
      });
    }

    console.log(`📊 Reading Google Sheet: ${spreadsheetId}, Range: ${range}`);
    console.log(`🔍 API READ - Request body:`, {
      spreadsheetId,
      range,
      includeHeaders,
    });

    // Rate limiting - aguardar antes de fazer request
    await delay(RATE_LIMIT_DELAY);

    // Criar autenticação diretamente
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n"
    );
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;

    if (!privateKey || !clientEmail) {
      return NextResponse.json(
        { error: "Missing Google Sheets credentials" },
        { status: 500 }
      );
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });

    await auth.authorize();
    const sheets = google.sheets({ version: "v4", auth });

    // Usar retry logic para o request
    const response = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
    });

    const values = response.data.values || [];

    let headers: string[] = [];
    let dataRows: string[][] = values;
    let data: any[] = [];

    if (includeHeaders && values.length > 0) {
      headers = values[0];
      dataRows = values.slice(1);

      // Converte os dados para objetos se houver cabeçalhos
      data = dataRows.map((row) => {
        const rowData: any = {};
        headers.forEach((header, index) => {
          rowData[header] = row[index] || null;
        });
        return rowData;
      });
    }

    const result = {
      values,
      headers: includeHeaders ? headers : undefined,
      data: includeHeaders ? data : undefined,
    };

    // Salvar no cache
    setCachedData(cacheKey, result);

    console.log(`📊 API READ - Response data:`, {
      totalValues: values.length,
      headers: headers,
      firstFewRows: data.slice(0, 3),
      sampleData: data.slice(0, 3).map((row) => ({
        nomeNegocio: row["Nome do Negócio"],
        etapaFunil: row["Etapa do Funil"],
        atualizadoEm: row["Atualizado em"],
        designer: row["Designer"],
      })),
    });

    // Debug específico para encontrar o nome correto da coluna de data
    console.log("🔍 HEADERS DA PLANILHA:", headers);
    console.log("🔍 PRIMEIRA LINHA COMPLETA:", data[0]);

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
      metadata: {
        totalRows: result.values.length,
        totalColumns: result.values[0]?.length || 0,
        hasHeaders: includeHeaders,
        headersCount: result.headers?.length || 0,
        dataRowsCount: result.data?.length || 0,
      },
    });
  } catch (error) {
    console.error("Error reading Google Sheet:", error);

    return NextResponse.json(
      {
        error: "Failed to read Google Sheet",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spreadsheetId, range, includeHeaders = true } = body;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "spreadsheetId is required" },
        { status: 400 }
      );
    }

    if (!range) {
      return NextResponse.json(
        { error: "range is required (ex: 'Sheet1!A1:Z100')" },
        { status: 400 }
      );
    }

    // Criar chave de cache
    const cacheKey = `${spreadsheetId}-${range}-${includeHeaders}`;

    // Verificar cache primeiro
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return NextResponse.json({
        success: true,
        data: cachedData,
        cached: true,
        metadata: {
          totalRows: cachedData.values?.length || 0,
          totalColumns: cachedData.values?.[0]?.length || 0,
          hasHeaders: includeHeaders,
          headersCount: cachedData.headers?.length || 0,
          dataRowsCount: cachedData.data?.length || 0,
        },
      });
    }

    console.log(
      `📊 Reading Google Sheet via POST: ${spreadsheetId}, Range: ${range}`
    );

    // Rate limiting - aguardar antes de fazer request
    await delay(RATE_LIMIT_DELAY);

    // Criar autenticação diretamente
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n"
    );
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;

    if (!privateKey || !clientEmail) {
      return NextResponse.json(
        { error: "Missing Google Sheets credentials" },
        { status: 500 }
      );
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });

    await auth.authorize();
    const sheets = google.sheets({ version: "v4", auth });

    // Usar retry logic para o request
    const response = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
    });

    const values = response.data.values || [];

    let headers: string[] = [];
    let dataRows: string[][] = values;
    let data: any[] = [];

    if (includeHeaders && values.length > 0) {
      headers = values[0];
      dataRows = values.slice(1);

      // Converte os dados para objetos se houver cabeçalhos
      data = dataRows.map((row) => {
        const rowData: any = {};
        headers.forEach((header, index) => {
          rowData[header] = row[index] || null;
        });
        return rowData;
      });
    }

    const result = {
      values,
      headers: includeHeaders ? headers : undefined,
      data: includeHeaders ? data : undefined,
    };

    // Salvar no cache
    setCachedData(cacheKey, result);

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
      metadata: {
        totalRows: result.values.length,
        totalColumns: result.values[0]?.length || 0,
        hasHeaders: includeHeaders,
        headersCount: result.headers?.length || 0,
        dataRowsCount: result.data?.length || 0,
      },
    });
  } catch (error) {
    console.error("Error reading Google Sheet:", error);

    return NextResponse.json(
      {
        error: "Failed to read Google Sheet",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
