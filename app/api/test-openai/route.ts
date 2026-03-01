import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function GET(request: NextRequest) {
  // Apenas em desenvolvimento
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Apenas em desenvolvimento" },
      { status: 503 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const keyPreview =
    apiKey && apiKey !== "sua-chave-gemini-aqui"
      ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`
      : "NÃO CONFIGURADA";

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    provider: "Google Gemini",
    keyPreview,
    keyConfigured: !!(apiKey && apiKey !== "sua-chave-gemini-aqui"),
    tests: {},
  };

  if (!apiKey || apiKey === "sua-chave-gemini-aqui") {
    return NextResponse.json({
      ...results,
      error:
        "GEMINI_API_KEY não está configurada no .env.local. Obtenha em: https://aistudio.google.com/app/apikey",
    });
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Teste 1: gemini-2.5-flash (modelo atual recomendado)
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Responda apenas: OK",
    });
    results.tests.gemini25Flash = {
      status: "OK",
      response: result.text?.trim(),
    };
  } catch (error: any) {
    results.tests.gemini25Flash = {
      status: "ERRO",
      code: error?.status || error?.code,
      message: error?.message?.substring(0, 200),
    };
  }

  // Teste 2: gemini-2.5-flash-lite (mais rápido e barato)
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: "Responda apenas: OK",
    });
    results.tests.gemini25FlashLite = {
      status: "OK",
      response: result.text?.trim(),
    };
  } catch (error: any) {
    results.tests.gemini25FlashLite = {
      status: "ERRO",
      code: error?.status || error?.code,
      message: error?.message?.substring(0, 200),
    };
  }

  // Teste 3: gemini-2.5-pro (mais avançado)
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-pro",
      contents: "Responda apenas: OK",
    });
    results.tests.gemini25Pro = {
      status: "OK",
      response: result.text?.trim(),
    };
  } catch (error: any) {
    results.tests.gemini25Pro = {
      status: "ERRO",
      code: error?.status || error?.code,
      message: error?.message?.substring(0, 200),
    };
  }

  // Resumo
  const allTests = Object.values(results.tests);
  const passed = allTests.filter((t: any) => t.status === "OK").length;
  const failed = allTests.filter((t: any) => t.status === "ERRO").length;
  results.summary = {
    total: allTests.length,
    passed,
    failed,
    allPassed: failed === 0,
  };

  console.log("\n=== TESTE GEMINI ===");
  console.log(JSON.stringify(results, null, 2));
  console.log("===================\n");

  return NextResponse.json(results);
}
