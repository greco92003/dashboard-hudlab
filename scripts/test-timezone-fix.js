/**
 * Script para testar as correções de timezone
 * Compara os cálculos de data antes e depois da correção
 */

// Simular timezone UTC (produção)
const originalTimezone = process.env.TZ;
process.env.TZ = "UTC";

// Importar as funções de timezone
const {
  calculateBrazilDateRange,
  calculateBrazilDayRange,
  formatBrazilDateToLocal,
  getNowInBrazil,
  getTodayInBrazil,
  logTimezoneDebug,
} = require("../lib/utils/timezone.ts");

console.log("=== TESTE DE CORREÇÃO DE TIMEZONE ===\n");

// Simular data específica para teste consistente
const testDate = new Date("2024-08-15T12:00:00.000Z"); // 15 de agosto, meio-dia UTC
const originalDateNow = Date.now;
const originalDateConstructor = Date;
global.Date = class extends Date {
  constructor(...args) {
    if (args.length === 0) {
      super(testDate.getTime());
    } else {
      super(...args);
    }
  }
  static now() {
    return testDate.getTime();
  }
};

console.log("Data de teste (UTC):", testDate.toISOString());
console.log(
  "Timezone do servidor:",
  Intl.DateTimeFormat().resolvedOptions().timeZone
);

// Testar função getNowInBrazil
console.log("\n--- Teste getNowInBrazil ---");
const nowInBrazil = getNowInBrazil();
console.log("Agora no Brasil:", nowInBrazil.toISOString());
console.log("Formatado:", formatBrazilDateToLocal(nowInBrazil));

// Testar getTodayInBrazil
console.log("\n--- Teste getTodayInBrazil ---");
const todayInBrazil = getTodayInBrazil();
console.log("Hoje no Brasil:", todayInBrazil);

// Testar cálculo de período de 30 dias (método antigo vs novo)
console.log("\n--- Teste Período 30 dias ---");

// Método antigo (problemático)
console.log("MÉTODO ANTIGO (problemático):");
const oldEndDate = new Date();
oldEndDate.setHours(23, 59, 59, 999);
const oldStartDate = new Date();
oldStartDate.setMonth(oldStartDate.getMonth() - 1);
oldStartDate.setHours(0, 0, 0, 0);

console.log("  Start (UTC):", oldStartDate.toISOString());
console.log("  End (UTC):", oldEndDate.toISOString());
console.log("  Start formatado:", formatBrazilDateToLocal(oldStartDate));
console.log("  End formatado:", formatBrazilDateToLocal(oldEndDate));

// Método novo (corrigido)
console.log("\nMÉTODO NOVO (corrigido):");
const newDateRange = calculateBrazilDateRange(30);
console.log("  Start (Brazil):", newDateRange.startDate.toISOString());
console.log("  End (Brazil):", newDateRange.endDate.toISOString());
console.log(
  "  Start formatado:",
  formatBrazilDateToLocal(newDateRange.startDate)
);
console.log("  End formatado:", formatBrazilDateToLocal(newDateRange.endDate));

// Testar cálculo de dias
console.log("\n--- Teste Período 30 dias (day-based) ---");

// Método antigo (problemático)
console.log("MÉTODO ANTIGO (problemático):");
const oldEndDateTime = new Date();
const oldStartDateTime = new Date();
oldStartDateTime.setDate(oldEndDateTime.getDate() - 30 + 1);
oldStartDateTime.setHours(0, 0, 0, 0);
oldEndDateTime.setHours(23, 59, 59, 999);

console.log("  Start (UTC):", oldStartDateTime.toISOString());
console.log("  End (UTC):", oldEndDateTime.toISOString());

// Método novo (corrigido)
console.log("\nMÉTODO NOVO (corrigido):");
const newDayRange = calculateBrazilDayRange(30);
console.log("  Start (Brazil):", newDayRange.startDate.toISOString());
console.log("  End (Brazil):", newDayRange.endDate.toISOString());

// Comparar diferenças
console.log("\n--- ANÁLISE DAS DIFERENÇAS ---");
const startDiff =
  (newDateRange.startDate.getTime() - oldStartDate.getTime()) /
  (1000 * 60 * 60);
const endDiff =
  (newDateRange.endDate.getTime() - oldEndDate.getTime()) / (1000 * 60 * 60);

console.log(`Diferença no início: ${startDiff} horas`);
console.log(`Diferença no fim: ${endDiff} horas`);

if (Math.abs(startDiff) === 3 && Math.abs(endDiff) === 3) {
  console.log(
    "✅ CORREÇÃO FUNCIONANDO! Diferença de exatamente 3 horas (UTC-3)"
  );
} else {
  console.log("❌ Algo não está certo com a correção");
}

// Testar debug de timezone
console.log("\n--- Debug de Timezone ---");
logTimezoneDebug("Teste Script");

// Simular cenários específicos
console.log("\n--- CENÁRIOS ESPECÍFICOS ---");

// Cenário 1: Meia-noite UTC (21h no Brasil do dia anterior)
console.log("\nCenário 1: Meia-noite UTC");
const midnightUTC = new Date("2024-08-15T00:00:00.000Z");
Date.now = () => midnightUTC.getTime();
const brazilAtMidnightUTC = getNowInBrazil();
console.log("UTC:", midnightUTC.toISOString());
console.log("Brasil:", brazilAtMidnightUTC.toISOString());
console.log("Data Brasil:", formatBrazilDateToLocal(brazilAtMidnightUTC));

// Cenário 2: 3h UTC (meia-noite no Brasil)
console.log("\nCenário 2: 3h UTC (meia-noite no Brasil)");
const threeAMUTC = new Date("2024-08-15T03:00:00.000Z");
Date.now = () => threeAMUTC.getTime();
const brazilAtThreeAMUTC = getNowInBrazil();
console.log("UTC:", threeAMUTC.toISOString());
console.log("Brasil:", brazilAtThreeAMUTC.toISOString());
console.log("Data Brasil:", formatBrazilDateToLocal(brazilAtThreeAMUTC));

// Restaurar
global.Date = originalDateConstructor;
if (originalTimezone) {
  process.env.TZ = originalTimezone;
} else {
  delete process.env.TZ;
}

console.log("\n=== TESTE CONCLUÍDO ===");
