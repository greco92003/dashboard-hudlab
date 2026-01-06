# 🔍 Investigação: Marca "Mestrão Faixa Branca" Não Aparece

## 📋 Problema Identificado

A marca **"Mestrão Faixa Branca"** não está aparecendo na lista de brands em `/partners/home`, e os produtos novos não estão sendo sincronizados corretamente.

## ❌ Erro Principal

```
Error upserting product 316459904: {
  code: '42725',
  details: null,
  hint: 'Could not choose a best candidate function. You might need to add explicit type casts.',
  message: 'function generate_auto_affiliate_link_for_brand(text) is not unique'
}
```

## 🔎 Causa Raiz

O erro indica que existe **mais de uma definição** da função `generate_auto_affiliate_link_for_brand` no banco de dados PostgreSQL. Isso está causando:

1. **Falha no upsert de produtos** - Os produtos não conseguem ser salvos no banco
2. **Trigger não funciona** - O trigger que gera links de afiliado automaticamente falha
3. **Marcas não aparecem** - Como os produtos não são salvos com `sync_status = 'synced'`, a marca não aparece na lista

## 🛠️ Solução

### Passo 1: Aplicar Migration de Correção

Criamos uma migration que:
- Remove **todas** as versões duplicadas da função
- Recria apenas a versão correta com 2 parâmetros: `(brand_name TEXT, franchise_name TEXT DEFAULT NULL)`

**Arquivo:** `supabase/migrations/fix_duplicate_affiliate_link_function.sql`

### Passo 2: Aplicar no Supabase

**Opção A: Via Supabase Dashboard (RECOMENDADO)**

1. Acesse [Supabase Dashboard](https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg)
2. Vá para **SQL Editor** no menu lateral
3. Clique em **New Query**
4. Cole o conteúdo do arquivo `supabase/migrations/fix_duplicate_affiliate_link_function.sql`
5. Clique em **Run** (ou pressione Ctrl+Enter)
6. Verifique se aparece "Success. No rows returned"

**Opção B: Via CLI do Supabase**

```bash
# Se você tiver o Supabase CLI instalado
supabase db push
```

### Passo 3: Verificar a Correção

Execute o script de verificação para confirmar que a função foi corrigida:

```sql
-- Verificar se existe apenas UMA versão da função
SELECT 
  proname as function_name,
  pronargs as num_args,
  pg_get_function_arguments(oid) as arguments,
  pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'generate_auto_affiliate_link_for_brand';
```

**Resultado esperado:** Apenas 1 linha retornada

### Passo 4: Re-sincronizar Produtos

Após aplicar a correção, você precisa re-sincronizar os produtos:

1. Acesse `/partners/home` ou `/partners/products`
2. Clique no botão **"Sincronizar Produtos"**
3. Aguarde a sincronização completar
4. Verifique se a marca "Mestrão Faixa Branca" agora aparece

## 🔍 Investigação Adicional (Opcional)

Se após aplicar a correção a marca ainda não aparecer, execute o script de investigação:

**Arquivo:** `scripts/check-mestrao-brand.sql`

Este script verifica:
- Se os produtos da marca existem no banco
- Se estão com `published = true` e `sync_status = 'synced'`
- Se há links de afiliado criados
- Se há cupons gerados

## 📊 Como a Lista de Brands Funciona

A lista de brands em `/partners/home` é obtida através da função `get_available_brands()`:

```sql
SELECT 
  np.brand,
  COUNT(*) as product_count
FROM nuvemshop_products np
WHERE np.brand IS NOT NULL 
  AND np.brand != ''
  AND np.sync_status = 'synced'  -- ← IMPORTANTE!
GROUP BY np.brand
ORDER BY np.brand;
```

**Requisitos para uma marca aparecer:**
1. ✅ Ter produtos na tabela `nuvemshop_products`
2. ✅ Campo `brand` não pode ser NULL ou vazio
3. ✅ Campo `sync_status` deve ser `'synced'` ← **ESTE É O PROBLEMA**

## 🎯 Por Que os Produtos Não Estão com sync_status = 'synced'

O processo de upsert falha devido ao erro da função duplicada:

```typescript
// app/api/nuvemshop-sync/products/route.ts
const { data, error } = await supabase
  .from("nuvemshop_products")
  .upsert(processedProduct, {
    onConflict: "product_id",
    ignoreDuplicates: false,
  })
  .select("*");
```

Quando o upsert falha:
- O produto não é salvo no banco
- O `sync_status` não é definido como `'synced'`
- A marca não aparece na lista

## ✅ Checklist de Verificação

Após aplicar a correção, verifique:

- [ ] Migration aplicada com sucesso no Supabase
- [ ] Apenas 1 versão da função `generate_auto_affiliate_link_for_brand` existe
- [ ] Produtos sincronizados sem erros no terminal
- [ ] Marca "Mestrão Faixa Branca" aparece em `/partners/home`
- [ ] Link de afiliado criado automaticamente para a marca
- [ ] Cupom automático criado (código: `MESTRÃO15` ou similar)

## 📝 Notas Importantes

1. **Não adicione botões ou funcionalidades no front-end** - A correção é apenas no banco de dados
2. **A sincronização é automática** - Após corrigir a função, os produtos serão sincronizados automaticamente
3. **Triggers funcionarão novamente** - Links de afiliado e cupons serão gerados automaticamente para novas marcas

## 🆘 Se o Problema Persistir

Se após aplicar a correção a marca ainda não aparecer:

1. Execute o script `scripts/check-mestrao-brand.sql` no Supabase
2. Verifique os logs do terminal durante a sincronização
3. Compartilhe os resultados para análise adicional

