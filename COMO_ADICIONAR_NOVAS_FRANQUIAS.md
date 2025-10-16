# 🏪 Como Adicionar Novas Franquias Zenith

## 📋 Visão Geral

O sistema agora está **totalmente automatizado** para adicionar novas franquias Zenith. Você só precisa atualizar **2 arquivos** e executar **1 comando**!

## ✨ Mudanças Implementadas

### Antes (Sistema Manual)
Para adicionar uma nova franquia, você precisava atualizar **4 arquivos diferentes**:
1. `types/franchise.ts` - Array ZENITH_FRANCHISES
2. `app/api/admin/process-auto-affiliate-links/route.ts` - Array de franchises + verificações
3. `supabase/migrations/auto_affiliate_link_generation.sql` - Array franchise_names
4. Executar migration no banco de dados

### Agora (Sistema Automático) ✅
Para adicionar uma nova franquia, você só precisa:
1. Atualizar `types/franchise.ts` - Array ZENITH_FRANCHISES
2. Atualizar `supabase/migrations/auto_affiliate_link_generation.sql` - Array franchise_names
3. Executar a migration no Supabase

**O resto é automático!** 🎉

## 🚀 Passo a Passo para Adicionar Nova Franquia

### Exemplo: Adicionando "Moema-SP"

#### 1️⃣ Atualizar `types/franchise.ts`

Adicione a nova franquia ao array `ZENITH_FRANCHISES`:

```typescript
export const ZENITH_FRANCHISES: Franchise[] = [
  {
    id: "santos-sp",
    name: "Santos - SP",
    displayName: "Santos - SP",
  },
  {
    id: "garopaba-sc",
    name: "Garopaba - SC",
    displayName: "Garopaba - SC",
  },
  {
    id: "taquara-rs",
    name: "Taquara - RS",
    displayName: "Taquara - RS",
  },
  {
    id: "moema-sp",           // ← NOVO
    name: "Moema - SP",       // ← NOVO
    displayName: "Moema - SP", // ← NOVO
  },
];
```

**Importante:**
- `id`: Use formato kebab-case (ex: "moema-sp")
- `name`: Use formato "Cidade - UF" (ex: "Moema - SP")
- `displayName`: Mesmo que `name` (para exibição na UI)

#### 2️⃣ Atualizar `supabase/migrations/auto_affiliate_link_generation.sql`

Encontre a linha com `franchise_names TEXT[]` e adicione a nova franquia:

```sql
franchise_names TEXT[] := ARRAY['Santos-SP', 'Garopaba-SC', 'Taquara-RS', 'Moema-SP'];
```

**Ou crie uma nova migration** (recomendado):

```sql
-- supabase/migrations/update_zenith_franchises_moema.sql

CREATE OR REPLACE FUNCTION trigger_auto_affiliate_link_on_new_brand()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  is_new_brand BOOLEAN := FALSE;
  is_zenith BOOLEAN := FALSE;
  affiliate_result RECORD;
  franchise_names TEXT[] := ARRAY['Santos-SP', 'Garopaba-SC', 'Taquara-RS', 'Moema-SP']; -- ← ATUALIZADO
  franchise_name TEXT;
BEGIN
  -- ... resto do código permanece igual
END;
$$;
```

#### 3️⃣ Aplicar Migration no Supabase

**Opção A: Via Supabase Dashboard**
1. Acesse [Supabase Dashboard](https://supabase.com/dashboard)
2. Vá para **SQL Editor**
3. Cole o conteúdo da migration
4. Execute

**Opção B: Via CLI do Supabase**
```bash
supabase db push
```

#### 4️⃣ Gerar Links de Afiliado Automaticamente

Execute o processo de geração de links:

**Via API:**
```bash
curl -X POST https://seu-dominio.com/api/admin/process-auto-affiliate-links \
  -H "Content-Type: application/json"
```

**Via Console do Navegador (F12):**
```javascript
fetch('/api/admin/process-auto-affiliate-links', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(res => res.json())
.then(data => console.log('✅ Links criados:', data));
```

## 🎯 O Que Acontece Automaticamente

Quando você adiciona uma nova franquia ao `ZENITH_FRANCHISES`:

### ✅ Frontend
- **FranchiseSelector**: Mostra a nova franquia no dropdown automaticamente
- **Filtros**: Todos os filtros de franquia incluem a nova franquia
- **Badges**: Exibem a nova franquia corretamente

### ✅ Backend
- **Verificação de Links**: Checa se a nova franquia tem link de afiliado
- **Criação de Links**: Cria link automaticamente se não existir
- **Desativação de Links Antigos**: Remove links genéricos da Zenith

### ✅ Banco de Dados
- **Trigger**: Cria links automaticamente quando novos produtos Zenith são adicionados
- **Validação**: Garante que todas as franquias tenham seus links

## 📊 Verificar Resultado

### SQL Query para Verificar Links

```sql
-- Ver todos os links da Zenith
SELECT 
  id,
  brand,
  url,
  CASE 
    WHEN url LIKE '%Santos-SP%' THEN '✅ Santos-SP'
    WHEN url LIKE '%Garopaba-SC%' THEN '✅ Garopaba-SC'
    WHEN url LIKE '%Taquara-RS%' THEN '✅ Taquara-RS'
    WHEN url LIKE '%Moema-SP%' THEN '✅ Moema-SP'
    ELSE '❌ SEM FRANQUIA'
  END as franchise,
  is_active,
  created_at
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
ORDER BY is_active DESC, created_at DESC;
```

### Resultado Esperado

Você deve ver **4 links ativos** para Zenith:

| Brand  | URL                                                                      | Franchise      | Active |
|--------|--------------------------------------------------------------------------|----------------|--------|
| Zenith | https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Santos-SP    | ✅ Santos-SP   | true   |
| Zenith | https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Garopaba-SC  | ✅ Garopaba-SC | true   |
| Zenith | https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Taquara-RS   | ✅ Taquara-RS  | true   |
| Zenith | https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Moema-SP     | ✅ Moema-SP    | true   |

## 🔍 Troubleshooting

### Problema: Nova franquia não aparece no dropdown

**Solução:**
1. Limpe o cache do navegador (Ctrl + Shift + R)
2. Verifique se atualizou `types/franchise.ts` corretamente
3. Reinicie o servidor de desenvolvimento

### Problema: Link de afiliado não foi criado

**Solução:**
1. Execute manualmente: `POST /api/admin/process-auto-affiliate-links`
2. Verifique os logs do console para erros
3. Confirme que a migration foi aplicada no Supabase

### Problema: Trigger não está funcionando

**Solução:**
1. Verifique se a migration foi aplicada: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_auto_affiliate_link_new_brand';`
2. Reaplique a migration se necessário
3. Teste adicionando um produto Zenith manualmente

## 📝 Checklist Rápido

Ao adicionar uma nova franquia:

- [ ] Atualizar `types/franchise.ts` com nova franquia
- [ ] Atualizar `supabase/migrations/auto_affiliate_link_generation.sql` (ou criar nova migration)
- [ ] Aplicar migration no Supabase
- [ ] Executar `POST /api/admin/process-auto-affiliate-links`
- [ ] Verificar no banco de dados se o link foi criado
- [ ] Testar no frontend se a franquia aparece no dropdown
- [ ] Confirmar que os filtros funcionam corretamente

## 🎉 Pronto!

Agora você pode adicionar novas franquias Zenith em **menos de 5 minutos**! 🚀

