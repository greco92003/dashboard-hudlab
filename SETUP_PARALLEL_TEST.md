# Setup da Tabela de Teste Paralelo

## 🗄️ **Passo 1: Criar a Tabela no Supabase**

1. Acesse o **Supabase Dashboard**: https://supabase.com/dashboard
2. Selecione o projeto: **mockup-new**
3. Vá em **SQL Editor**
4. Execute o SQL do arquivo `sql/create_deals_parallel_test_table.sql`:

```sql
-- Copie e cole todo o conteúdo do arquivo sql/create_deals_parallel_test_table.sql
-- Ou execute linha por linha se preferir
```

## 🧪 **Passo 2: Testar a Sincronização Paralela**

### Teste Básico (Dry Run):
```bash
curl "http://localhost:3000/api/test/robust-deals-sync-parallel?dryRun=true&maxDeals=50"
```

### Teste Real (Insere na Tabela):
```bash
curl "http://localhost:3000/api/test/robust-deals-sync-parallel?maxDeals=100"
```

A resposta incluirá:
```json
{
  "success": true,
  "testBatch": "parallel_test_1703123456789",
  "viewDealsUrl": "http://localhost:3000/api/test/deals-parallel-test?testBatch=parallel_test_1703123456789",
  "summary": {
    "totalDeals": 100,
    "dealsUpserted": 100,
    "syncDurationSeconds": 15.2
  }
}
```

## 📊 **Passo 3: Visualizar os Deals Inseridos**

### URLs para Testar:

#### 1. **Buscar Todos os Deals de Teste:**
```
http://localhost:3000/api/test/deals-parallel-test
```

#### 2. **Buscar Deals de um Teste Específico:**
```
http://localhost:3000/api/test/deals-parallel-test?testBatch=parallel_test_1703123456789
```

#### 3. **Buscar com Paginação:**
```
http://localhost:3000/api/test/deals-parallel-test?limit=20&offset=0
```

#### 4. **Buscar com Filtros:**
```
http://localhost:3000/api/test/deals-parallel-test?status=1&orderBy=value&orderDirection=desc
```

#### 5. **Buscar por Data:**
```
http://localhost:3000/api/test/deals-parallel-test?startDate=2024-01-01&endDate=2024-12-31
```

## 🔧 **Parâmetros Disponíveis para Consulta:**

| Parâmetro | Tipo | Descrição | Exemplo |
|-----------|------|-----------|---------|
| `limit` | number | Número de registros por página | `?limit=50` |
| `offset` | number | Offset para paginação | `?offset=100` |
| `testBatch` | string | Filtrar por lote de teste específico | `?testBatch=parallel_test_123` |
| `status` | string | Filtrar por status do deal | `?status=1` |
| `orderBy` | string | Campo para ordenação | `?orderBy=value` |
| `orderDirection` | string | Direção da ordenação (asc/desc) | `?orderDirection=desc` |
| `startDate` | string | Data inicial (YYYY-MM-DD) | `?startDate=2024-01-01` |
| `endDate` | string | Data final (YYYY-MM-DD) | `?endDate=2024-12-31` |

## 🧹 **Passo 4: Limpar Dados de Teste (Opcional)**

### Limpar um Lote Específico:
```bash
curl -X DELETE "http://localhost:3000/api/test/deals-parallel-test?testBatch=parallel_test_123&confirm=true"
```

### Limpar Todos os Dados de Teste:
```bash
curl -X DELETE "http://localhost:3000/api/test/deals-parallel-test?confirm=true"
```

## 📈 **Exemplo de Resposta da API de Consulta:**

```json
{
  "success": true,
  "data": {
    "deals": [
      {
        "id": "uuid-here",
        "deal_id": 12345,
        "title": "Deal Example",
        "value": 1500.00,
        "currency": "BRL",
        "status": "1",
        "closing_date": "2024-01-15",
        "estado": "SP",
        "vendedor": "João Silva",
        "test_batch": "parallel_test_1703123456789",
        "created_at": "2024-01-10T10:30:00Z"
      }
    ],
    "pagination": {
      "total": 100,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    },
    "statistics": {
      "totalDeals": 100,
      "currentPage": 1,
      "totalPages": 5,
      "batchStats": {
        "parallel_test_1703123456789": {
          "total": 100,
          "synced": 100,
          "error": 0
        }
      }
    }
  }
}
```

## 🎯 **URLs Principais para Teste:**

### 1. **Executar Sincronização Paralela:**
```
POST http://localhost:3000/api/test/robust-deals-sync-parallel?maxDeals=100
```

### 2. **Visualizar Todos os Deals:**
```
GET http://localhost:3000/api/test/deals-parallel-test
```

### 3. **Visualizar Deals com Paginação:**
```
GET http://localhost:3000/api/test/deals-parallel-test?limit=50&offset=0
```

### 4. **Visualizar Deals de um Teste Específico:**
```
GET http://localhost:3000/api/test/deals-parallel-test?testBatch=SEU_TEST_BATCH_ID
```

## 🔍 **Como Monitorar:**

1. **Execute a sincronização** e anote o `testBatch` retornado
2. **Use o `viewDealsUrl`** fornecido na resposta para ver os dados
3. **Compare performance** com a implementação original
4. **Monitore logs** no console para acompanhar o progresso

## ⚡ **Próximos Passos:**

1. Execute o SQL para criar a tabela
2. Teste com poucos deals primeiro (`maxDeals=50`)
3. Use a URL fornecida para visualizar os resultados
4. Compare com a implementação original
5. Ajuste parâmetros conforme necessário

**Pronto para testar! 🚀**
