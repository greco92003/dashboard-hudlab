# Correção: Pedidos Cancelados no Cálculo de Comissão

## Problema Identificado

Pedidos com status `cancelled` (cancelados) estavam sendo contabilizados no cálculo de comissão dos parceiros, resultando em valores incorretos.

### Caso Específico Reportado
- **Marca/Franquia**: Zenith - Taquara-RS
- **Vendas Reais**: R$ 284,80
- **Valor Mostrado no Dashboard**: R$ 427,20 (incorreto)
- **Comissão Esperada**: 30% de R$ 284,80 = R$ 85,44
- **Diferença**: R$ 142,40 (provavelmente de um pedido cancelado)

## Causa Raiz

Segundo a [documentação da API Nuvemshop](https://tiendanube.github.io/api-documentation/resources/order):

### Status de Pedidos
- **status**: Status do pedido
  - `open` - Aberto
  - `closed` - Fechado
  - `cancelled` - **Cancelado**

- **payment_status**: Status do pagamento
  - `pending` - Pendente
  - `authorized` - Autorizado
  - `paid` - **Pago**
  - `voided` - Anulado
  - `refunded` - Reembolsado

### O Problema
Um pedido pode ter:
- `payment_status = "paid"` (pagamento foi processado)
- `status = "cancelled"` (pedido foi cancelado)

O código anterior filtrava apenas por `payment_status = "paid"`, **sem verificar se o pedido estava cancelado**.

## Solução Implementada

### 1. Migração SQL
Arquivo: `supabase/migrations/exclude_cancelled_orders_from_commission.sql`

- Atualiza a função `get_brand_commission_total()` para excluir pedidos cancelados
- Adiciona índices para melhor performance:
  - `idx_nuvemshop_orders_status`
  - `idx_nuvemshop_orders_payment_status_status`
- Adiciona comentários na documentação do banco

### 2. Arquivos de API Atualizados

Todos os endpoints que calculam comissão agora incluem o filtro `.neq("status", "cancelled")`:

#### a) `/app/api/partners/orders/route.ts`
```typescript
.eq("payment_status", "paid")
.neq("status", "cancelled") // Exclude cancelled orders
```

#### b) `/app/api/partners/commission-summary/route.ts`
```typescript
.eq("payment_status", "paid")
.neq("status", "cancelled") // Exclude cancelled orders
```

#### c) `/app/api/partners/top-product/route.ts`
```typescript
.eq("payment_status", "paid")
.neq("status", "cancelled") // Exclude cancelled orders
```

#### d) `/app/api/nuvemshop-sync/orders/route.ts`
```typescript
.eq("payment_status", "paid")
.neq("status", "cancelled") // Exclude cancelled orders
```

## Como Aplicar a Correção

### 1. Aplicar a Migração SQL

No Supabase Dashboard:
1. Vá em **SQL Editor**
2. Abra o arquivo `supabase/migrations/exclude_cancelled_orders_from_commission.sql`
3. Execute o script

### 2. Verificar a Correção

Execute esta query no SQL Editor para verificar quantos pedidos cancelados estavam sendo contabilizados:

```sql
SELECT 
  COUNT(*) FILTER (WHERE payment_status = 'paid' AND status = 'cancelled') as cancelled_paid_orders,
  COUNT(*) FILTER (WHERE payment_status = 'paid' AND status != 'cancelled') as valid_paid_orders,
  COUNT(*) FILTER (WHERE payment_status = 'paid') as total_paid_orders,
  SUM(CASE WHEN payment_status = 'paid' AND status = 'cancelled' THEN total ELSE 0 END) as cancelled_revenue
FROM nuvemshop_orders;
```

### 3. Verificar por Marca/Franquia

Para verificar especificamente a Zenith - Taquara-RS:

```sql
SELECT 
  no.order_number,
  no.status,
  no.payment_status,
  no.total,
  no.subtotal,
  no.created_at_nuvemshop,
  no.products
FROM nuvemshop_orders no
WHERE no.payment_status = 'paid'
  AND EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(no.products) as p
    WHERE p->>'name' ILIKE '%taquara%'
  )
ORDER BY no.created_at_nuvemshop DESC;
```

## Impacto da Correção

### Antes
- Pedidos com `payment_status = "paid"` eram contabilizados, **independente do status**
- Pedidos cancelados inflavam artificialmente o faturamento e comissão

### Depois
- Apenas pedidos com `payment_status = "paid"` **E** `status != "cancelled"` são contabilizados
- Valores de faturamento e comissão refletem apenas vendas efetivadas

## Páginas Afetadas

As seguintes páginas agora mostrarão valores corretos:

1. **Dashboard de Parceiros** (`/app/partners/dashboard/page.tsx`)
   - Faturamento Real
   - Valor Total de Comissão
   - Gráficos de vendas

2. **Home de Parceiros** (`/app/partners/home/page.tsx`)
   - Resumo de Comissão
   - Saldo a Receber

3. **Pedidos de Parceiros** (`/app/partners/orders/page.tsx`)
   - Lista de pedidos (não mostrará mais pedidos cancelados)

## Boas Práticas Implementadas

1. **Filtro Consistente**: Todos os endpoints que calculam comissão usam o mesmo filtro
2. **Índices de Performance**: Criados índices para otimizar queries
3. **Documentação**: Comentários no código e no banco de dados explicam a lógica
4. **Seguindo a API Nuvemshop**: Implementação alinhada com a documentação oficial

## Próximos Passos

1. Aplicar a migração SQL no ambiente de produção
2. Verificar os valores no dashboard após a correção
3. Confirmar que o caso da Zenith - Taquara-RS agora mostra R$ 284,80 (não R$ 427,20)
4. Confirmar que a comissão agora mostra R$ 85,44 (30% de R$ 284,80)

## Referências

- [Nuvemshop API - Order Resource](https://tiendanube.github.io/api-documentation/resources/order)
- [Nuvemshop API - Order Status Documentation](https://docs.nuvemshop.com.br/help/order)

