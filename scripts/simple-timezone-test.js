/**
 * Teste simples para verificar se a correção de timezone está funcionando
 */

console.log('=== TESTE SIMPLES DE TIMEZONE ===\n');

// Simular ambiente UTC (produção)
process.env.TZ = 'UTC';

console.log('Timezone do servidor:', Intl.DateTimeFormat().resolvedOptions().timeZone);

// Teste 1: Verificar se a data atual no Brasil está correta
console.log('\n--- Teste 1: Data atual no Brasil ---');
const now = new Date();
console.log('Agora (UTC):', now.toISOString());

// Calcular manualmente o que deveria ser no Brasil (UTC-3)
const brazilManual = new Date(now.getTime() - (3 * 60 * 60 * 1000));
console.log('Brasil manual (UTC-3):', brazilManual.toISOString());

// Teste 2: Verificar cálculo de período de 30 dias
console.log('\n--- Teste 2: Período de 30 dias ---');

// Método antigo (problemático em produção)
console.log('MÉTODO ANTIGO:');
const oldEndDate = new Date();
oldEndDate.setHours(23, 59, 59, 999);
const oldStartDate = new Date();
oldStartDate.setMonth(oldStartDate.getMonth() - 1);
oldStartDate.setHours(0, 0, 0, 0);

console.log('  Start:', oldStartDate.toISOString());
console.log('  End:', oldEndDate.toISOString());
console.log('  Start (YYYY-MM-DD):', oldStartDate.toISOString().split('T')[0]);
console.log('  End (YYYY-MM-DD):', oldEndDate.toISOString().split('T')[0]);

// Método novo (corrigido)
console.log('\nMÉTODO NOVO (com correção de timezone):');

// Simular o que a função corrigida deveria fazer
const nowInBrazil = new Date(now.getTime() - (3 * 60 * 60 * 1000));
const newEndDate = new Date(nowInBrazil);
newEndDate.setHours(23, 59, 59, 999);
const newStartDate = new Date(nowInBrazil);
newStartDate.setMonth(newStartDate.getMonth() - 1);
newStartDate.setHours(0, 0, 0, 0);

console.log('  Start:', newStartDate.toISOString());
console.log('  End:', newEndDate.toISOString());
console.log('  Start (YYYY-MM-DD):', newStartDate.toISOString().split('T')[0]);
console.log('  End (YYYY-MM-DD):', newEndDate.toISOString().split('T')[0]);

// Teste 3: Cenário específico do problema
console.log('\n--- Teste 3: Cenário do problema ---');
console.log('Simulando 15 de agosto de 2024, meio-dia UTC');

const problemDate = new Date('2024-08-15T12:00:00.000Z');
console.log('Data UTC:', problemDate.toISOString());

// No Brasil seria 15 de agosto, 9h da manhã
const brazilTime = new Date(problemDate.getTime() - (3 * 60 * 60 * 1000));
console.log('Data Brasil:', brazilTime.toISOString());

// Calcular "último mês" a partir desta data
const endDateBrazil = new Date(brazilTime);
endDateBrazil.setHours(23, 59, 59, 999);

const startDateBrazil = new Date(brazilTime);
startDateBrazil.setMonth(startDateBrazil.getMonth() - 1);
startDateBrazil.setHours(0, 0, 0, 0);

console.log('\nÚltimo mês no Brasil:');
console.log('  De:', startDateBrazil.toISOString().split('T')[0]);
console.log('  Até:', endDateBrazil.toISOString().split('T')[0]);

// Calcular "último mês" em UTC (método antigo)
const endDateUTC = new Date(problemDate);
endDateUTC.setHours(23, 59, 59, 999);

const startDateUTC = new Date(problemDate);
startDateUTC.setMonth(startDateUTC.getMonth() - 1);
startDateUTC.setHours(0, 0, 0, 0);

console.log('\nÚltimo mês em UTC (problemático):');
console.log('  De:', startDateUTC.toISOString().split('T')[0]);
console.log('  Até:', endDateUTC.toISOString().split('T')[0]);

// Análise
console.log('\n--- ANÁLISE ---');
const startDiff = startDateBrazil.toISOString().split('T')[0] !== startDateUTC.toISOString().split('T')[0];
const endDiff = endDateBrazil.toISOString().split('T')[0] !== endDateUTC.toISOString().split('T')[0];

if (startDiff || endDiff) {
  console.log('✅ PROBLEMA CONFIRMADO! As datas são diferentes entre UTC e Brasil');
  console.log('   Isso explica por que os dados de 14/07 não aparecem em produção');
} else {
  console.log('❌ Não há diferença detectada');
}

console.log('\n=== TESTE CONCLUÍDO ===');
