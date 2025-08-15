/**
 * Teste do cenário real: 14/07 a 14/08
 */

console.log('=== TESTE DO CENÁRIO REAL ===\n');

// Simular ambiente UTC (produção)
process.env.TZ = 'UTC';

// Simular que hoje é 14 de agosto de 2024, meio-dia UTC
const today = new Date('2024-08-14T12:00:00.000Z');

console.log('Simulando hoje como:', today.toISOString());
console.log('Timezone do servidor:', Intl.DateTimeFormat().resolvedOptions().timeZone);

// Teste: Calcular "último mês" (30 dias)
console.log('\n--- Cálculo de "Último Mês" (30 dias) ---');

// MÉTODO ANTIGO (usado atualmente em produção)
console.log('MÉTODO ANTIGO (produção atual):');
const oldEndDate = new Date(today);
oldEndDate.setHours(23, 59, 59, 999);

const oldStartDate = new Date(today);
oldStartDate.setMonth(oldStartDate.getMonth() - 1);
oldStartDate.setHours(0, 0, 0, 0);

console.log('  Start:', oldStartDate.toISOString());
console.log('  End:', oldEndDate.toISOString());
console.log('  Start (YYYY-MM-DD):', oldStartDate.toISOString().split('T')[0]);
console.log('  End (YYYY-MM-DD):', oldEndDate.toISOString().split('T')[0]);

// MÉTODO NOVO (com correção para timezone brasileiro)
console.log('\nMÉTODO NOVO (corrigido para Brasil):');

// Converter para horário brasileiro (UTC-3)
const todayInBrazil = new Date(today.getTime() - (3 * 60 * 60 * 1000));

const newEndDate = new Date(todayInBrazil);
newEndDate.setHours(23, 59, 59, 999);

const newStartDate = new Date(todayInBrazil);
newStartDate.setMonth(newStartDate.getMonth() - 1);
newStartDate.setHours(0, 0, 0, 0);

console.log('  Today in Brazil:', todayInBrazil.toISOString());
console.log('  Start:', newStartDate.toISOString());
console.log('  End:', newEndDate.toISOString());
console.log('  Start (YYYY-MM-DD):', newStartDate.toISOString().split('T')[0]);
console.log('  End (YYYY-MM-DD):', newEndDate.toISOString().split('T')[0]);

// Análise do problema
console.log('\n--- ANÁLISE DO PROBLEMA ---');

const oldStartFormatted = oldStartDate.toISOString().split('T')[0];
const oldEndFormatted = oldEndDate.toISOString().split('T')[0];
const newStartFormatted = newStartDate.toISOString().split('T')[0];
const newEndFormatted = newEndDate.toISOString().split('T')[0];

console.log('Método antigo (UTC):', `${oldStartFormatted} a ${oldEndFormatted}`);
console.log('Método novo (Brasil):', `${newStartFormatted} a ${newEndFormatted}`);

if (oldStartFormatted !== newStartFormatted || oldEndFormatted !== newEndFormatted) {
  console.log('\n✅ PROBLEMA CONFIRMADO!');
  console.log('   Em produção (UTC), quando o usuário vê "14/07 a 14/08",');
  console.log('   na realidade está buscando dados de "14/07 a 14/08" em UTC,');
  console.log('   que corresponde a "15/07 a 15/08" no horário brasileiro.');
  console.log('   Por isso os dados de 14/07 (Brasil) não aparecem!');
} else {
  console.log('\n❌ Não há diferença detectada');
}

// Teste específico: Verificar se dados de 14/07 Brasil apareceriam
console.log('\n--- TESTE: Dados de 14/07 Brasil ---');

const dataTesteBrasil = new Date('2024-07-14T10:00:00.000-03:00'); // 14/07 10h Brasil
const dataTesteUTC = new Date('2024-07-14T13:00:00.000Z'); // Mesmo momento em UTC

console.log('Data de teste (Brasil):', dataTesteBrasil.toISOString());
console.log('Data de teste (UTC):', dataTesteUTC.toISOString());
console.log('Data formatada (YYYY-MM-DD):', dataTesteBrasil.toISOString().split('T')[0]);

// Verificar se esta data estaria no range do método antigo
const dataEstaNoRangeAntigo = dataTesteBrasil >= oldStartDate && dataTesteBrasil <= oldEndDate;
const dataEstaNoRangeNovo = dataTesteBrasil >= newStartDate && dataTesteBrasil <= newEndDate;

console.log('\nEstaria no range do método antigo?', dataEstaNoRangeAntigo);
console.log('Estaria no range do método novo?', dataEstaNoRangeNovo);

if (!dataEstaNoRangeAntigo && dataEstaNoRangeNovo) {
  console.log('\n🎯 BINGO! Este é exatamente o problema!');
  console.log('   Dados de 14/07 Brasil NÃO aparecem com o método antigo,');
  console.log('   mas APARECERIAM com o método corrigido!');
}

console.log('\n=== TESTE CONCLUÍDO ===');
