# URLs para Testar o Robust Deals Sync Paralelo

## 🚀 **URLs de Sincronização**

### 1. **Teste com Poucos Deals (Recomendado para primeiro teste)**
```
http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&maxDeals=50
```
- ✅ Modo dry run (não altera banco)
- ✅ Apenas 50 deals para teste rápido

### 2. **Teste com 100 Deals**
```
http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&maxDeals=100
```
- ✅ Modo dry run
- ✅ 100 deals para teste médio

### 3. **Teste com 500 Deals**
```
http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&maxDeals=500
```
- ✅ Modo dry run
- ✅ 500 deals para teste mais robusto

### 4. **🔥 TODOS OS DEALS (Dry Run) - NOVA OPÇÃO**
```
http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&allDeals=true
```
- ✅ Modo dry run
- ⚡ **Processa TODOS os deals disponíveis**
- 🚨 **Use com cuidado - pode demorar bastante**

### 5. **TODOS OS DEALS (Inserção Real)**
```
http://localhost:3000/api/test/robust-deals-sync-parallel?allDeals=true
```
- ❌ Modo real (insere no banco)
- ⚡ **Processa TODOS os deals disponíveis**
- 🚨 **CUIDADO: Vai inserir todos os deals na tabela de teste**

### 6. **Sincronização Real com Limite**
```
http://localhost:3000/api/test/robust-deals-sync-parallel?maxDeals=100
```
- ❌ Modo real (insere no banco)
- ✅ Limitado a 100 deals

## 📊 **URLs de Consulta dos Resultados**

### 1. **Ver Todos os Deals de Teste**
```
http://localhost:3000/api/test/deals-parallel-test
```

### 2. **Ver com Paginação (50 por página)**
```
http://localhost:3000/api/test/deals-parallel-test?limit=50&offset=0
```

### 3. **Ver Deals de um Teste Específico**
```
http://localhost:3000/api/test/deals-parallel-test?testBatch=SEU_TEST_BATCH_ID
```
*Substitua `SEU_TEST_BATCH_ID` pelo valor retornado na sincronização*

### 4. **Ver Deals Ordenados por Valor (Maior para Menor)**
```
http://localhost:3000/api/test/deals-parallel-test?orderBy=value&orderDirection=desc&limit=20
```

### 5. **Ver Deals por Status**
```
http://localhost:3000/api/test/deals-parallel-test?status=1&limit=30
```

### 6. **Ver Deals por Período**
```
http://localhost:3000/api/test/deals-parallel-test?startDate=2024-01-01&endDate=2024-12-31&limit=100
```

## 🧪 **Sequência Recomendada de Testes**

### **Teste 1: Validação Básica**
```bash
# 1. Teste pequeno para validar funcionamento
curl "http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&maxDeals=50"

# 2. Ver resultado
curl "http://localhost:3000/api/test/deals-parallel-test?limit=10"
```

### **Teste 2: Performance Média**
```bash
# 1. Teste com mais deals
curl "http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&maxDeals=500"

# 2. Analisar métricas de performance na resposta
```

### **Teste 3: Todos os Deals (Dry Run)**
```bash
# 1. Teste com TODOS os deals (sem inserir no banco)
curl "http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&allDeals=true"

# 2. Analisar tempo total e performance
```

### **Teste 4: Inserção Real (Cuidado!)**
```bash
# 1. Inserir alguns deals reais para teste
curl "http://localhost:3000/api/test/robust-deals-sync-parallel?maxDeals=100"

# 2. Ver deals inseridos usando a URL retornada na resposta
# Exemplo: curl "http://localhost:3000/api/test/deals-parallel-test?testBatch=parallel_test_1703123456789"
```

## 📈 **Comparação de Performance**

### **Implementação Original vs Paralela**
```bash
# 1. Teste original (para comparação)
time curl "http://localhost:3000/api/test/robust-deals-sync?dryRun=true&maxDeals=500"

# 2. Aguarde alguns segundos

# 3. Teste paralelo
time curl "http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&maxDeals=500"
```

## 🔧 **Parâmetros Disponíveis**

### **Para Sincronização:**
| Parâmetro | Tipo | Descrição | Exemplo |
|-----------|------|-----------|---------|
| `dryRun` | boolean | Não altera banco, apenas testa | `?dryRun=true` |
| `allDeals` | boolean | **NOVO**: Processa todos os deals | `?allDeals=true` |
| `maxDeals` | number | Limita número de deals | `?maxDeals=100` |
| `clearFirst` | boolean | Limpa tabela antes | `?clearFirst=true` |

### **Para Consulta:**
| Parâmetro | Tipo | Descrição | Exemplo |
|-----------|------|-----------|---------|
| `limit` | number | Registros por página | `?limit=50` |
| `offset` | number | Offset para paginação | `?offset=100` |
| `testBatch` | string | Filtrar por lote específico | `?testBatch=parallel_test_123` |
| `orderBy` | string | Campo para ordenação | `?orderBy=value` |
| `orderDirection` | string | Direção (asc/desc) | `?orderDirection=desc` |

## 🚨 **Avisos Importantes**

### **⚠️ Uso do `allDeals=true`:**
- **Pode processar milhares de deals**
- **Pode demorar vários minutos**
- **Use sempre com `dryRun=true` primeiro**
- **Monitore logs para acompanhar progresso**

### **⚠️ Modo Real (sem dryRun):**
- **Insere dados na tabela `deals_parallel_test`**
- **Use apenas após validar com dry run**
- **Considere usar `maxDeals` para limitar**

### **⚠️ Rate Limiting:**
- **Respeita limite de 5 req/sec do ActiveCampaign**
- **Pode ser mais lento com muitos deals**
- **Monitore logs para ver progresso**

## 🧹 **Limpeza de Dados**

### **Limpar Dados de um Teste Específico:**
```bash
curl -X DELETE "http://localhost:3000/api/test/deals-parallel-test?testBatch=SEU_TEST_BATCH&confirm=true"
```

### **Limpar Todos os Dados de Teste:**
```bash
curl -X DELETE "http://localhost:3000/api/test/deals-parallel-test?confirm=true"
```

## 🎯 **URL Principal para Teste Completo**

### **🔥 TESTE TODOS OS DEALS (DRY RUN):**
```
http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&allDeals=true
```

**Esta URL vai processar TODOS os deals disponíveis no ActiveCampaign sem inserir no banco, permitindo avaliar a performance real da implementação paralela! 🚀**
