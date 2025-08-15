/**
 * Teste do caso específico: dados de 14/07 não aparecem
 */

console.log('=== TESTE DO CASO ESPECÍFICO ===\n');

// Simular ambiente UTC (produção)
process.env.TZ = 'UTC';

// Simular que hoje é 14 de agosto de 2024, às 2h UTC (23h do dia 13 no Brasil)
const today = new Date('2024-08-14T02:00:00.000Z');

console.log('Simulando hoje como:', today.toISOString());
console.log('No Brasil seria:', new Date(today.getTime() - 3*60*60*1000).toISOString());
console.log('Timezone do servidor:', Intl.DateTimeFormat().resolvedOptions().timeZone);

// Teste: Calcular "último mês" (30 dias)
console.log('\n--- Cálculo de "Último Mês" às 2h UTC ---');

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
  console.log('   Diferença detectada entre os métodos!');
} else {
  console.log('\n❌ Não há diferença detectada neste horário');
}

// Teste com diferentes horários do dia
console.log('\n--- TESTE EM DIFERENTES HORÁRIOS ---');

const horarios = [
  '2024-08-14T00:00:00.000Z', // Meia-noite UTC (21h do dia 13 no Brasil)
  '2024-08-14T03:00:00.000Z', // 3h UTC (meia-noite no Brasil)
  '2024-08-14T12:00:00.000Z', // Meio-dia UTC (9h no Brasil)
  '2024-08-14T23:59:59.999Z', // Quase meia-noite UTC (quase 21h no Brasil)
];

horarios.forEach((horario, index) => {
  const testDate = new Date(horario);
  const testDateBrazil = new Date(testDate.getTime() - (3 * 60 * 60 * 1000));
  
  console.log(`\nTeste ${index + 1}: ${horario}`);
  console.log(`  UTC: ${testDate.toISOString().split('T')[0]}`);
  console.log(`  Brasil: ${testDateBrazil.toISOString().split('T')[0]}`);
  
  if (testDate.toISOString().split('T')[0] !== testDateBrazil.toISOString().split('T')[0]) {
    console.log('  🚨 DIFERENÇA DE DATA DETECTADA!');
  }
});

// Teste específico: Deal criado às 2h UTC do dia 14/07
console.log('\n--- TESTE: Deal criado às 2h UTC do dia 14/07 ---');

const dealDate = new Date('2024-07-14T02:00:00.000Z'); // 14/07 às 2h UTC
const dealDateBrazil = new Date(dealDate.getTime() - (3 * 60 * 60 * 1000)); // 13/07 às 23h Brasil

console.log('Deal criado em (UTC):', dealDate.toISOString());
console.log('Deal criado em (Brasil):', dealDateBrazil.toISOString());
console.log('Data do deal (YYYY-MM-DD):', dealDate.toISOString().split('T')[0]);
console.log('Data do deal no Brasil:', dealDateBrazil.toISOString().split('T')[0]);

// Verificar se este deal apareceria nos filtros
const dealEstaNoRangeAntigo = dealDate >= oldStartDate && dealDate <= oldEndDate;
const dealEstaNoRangeNovo = dealDate >= newStartDate && dealDate <= newEndDate;

console.log('\nDeal aparece no método antigo?', dealEstaNoRangeAntigo);
console.log('Deal aparece no método novo?', dealEstaNoRangeNovo);

if (dealEstaNoRangeAntigo !== dealEstaNoRangeNovo) {
  console.log('\n🎯 DIFERENÇA ENCONTRADA!');
  if (dealEstaNoRangeNovo && !dealEstaNoRangeAntigo) {
    console.log('   Deal aparece no método novo mas NÃO no antigo!');
  } else {
    console.log('   Deal aparece no método antigo mas NÃO no novo!');
  }
}

console.log('\n=== TESTE CONCLUÍDO ===');
