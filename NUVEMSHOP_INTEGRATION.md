# 🛍️ Integração Nuvemshop - Configuração Completa

## 📋 Resumo

Implementação de um sistema completo para armazenar e sincronizar dados da API do Nuvemshop no Supabase, incluindo **pedidos (orders)** e **produtos (products)**.

### 🎯 Dados Capturados

#### **ORDERS (Pedidos)**

- **Data da Venda**: `completed_at` (date)
- **Cliente**: `contact_name` (string)
- **Endereço**: `shipping_address` (JSONB) + `province` (string extraído)
- **Produtos**: `products` (JSONB array com name, price, quantity)
- **Valores**: `subtotal`, `shipping_cost_customer`, `coupon`, `promotional_discount`, `total_discount_amount`, `discount_coupon`, `discount_gateway`, `total`
- **Pagamento**: `payment_details` (JSONB) + `payment_method` (string extraído)

#### **PRODUCTS (Produtos)**

- **Imagem**: `images` (JSONB array) + `featured_image_src` (URL principal)
- **Produto**: `name` (JSONB multilíngue) + `name_pt` (português extraído)
- **Marca**: `brand` (string)
- **Variantes**: `variants` (JSONB array com preços)

## 🗄️ 1. Configuração do Banco de Dados

### Execute o Script SQL

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg)
2. Vá para **SQL Editor** no menu lateral
3. Execute o conteúdo do arquivo `nuvemshop-setup.sql`

### Tabelas Criadas

- `nuvemshop_orders` - Pedidos da Nuvemshop
- `nuvemshop_products` - Produtos da Nuvemshop
- `nuvemshop_sync_log` - Log de sincronizações

## ⚙️ 2. Variáveis de Ambiente

Adicione no arquivo `.env.local`:

```env
# Nuvemshop API Configuration
NUVEMSHOP_ACCESS_TOKEN=your-access-token-here
NUVEMSHOP_USER_ID=your-user-id-here

# Existing Supabase variables (already configured)
NEXT_PUBLIC_SUPABASE_URL=https://ubqervuhvwnztxmsodlg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Cron Job Security (if implementing automatic sync)
CRON_SECRET=your-secure-random-string-here
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Como Obter as Credenciais da Nuvemshop

1. Acesse o painel administrativo da Nuvemshop
2. Vá para **Configurações** > **API**
3. Gere um **Access Token** com as permissões necessárias:
   - `read_orders` - Para ler pedidos
   - `read_products` - Para ler produtos
4. Anote o **User ID** da sua loja (encontrado na URL da API)

## 🔄 3. Estrutura das Tabelas

### `nuvemshop_orders`

```sql
-- Campos principais para ORDERS
order_id TEXT UNIQUE          -- ID único do pedido
completed_at TIMESTAMP        -- Data da venda
contact_name TEXT            -- Nome do cliente
shipping_address JSONB       -- Endereço completo (objeto)
province TEXT               -- Estado/província extraído
products JSONB              -- Array de produtos
subtotal DECIMAL            -- Subtotal
total DECIMAL              -- Total final
payment_method TEXT        -- Método de pagamento
status TEXT               -- Status do pedido
```

### `nuvemshop_products`

```sql
-- Campos principais para PRODUCTS
product_id TEXT UNIQUE        -- ID único do produto (hidden)
name JSONB                   -- Nome multilíngue
name_pt TEXT                -- Nome em português
brand TEXT                  -- Marca
variants JSONB             -- Variantes com preços
images JSONB              -- Array de imagens
featured_image_src TEXT   -- URL da imagem principal
published BOOLEAN         -- Produto publicado
```

## 🚀 4. Próximos Passos

### 4.1 Criar APIs de Sincronização

Você precisará criar endpoints para sincronizar os dados:

```
app/api/nuvemshop-sync/orders/route.ts    - Sincronizar pedidos
app/api/nuvemshop-sync/products/route.ts  - Sincronizar produtos
app/api/nuvemshop-sync/full/route.ts      - Sincronização completa
```

### 4.2 Implementar Cron Jobs (Opcional)

Para sincronização automática, similar ao sistema de deals:

```
app/api/cron/sync-nuvemshop/route.ts      - Cron job automático
```

### 4.3 Criar Páginas de Visualização

Páginas para exibir os dados sincronizados:

```
app/nuvemshop-orders/page.tsx             - Lista de pedidos
app/nuvemshop-products/page.tsx           - Lista de produtos
app/nuvemshop-dashboard/page.tsx          - Dashboard geral
```

## 📊 5. Funções Auxiliares Criadas

### `get_last_nuvemshop_sync_status()`

Retorna o status da última sincronização:

```sql
SELECT * FROM get_last_nuvemshop_sync_status('orders');
SELECT * FROM get_last_nuvemshop_sync_status('products');
```

### `get_nuvemshop_orders_by_period()`

Busca pedidos por período:

```sql
SELECT * FROM get_nuvemshop_orders_by_period('2024-01-01', '2024-12-31');
```

## 🔧 6. Exemplo de Uso da API

### Buscar Pedidos da Nuvemshop

```typescript
// GET /api/nuvemshop/orders
const response = await fetch("/api/nuvemshop/orders?limit=100&page=1");
const orders = await response.json();
```

### Buscar Produtos da Nuvemshop

```typescript
// GET /api/nuvemshop/products
const response = await fetch("/api/nuvemshop/products?limit=100&page=1");
const products = await response.json();
```

## 🔒 7. Segurança e Permissões

- **RLS (Row Level Security)** habilitado em todas as tabelas
- Acesso restrito a usuários autenticados
- Logs de sincronização para auditoria
- Tratamento de erros e rate limiting

## 📈 8. Performance e Otimização

- **Índices** criados para consultas frequentes
- **JSONB** para dados estruturados flexíveis
- **Paginação** recomendada (limit=100)
- **Sync status** para controle de estado
- **Batch processing** para grandes volumes

## 🧪 9. Testes

Após a configuração, teste:

1. **Conectividade**: Teste as credenciais da API
2. **Sincronização**: Execute sync manual de alguns registros
3. **Consultas**: Verifique se os dados estão sendo salvos corretamente
4. **Performance**: Monitore tempo de resposta das consultas

## 📝 10. Logs e Monitoramento

A tabela `nuvemshop_sync_log` registra:

- Tipo de sincronização (orders, products, full)
- Status (running, completed, failed)
- Estatísticas (total, processados, novos, atualizados, erros)
- Tempo de execução
- Mensagens de erro detalhadas

## 🔄 11. Manutenção

- Monitore os logs de sincronização regularmente
- Configure alertas para falhas de sincronização
- Implemente limpeza automática de logs antigos
- Monitore uso de API rate limits da Nuvemshop

---

## 🚀 12. APIs de Sincronização Implementadas

### Endpoints Criados

1. **`POST /api/nuvemshop-sync/orders`** - Sincronizar pedidos

   - Parâmetros: `limit`, `page`, `status`
   - Retorna: estatísticas de sincronização

2. **`POST /api/nuvemshop-sync/products`** - Sincronizar produtos

   - Parâmetros: `limit`, `page`, `published`
   - Retorna: estatísticas de sincronização

3. **`POST /api/nuvemshop-sync/full`** - Sincronização completa
   - Parâmetros: `orders_limit`, `products_limit`, `orders_pages`, `products_pages`
   - Retorna: estatísticas consolidadas

### Endpoints de Consulta

1. **`GET /api/nuvemshop-sync/orders`** - Buscar pedidos salvos

   - Parâmetros: `limit`, `offset`, `start_date`, `end_date`

2. **`GET /api/nuvemshop-sync/products`** - Buscar produtos salvos

   - Parâmetros: `limit`, `offset`, `published`, `brand`, `search`

3. **`GET /api/nuvemshop-sync/full`** - Status de sincronizações
   - Parâmetros: `limit`
   - Retorna: logs recentes e status das últimas sincronizações

## 🧪 13. Como Testar

### 1. Configurar Variáveis de Ambiente

Adicione no `.env.local`:

```env
NUVEMSHOP_ACCESS_TOKEN=seu-token-aqui
NUVEMSHOP_USER_ID=seu-user-id-aqui
```

### 2. Testar Sincronização de Pedidos

```bash
# Sincronizar 10 pedidos da primeira página
curl -X POST "http://localhost:3000/api/nuvemshop-sync/orders?limit=10&page=1&status=any"
```

### 3. Testar Sincronização de Produtos

```bash
# Sincronizar 10 produtos publicados
curl -X POST "http://localhost:3000/api/nuvemshop-sync/products?limit=10&page=1&published=true"
```

### 4. Testar Sincronização Completa

```bash
# Sincronização completa (1 página de cada)
curl -X POST "http://localhost:3000/api/nuvemshop-sync/full?orders_limit=50&products_limit=50&orders_pages=1&products_pages=1"
```

### 5. Consultar Dados Salvos

```bash
# Buscar pedidos salvos
curl "http://localhost:3000/api/nuvemshop-sync/orders?limit=10"

# Buscar produtos salvos
curl "http://localhost:3000/api/nuvemshop-sync/products?limit=10"

# Ver status das sincronizações
curl "http://localhost:3000/api/nuvemshop-sync/full"
```

## ✅ Status da Implementação

- [x] **Tabelas criadas** no Supabase
- [x] **Tipos TypeScript** definidos
- [x] **Funções auxiliares** implementadas
- [x] **Políticas de segurança** configuradas
- [x] **APIs de sincronização** implementadas
- [x] **Endpoints de consulta** implementados
- [x] **Sistema de logs** implementado
- [ ] **Páginas de visualização** (próximo passo)
- [ ] **Cron jobs automáticos** (opcional)

---

**Próximo passo**: Criar páginas de visualização para exibir os dados sincronizados ou testar as APIs criadas.
