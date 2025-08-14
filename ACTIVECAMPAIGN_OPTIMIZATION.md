# ActiveCampaign API Optimization

## Problema Identificado

O endpoint `/api/active-campaign/deals-by-period` estava causando timeout 504 na Vercel devido a:

1. **Muitas requisições sequenciais**: Fazendo uma requisição individual para cada deal (~8000 deals)
2. **Falta de timeout nas requisições**: Requisições ficavam pendentes indefinidamente
3. **Processamento excessivo**: Tentando processar todos os deals sem limite de tempo
4. **Falta de fallback**: Sistema falhava completamente em caso de timeout

## Otimizações Implementadas

### 1. Timeout nas Requisições HTTP

- Adicionado timeout de 10 segundos para requisições gerais
- Timeout de 5 segundos para custom field data
- Timeout de 8 segundos para busca de deals
- Implementado AbortController para cancelar requisições

### 2. Batch Processing Otimizado

- Reduzido batch size de 100 para 5 deals por vez para custom fields
- Implementado delay de 200ms entre batches para evitar rate limiting
- Adicionado retry logic com até 2 tentativas por batch

### 3. Limitação de Dados

- **Desenvolvimento**: Máximo 200 deals
- **Produção**: Máximo 1000 deals
- Interrupção automática se atingir o limite

### 4. Sistema de Fallback

- Timeout de execução total: 25 segundos (buffer para Vercel)
- Retorna dados parciais em caso de timeout
- Utiliza cache quando disponível em caso de erro
- Monitoramento de tempo de execução em tempo real

### 5. Configuração de Timeout

- **Next.js**: maxDuration: 30 segundos
- **Vercel**: Configuração específica para endpoints ActiveCampaign
- Headers de cache otimizados

### 6. Cache Inteligente

- Cache mantido por 5 minutos (CACHE_TTL)
- Fallback para dados em cache em caso de erro
- Informações de debug incluem tempo de execução

## Arquivos Modificados

1. **`app/api/active-campaign/deals-by-period/route.ts`**

   - Implementação completa das otimizações
   - Sistema de fallback e timeout protection
   - Batch processing otimizado para custom fields

2. **`app/api/active-campaign/datafechamento/route.ts`**

   - Adicionado timeout nas requisições HTTP
   - Implementado processamento em lotes (batch size: 5)
   - Limitação de deals: 100 em produção, 50 em desenvolvimento
   - Timeout de 20 segundos

3. **`next.config.ts`**

   - Configurações experimentais para melhor performance

4. **`vercel.json`** (novo)
   - Configurações específicas de timeout para Vercel
   - Headers de cache otimizados
   - Timeouts diferenciados por endpoint

## Monitoramento

O sistema agora inclui logs detalhados para monitoramento:

- Tempo de execução total
- Número de deals processados
- Batches processados com sucesso/falha
- Timeouts e fallbacks ativados

## Resultados Esperados

1. **Redução significativa de timeouts 504**
2. **Resposta mais rápida** (< 30 segundos)
3. **Dados parciais** em vez de falha completa
4. **Melhor experiência do usuário** com fallbacks
5. **Logs detalhados** para debugging

## Uso

O endpoint continua funcionando da mesma forma:

```
GET /api/active-campaign/deals-by-period?period=30&fieldId=5&refresh=true
```

Parâmetros:

- `period`: Número de dias (padrão: 30)
- `fieldId`: ID do campo customizado (padrão: "5")
- `refresh`: Forçar refresh do cache (padrão: false)

## Próximos Passos

Se ainda houver problemas de timeout:

1. **Reduzir ainda mais o batch size** (de 5 para 3 ou 2)
2. **Implementar paginação no frontend** para processar deals em chunks
3. **Usar background jobs** para processamento pesado
4. **Implementar WebSockets** para updates em tempo real
5. **Considerar cache no Redis** para dados mais persistentes
