# Instruções para Aplicar a Correção de Pedidos Cancelados

## ⚠️ IMPORTANTE: Leia antes de aplicar

Esta correção resolve o problema de pedidos cancelados sendo contabilizados no cálculo de comissão dos parceiros.

## 📋 Pré-requisitos

1. Acesso ao Supabase Dashboard
2. Permissões de administrador no banco de dados
3. Backup recente do banco de dados (recomendado)

## 🔧 Passo a Passo

### 1. Aplicar a Migração SQL

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. Vá em **SQL Editor** no menu lateral
4. Clique em **New Query**
5. Copie e cole o conteúdo do arquivo: `supabase/migrations/exclude_cancelled_orders_from_commission.sql`
6. Clique em **Run** para executar a migração

### 2. Verificar a Migração

Execute esta query no SQL Editor para verificar se a migração foi aplicada corretamente:

```sql
-- Verificar se os índices foram criados
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'nuvemshop_orders' 
  AND indexname IN (
    'idx_nuvemshop_orders_status',
    'idx_nuvemshop_orders_payment_status_status'
  );
```

**Resultado esperado**: Deve retornar 2 linhas mostrando os índices criados.

### 3. Verificar Pedidos Cancelados

Execute esta query para ver quantos pedidos cancelados estavam sendo contabilizados incorretamente:

```sql
SELECT 
  COUNT(*) FILTER (WHERE payment_status = 'paid' AND status = 'cancelled') as pedidos_cancelados_pagos,
  COUNT(*) FILTER (WHERE payment_status = 'paid' AND status != 'cancelled') as pedidos_validos_pagos,
  COUNT(*) FILTER (WHERE payment_status = 'paid') as total_pedidos_pagos,
  SUM(CASE WHEN payment_status = 'paid' AND status = 'cancelled' THEN total ELSE 0 END) as receita_cancelada
FROM nuvemshop_orders;
```

**Resultado esperado**: 
- `pedidos_cancelados_pagos`: Número de pedidos que estavam sendo contabilizados incorretamente
- `receita_cancelada`: Valor total que estava inflando o faturamento

### 4. Verificar Caso Específico (Zenith - Taquara-RS)

Execute esta query para verificar os pedidos da franquia Taquara-RS:

```sql
SELECT 
  no.order_number,
  no.status,
  no.payment_status,
  no.total,
  no.subtotal,
  no.created_at_nuvemshop,
  no.products::jsonb
FROM nuvemshop_orders no
WHERE no.payment_status = 'paid'
  AND EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(no.products) as p
    WHERE p->>'name' ILIKE '%taquara%'
       OR (p->'properties' @> '[{"name": "Franquia", "value": "taquara-rs"}]'::jsonb)
  )
ORDER BY no.created_at_nuvemshop DESC;
```

**Resultado esperado**: 
- Deve mostrar apenas pedidos com `status != 'cancelled'`
- A soma dos valores deve ser R$ 284,80 (não R$ 427,20)

### 5. Testar no Dashboard

1. Acesse o dashboard de parceiros: `/partners/dashboard`
2. Selecione a marca **Zenith**
3. Selecione a franquia **Taquara-RS**
4. Verifique os valores:
   - **Faturamento Real**: Deve mostrar R$ 284,80
   - **Comissão (30%)**: Deve mostrar R$ 85,44

### 6. Testar na Home de Parceiros

1. Acesse a home de parceiros: `/partners/home`
2. Verifique se o valor de comissão está consistente com o dashboard
3. O valor deve ser R$ 85,44 para Zenith - Taquara-RS

## ✅ Checklist de Verificação

- [ ] Migração SQL executada com sucesso
- [ ] Índices criados corretamente
- [ ] Query de verificação mostra pedidos cancelados identificados
- [ ] Dashboard mostra R$ 284,80 para Zenith - Taquara-RS
- [ ] Comissão mostra R$ 85,44 (30% de R$ 284,80)
- [ ] Home de parceiros mostra valores consistentes
- [ ] Página de pedidos não mostra mais pedidos cancelados

## 🔄 Rollback (se necessário)

Se precisar reverter a migração, execute:

```sql
-- Remover filtro de status da função
CREATE OR REPLACE FUNCTION get_brand_commission_total(
  p_brand TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS DECIMAL(10,2)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    SUM(
      CASE 
        WHEN no.subtotal IS NOT NULL AND no.promotional_discount IS NOT NULL THEN
          ((no.subtotal - COALESCE(no.promotional_discount, 0)) * 
           COALESCE(
             (SELECT percentage FROM partners_commission_settings 
              WHERE brand = p_brand 
              ORDER BY updated_at DESC LIMIT 1), 
             5.0
           ) / 100)
        ELSE 0
      END
    ), 
    0
  )
  FROM nuvemshop_orders no
  JOIN nuvemshop_products np ON (no.products::jsonb @> jsonb_build_array(jsonb_build_object('name', np.name)))
  WHERE np.brand = p_brand
    AND no.payment_status = 'paid'
    -- Removido: AND no.status != 'cancelled'
    AND no.completed_at IS NOT NULL
    AND (p_start_date IS NULL OR no.completed_at::date >= p_start_date)
    AND (p_end_date IS NULL OR no.completed_at::date <= p_end_date);
$$;

-- Remover índices (opcional)
DROP INDEX IF EXISTS idx_nuvemshop_orders_status;
DROP INDEX IF EXISTS idx_nuvemshop_orders_payment_status_status;
```

**NOTA**: O rollback do código TypeScript requer reverter os commits no Git.

## 📊 Arquivos Modificados

### Migração SQL
- `supabase/migrations/exclude_cancelled_orders_from_commission.sql`

### Arquivos de API
- `app/api/partners/orders/route.ts`
- `app/api/partners/commission-summary/route.ts`
- `app/api/partners/top-product/route.ts`
- `app/api/nuvemshop-sync/orders/route.ts`

### Documentação
- `CORRECAO_PEDIDOS_CANCELADOS.md`
- `INSTRUCOES_APLICAR_CORRECAO.md` (este arquivo)

## 🐛 Troubleshooting

### Problema: Migração falha com erro de permissão
**Solução**: Certifique-se de estar usando uma conta com permissões de administrador no Supabase.

### Problema: Valores ainda aparecem incorretos no dashboard
**Solução**: 
1. Limpe o cache do navegador (Ctrl + Shift + R)
2. Verifique se a migração SQL foi aplicada corretamente
3. Verifique os logs do console do navegador para erros de API

### Problema: Índices não foram criados
**Solução**: Execute manualmente:
```sql
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_status ON nuvemshop_orders(status);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_payment_status_status ON nuvemshop_orders(payment_status, status);
```

## 📞 Suporte

Se encontrar problemas durante a aplicação da correção:
1. Verifique os logs do Supabase
2. Verifique os logs do console do navegador
3. Execute as queries de verificação acima
4. Consulte a documentação em `CORRECAO_PEDIDOS_CANCELADOS.md`

## 📝 Notas Finais

- Esta correção segue as boas práticas da API Nuvemshop
- Todos os cálculos de comissão agora excluem pedidos cancelados
- A performance foi otimizada com índices apropriados
- A documentação do banco de dados foi atualizada

