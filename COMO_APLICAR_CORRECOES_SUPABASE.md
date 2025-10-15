# 🚀 Como Aplicar as Correções do Supabase

Este guia rápido mostra como aplicar todas as correções de segurança e performance do Supabase.

## ⚡ Aplicação Rápida (Recomendado)

### Passo 1: Aplicar Correções Automáticas

Execute os dois scripts em sequência:

```bash
# 1. Corrigir Function Search Path (Segurança)
node scripts/apply-function-security-fix.js

# 2. Otimizar RLS Policies (Performance)
node scripts/apply-rls-performance-optimization.js
```

### Passo 2: Ações Manuais no Painel do Supabase

#### A) Habilitar Leaked Password Protection

1. Acesse: https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/auth/policies
2. Vá em **Authentication** → **Policies** → **Password**
3. Ative: ✅ **Enable Leaked Password Protection**
4. Salve

#### B) Atualizar PostgreSQL (Opcional mas Recomendado)

1. Acesse: https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/settings/infrastructure
2. Vá em **Settings** → **Infrastructure** → **Database**
3. Procure por **Postgres Version**
4. Clique em **Upgrade** se disponível
5. Siga as instruções

⚠️ **IMPORTANTE:** Faça backup antes de atualizar o PostgreSQL!

---

## 📋 Aplicação Manual (Alternativa)

Se preferir aplicar manualmente via SQL Editor:

### 1. Correção de Funções

1. Acesse: https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/sql/new
2. Copie o conteúdo de: `supabase/migrations/fix_function_search_path_security.sql`
3. Cole no SQL Editor
4. Clique em **Run**

### 2. Otimização de RLS

1. Acesse: https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/sql/new
2. Copie o conteúdo de: `supabase/migrations/optimize_rls_policies_performance.sql`
3. Cole no SQL Editor
4. Clique em **Run**

---

## ✅ Verificação

Após aplicar as correções, verifique se funcionou:

### 1. Verificar Issues Resolvidos

1. Acesse: https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/advisors
2. Vá em **Database** → **Advisors**
3. Verifique se os issues diminuíram de ~40 para ~2

### 2. Verificar Funções Corrigidas

Execute no SQL Editor:

```sql
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  proconfig as search_path_config
FROM pg_proc 
WHERE proname IN (
  'update_deals_tracking_updated_at',
  'get_deals_needing_check',
  'get_deals_with_custom_field_5',
  'update_partners_commission_settings_updated_at',
  'trigger_update_deals_tracking_updated_at_func',
  'update_updated_at_column'
);
```

**Esperado:** Todas devem ter `search_path_config` = `{public,pg_temp}`

### 3. Verificar RLS Otimizado

Execute no SQL Editor:

```sql
SELECT 
  tablename,
  policyname,
  qual
FROM pg_policies 
WHERE tablename IN (
  'partners_commission_settings',
  'deals_sync_log',
  'meta_insights'
)
ORDER BY tablename, policyname;
```

**Esperado:** Todas as políticas devem usar `(select auth.xxx())` ao invés de `auth.xxx()`

---

## 📊 Resultados Esperados

Após aplicar todas as correções:

### Issues Resolvidos:
- ✅ **~38 de 40+ issues** (95%)
- ⚠️ **2 issues restantes** (requerem ação manual)

### Melhorias de Performance:
- 🚀 **10-100x mais rápido** em queries com RLS em tabelas grandes
- ⚡ **auth.uid()** avaliado 1 vez ao invés de N vezes
- 📈 **Queries otimizadas** em 16 tabelas diferentes

### Melhorias de Segurança:
- 🔒 **6 funções** protegidas contra SQL injection
- 🛡️ **32+ políticas RLS** otimizadas
- 🔐 **Proteção contra senhas vazadas** (se habilitada)

---

## 🆘 Problemas?

### Erro: "exec_sql function not found"

Se o script falhar com esse erro, aplique manualmente via SQL Editor (veja seção "Aplicação Manual").

### Erro: "permission denied"

Certifique-se de que está usando a `SUPABASE_SERVICE_ROLE_KEY` correta no `.env.local`.

### Issues ainda aparecem

Aguarde 5-10 minutos após aplicar as correções. O Supabase pode levar um tempo para atualizar a lista de issues.

---

## 📚 Documentação Completa

Para mais detalhes, consulte:
- `SUPABASE_SECURITY_FIXES.md` - Guia completo com explicações técnicas
- `supabase/migrations/` - Arquivos SQL das correções

---

## 🎯 Próximos Passos

Após aplicar as correções:

1. ✅ Teste sua aplicação para garantir que tudo funciona
2. 📊 Monitore a performance das queries
3. 🔍 Verifique os logs para possíveis erros
4. 📈 Acompanhe os issues no painel do Supabase

---

**Última atualização:** 2025-10-09

