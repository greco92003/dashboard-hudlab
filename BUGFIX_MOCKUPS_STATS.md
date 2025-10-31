# Correção: Números Incorretos em "Mockups & Alterações por Designer"

## Problema

Desde o dia 20 de outubro, os números exibidos no componente "Mockups & Alterações por Designer" não correspondiam aos dados da planilha do Google Sheets vinculada.

## Causa Raiz

A função SQL `get_designer_mockups_stats` estava **contando linhas** em vez de **contar negócios únicos** para mockups e alterações.

### Exemplo do Problema:

Se um negócio tinha múltiplas linhas com o mesmo tipo (ex: múltiplas atualizações de "Mockup Feito"), ele era contado várias vezes:

```
Negócio: "Projeto X"
- Linha 1: Mockup Feito (10/10/2024)
- Linha 2: Mockup Feito (10/15/2024) - atualização
- Linha 3: Alteração (10/20/2024)

Contagem ANTES (incorreta):
- Negócios: 1 ✓
- Mockups: 2 ✗ (deveria ser 1)
- Alterações: 1 ✓

Contagem DEPOIS (correta):
- Negócios: 1 ✓
- Mockups: 1 ✓
- Alterações: 1 ✓
```

## Solução Implementada

### Arquivo Modificado

- `supabase/migrations/create_designer_mockups_cache.sql`

### Mudança na Função SQL

**Antes:**

```sql
COUNT(*) FILTER (WHERE dmc.is_mockup_feito = true) as mockups_feitos,
COUNT(*) FILTER (WHERE dmc.is_alteracao = true) as alteracoes_feitas
```

**Depois:**

```sql
COUNT(DISTINCT dmc.nome_negocio) FILTER (WHERE dmc.is_mockup_feito = true) as mockups_feitos,
COUNT(DISTINCT dmc.nome_negocio) FILTER (WHERE dmc.is_alteracao = true) as alteracoes_feitas
```

## Próximos Passos

### 1. Sincronizar os dados

Existem 3 formas de sincronizar:

**Opção A: Via Interface (Recomendado)**

- Acesse a página de Designers
- Clique no botão "Sincronizar Dados" no componente "Mockups & Alterações por Designer"
- Aguarde a sincronização completar

**Opção B: Via API (Admin)**

```bash
curl -X POST http://localhost:3000/api/admin/force-sync-mockups \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json"
```

**Opção C: Automática**

- Aguarde a próxima sincronização automática (cron job a cada hora)

### 2. Verificar os números

- Os números agora devem corresponder aos dados da planilha do Google Sheets
- Cada negócio é contado apenas uma vez para cada tipo (mockup ou alteração)
- Se ainda houver discrepâncias, verifique:
  - Se a planilha tem dados duplicados
  - Se os nomes dos designers estão normalizados corretamente
  - Se as datas estão no formato correto (MM/DD/YYYY)

## Arquivos Afetados

- `supabase/migrations/create_designer_mockups_cache.sql` - Função SQL corrigida
- `supabase/migrations/fix_designer_mockups_stats_counting.sql` - Migração de correção

## Componentes Relacionados

- `app/designers/page.tsx` - Página de designers
- `components/designers/mockups-section.tsx` - Componente de mockups
- `hooks/useDesignerMockupsCache.ts` - Hook de cache
- `app/api/designer-mockups-cache/route.ts` - API de sincronização
