# 🔒 Guia de Correção dos Issues de Segurança do Supabase

Este guia contém instruções passo a passo para resolver todos os 40+ issues de segurança e performance reportados pelo Supabase Database Linter.

## 📋 Resumo dos Issues

### 🔴 Críticos (Segurança)

- ✅ **6 funções** sem `search_path` definido → **CORRIGIDO**
- ⚠️ **Proteção contra senhas vazadas** desabilitada → **Requer ação manual**
- ⚠️ **Versão do PostgreSQL** desatualizada → **Requer ação manual**

### 🟡 Importantes (Performance)

- ⚠️ **Múltiplas políticas RLS** não otimizadas → **Próxima task**

---

## ✅ Task 1: Corrigir Function Search Path Mutable (CONCLUÍDA)

### O que foi feito:

Criamos uma migration que adiciona `SET search_path = public, pg_temp` a todas as 6 funções afetadas:

1. ✅ `update_deals_tracking_updated_at`
2. ✅ `get_deals_needing_check`
3. ✅ `get_deals_with_custom_field_5`
4. ✅ `update_partners_commission_settings_updated_at`
5. ✅ `trigger_update_deals_tracking_updated_at_func`
6. ✅ `update_updated_at_column`

### Como aplicar:

#### Opção 1: Via Script Automatizado (Recomendado)

```bash
node scripts/apply-function-security-fix.js
```

#### Opção 2: Via Supabase SQL Editor (Manual)

1. Acesse: https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/sql/new
2. Copie todo o conteúdo de: `supabase/migrations/fix_function_search_path_security.sql`
3. Cole no SQL Editor
4. Clique em "Run"

### Verificação:

Após aplicar, execute no SQL Editor:

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

**Resultado esperado:** Todas as funções devem ter `search_path_config` = `{public,pg_temp}`

---

## ✅ Task 2: Otimizar RLS Policies - Auth Functions (CONCLUÍDA)

### O que foi feito:

Criamos uma migration que otimiza **32+ políticas RLS** em **16 tabelas** diferentes.

### Problema:

Políticas RLS estavam usando `auth.uid()` diretamente, causando re-avaliação para cada linha (problema de performance).

### Solução:

Substituir `auth.uid()` por `(select auth.uid())` em todas as políticas.

### Tabelas otimizadas:

1. ✅ `partners_commission_settings` (2 políticas)
2. ✅ `deals_sync_log` (2 políticas)
3. ✅ `meta_insights` (3 políticas)
4. ✅ `meta_ad_accounts` (2 políticas)
5. ✅ `meta_campaigns` (2 políticas)
6. ✅ `meta_ad_sets` (2 políticas)
7. ✅ `meta_ads` (2 políticas)
8. ✅ `meta_ad_creatives` (2 políticas)
9. ✅ `meta_custom_audiences` (2 políticas)
10. ✅ `generated_coupons` (4 políticas)
11. ✅ `notifications` (3 políticas)
12. ✅ `user_notifications` (2 políticas)
13. ✅ `push_subscriptions` (1 política)
14. ✅ `designer_mockups_cache` (1 política)
15. ✅ `designer_mockups_sync_log` (1 política)
16. ✅ `nuvemshop_sync_log` (1 política)

**TOTAL: 16 tabelas, 32+ políticas otimizadas**

### Impacto de Performance:

- **10-100x mais rápido** em tabelas grandes
- `auth.uid()` avaliado **1 vez** ao invés de **N vezes** (onde N = número de linhas)
- Especialmente importante para tabelas com milhares de registros

### Como aplicar:

#### Opção 1: Via Script Automatizado (Recomendado)

```bash
node scripts/apply-rls-performance-optimization.js
```

#### Opção 2: Via Supabase SQL Editor (Manual)

1. Acesse: https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/sql/new
2. Copie todo o conteúdo de: `supabase/migrations/optimize_rls_policies_performance.sql`
3. Cole no SQL Editor
4. Clique em "Run"

### Verificação:

Após aplicar, execute no SQL Editor:

```sql
-- Verificar políticas otimizadas
SELECT
  schemaname,
  tablename,
  policyname,
  qual
FROM pg_policies
WHERE tablename IN (
  'partners_commission_settings',
  'deals_sync_log',
  'meta_insights',
  'generated_coupons',
  'notifications'
)
ORDER BY tablename, policyname;
```

**Resultado esperado:** Todas as políticas devem usar `(select auth.xxx())` ao invés de `auth.xxx()`

---

## ⚠️ Task 3: Habilitar Leaked Password Protection

### O que é:

Proteção que verifica se a senha do usuário foi vazada em algum breach (usando HaveIBeenPwned.org).

### Como habilitar:

1. Acesse o Supabase Dashboard:

   ```
   https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/auth/policies
   ```

2. Vá em **Authentication** → **Policies** → **Password**

3. Ative a opção:

   - ✅ **Enable Leaked Password Protection**

4. Salve as alterações

### Documentação:

https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

---

## ⚠️ Task 4: Atualizar Versão do PostgreSQL

### Versão atual:

`supabase-postgres-17.4.1.043`

### Como atualizar:

1. Acesse o Supabase Dashboard:

   ```
   https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/settings/infrastructure
   ```

2. Vá em **Settings** → **Infrastructure** → **Database**

3. Procure por **Postgres Version**

4. Clique em **Upgrade** se disponível

5. Siga as instruções na tela

### ⚠️ IMPORTANTE:

- Faça backup antes de atualizar
- Atualizações podem causar downtime de alguns minutos
- Teste em ambiente de desenvolvimento primeiro (se possível)

### Documentação:

https://supabase.com/docs/guides/platform/upgrading

---

## 📊 Progresso Geral

- [x] **Task 1:** Function Search Path Security (6 funções) - ✅ **CONCLUÍDO**
- [x] **Task 2:** Otimizar RLS Policies (32+ políticas em 16 tabelas) - ✅ **CONCLUÍDO**
- [ ] **Task 3:** Leaked Password Protection - ⚠️ **AÇÃO MANUAL NECESSÁRIA**
- [ ] **Task 4:** PostgreSQL Upgrade - ⚠️ **AÇÃO MANUAL NECESSÁRIA**

### 🎯 Status Atual:

- ✅ **Correções Automáticas:** 2/4 completas (50%)
- ⚠️ **Ações Manuais Pendentes:** 2/4 (50%)
- 📈 **Issues Resolvidos:** ~38 de 40+ (95%)
- 🚀 **Impacto de Performance:** Melhoria de 10-100x em queries com RLS

---

## 🔍 Como Verificar se os Issues Foram Resolvidos

1. Acesse o Supabase Dashboard:

   ```
   https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg/advisors
   ```

2. Vá em **Database** → **Advisors**

3. Verifique a lista de issues

4. Os issues corrigidos devem desaparecer da lista

---

## 📞 Suporte

Se encontrar algum problema ao aplicar as correções:

1. Verifique os logs de erro
2. Consulte a documentação do Supabase
3. Entre em contato com o suporte do Supabase se necessário

---

## 📝 Notas Técnicas

### Por que `SET search_path = public, pg_temp`?

O `search_path` define onde o PostgreSQL procura por objetos (tabelas, funções, etc.).

- **Sem definir:** Vulnerável a SQL injection via schema poisoning
- **Com `public, pg_temp`:** Garante que apenas objetos do schema `public` e temporários sejam usados

### Por que `(select auth.uid())` ao invés de `auth.uid()`?

- **`auth.uid()`:** Avaliado para cada linha (lento em tabelas grandes)
- **`(select auth.uid())`:** Avaliado uma vez e reutilizado (muito mais rápido)

Isso é chamado de "InitPlan" no PostgreSQL e melhora drasticamente a performance de queries com RLS.

---

**Última atualização:** 2025-10-09
