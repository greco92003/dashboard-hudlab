# Correções dos Webhooks do Nuvemshop

## Problemas Identificados

Através da análise dos logs de webhook, identifiquei que os webhooks de `product/updated` e `product/deleted` estavam falhando com os seguintes erros:

1. **Timeout de Statement**: `canceling statement due to statement timeout`
2. **Operações lentas**: Upserts demorados devido a dados JSON complexos
3. **Falta de retry automático**: Webhooks falhados não eram reprocessados
4. **Ausência de otimizações**: Sempre fazendo fetch completo da API mesmo para produtos não alterados

## Correções Implementadas

### 1. Timeout de API Otimizado
- **Arquivo**: `lib/nuvemshop/webhook-processor.ts`
- **Mudança**: Adicionado timeout de 8 segundos para requisições à API do Nuvemshop
- **Benefício**: Evita que webhooks fiquem "pendurados" esperando resposta da API

```typescript
// Implementar timeout de 8 segundos para evitar timeouts de webhook
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 8000);
```

### 2. Otimização de Upsert
- **Arquivo**: `lib/nuvemshop/webhook-processor.ts`
- **Mudança**: Verificação se produto foi realmente alterado antes do upsert completo
- **Benefício**: Reduz operações desnecessárias no banco de dados

```typescript
// Se produto existe e não foi atualizado, apenas atualizar timestamp
if (existingProduct && 
    existingProduct.api_updated_at === processedProduct.api_updated_at) {
  // Apenas update do timestamp, não upsert completo
}
```

### 3. Retry Inteligente
- **Arquivo**: `lib/nuvemshop/webhook-processor.ts`
- **Mudança**: Melhorado algoritmo de retry para incluir timeouts de statement
- **Benefício**: Webhooks com timeout são automaticamente reprocessados

```typescript
// Tentar novamente para timeouts de statement do banco
if (errorMessage.includes("statement timeout") || 
    errorMessage.includes("canceling statement due to statement timeout")) {
  return true;
}
```

### 4. API de Retry Manual
- **Arquivo**: `app/api/webhooks/retry/route.ts` (NOVO)
- **Mudança**: Nova API para retry individual e em lote
- **Benefício**: Permite reprocessar webhooks falhados manualmente

### 5. Interface de Administração Melhorada
- **Arquivo**: `app/admin/webhooks/page.tsx`
- **Mudança**: Botões para retry em lote na interface
- **Benefício**: Facilita o gerenciamento de webhooks falhados

## Como Testar as Correções

### 1. Executar Script de Diagnóstico
```bash
node scripts/test-webhook-fixes.js
```

### 2. Verificar Logs na Interface
1. Acesse `/admin/webhooks`
2. Vá para a aba "Logs de Webhooks"
3. Verifique se há menos webhooks com status "failed"
4. Use os botões "Retry Produtos" e "Retry Todos" para reprocessar falhas

### 3. Monitorar Webhooks em Tempo Real
1. Edite um produto no Nuvemshop
2. Verifique se o webhook `product/updated` é processado com sucesso
3. Exclua um produto no Nuvemshop
4. Verifique se o webhook `product/deleted` é processado com sucesso

### 4. Verificar Performance
- Webhooks devem processar em menos de 2 segundos
- Taxa de sucesso deve ser > 95%
- Timeouts devem ser raros (< 1%)

## Melhorias de Performance Esperadas

1. **Redução de Timeouts**: De ~100% para < 5%
2. **Tempo de Processamento**: De 10-15s para 1-3s
3. **Taxa de Sucesso**: De ~0% para > 95%
4. **Retry Automático**: Webhooks falhados são reprocessados automaticamente

## Monitoramento Contínuo

### Métricas a Acompanhar
1. **Taxa de Sucesso por Evento**:
   - `product/created`: Deve manter > 95%
   - `product/updated`: Deve melhorar para > 95%
   - `product/deleted`: Deve melhorar para > 95%

2. **Tempo de Processamento**:
   - Média < 2 segundos
   - 95º percentil < 5 segundos

3. **Erros de Timeout**:
   - < 1% dos webhooks
   - Retry automático deve resolver a maioria

### Alertas Recomendados
- Taxa de sucesso < 90% em 1 hora
- Mais de 10 timeouts em 1 hora
- Mais de 50 webhooks falhados acumulados

## Próximos Passos

1. **Monitorar por 24-48h** para validar as correções
2. **Ajustar timeouts** se necessário (atualmente 8s)
3. **Implementar cache** para produtos frequentemente atualizados
4. **Adicionar métricas** no dashboard principal

## Comandos Úteis

```bash
# Testar correções
node scripts/test-webhook-fixes.js

# Verificar logs de webhook recentes
node scripts/diagnose-webhooks.js

# Retry em lote via API
curl -X PUT "http://localhost:3000/api/webhooks/retry?event=product/updated&limit=10"

# Retry individual via API
curl -X POST "http://localhost:3000/api/webhooks/retry" \
  -H "Content-Type: application/json" \
  -d '{"logId": "webhook-log-id"}'
```
