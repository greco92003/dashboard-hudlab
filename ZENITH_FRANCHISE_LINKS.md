# Sistema de Links de Afiliado com Franquias Zenith

## 📋 Visão Geral

A marca **Zenith** é especial porque possui múltiplas franquias, e cada franquia precisa de seu próprio link de afiliado para rastreamento adequado.

## 🎯 Problema Resolvido

Anteriormente, a Zenith tinha apenas 1 link genérico:
```
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith
```

Agora, cada franquia tem seu próprio link:
```
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Santos-SP
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Garopaba-SC
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Taquara-RS
```

## 🔧 Como Funciona

### 1. Detecção Automática

A API `/api/admin/process-auto-affiliate-links` agora:

1. **Verifica se a marca é Zenith**
2. **Checa se existem os 3 links de franquia**
3. **Se faltar algum link:**
   - Desativa links antigos sem franquia
   - Cria os links faltantes

### 2. Lógica de Verificação

```typescript
// Para Zenith, verifica se tem TODOS os 3 links:
const hasSantos = zenithLinks.some(l => l.url.includes("Santos-SP"));
const hasGaropaba = zenithLinks.some(l => l.url.includes("Garopaba-SC"));
const hasTaquara = zenithLinks.some(l => l.url.includes("Taquara-RS"));

const hasAllFranchiseLinks = hasSantos && hasGaropaba && hasTaquara;
```

### 3. Criação Inteligente

- **Evita duplicatas**: Verifica links existentes antes de criar
- **Cria apenas o que falta**: Se já existe Santos-SP, não recria
- **Desativa links antigos**: Remove links genéricos da Zenith

## 🚀 Como Usar

### Opção 1: Via Interface

1. Acesse `/partners/home` como admin/owner
2. Procure o botão "Processar Auto-Links"
3. Clique e aguarde o processamento

### Opção 2: Via Console do Navegador

```javascript
fetch('/api/admin/process-auto-affiliate-links', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(res => res.json())
.then(data => console.log('Resultado:', data));
```

### Opção 3: Via Script de Teste

```bash
# No console do navegador (F12)
# Cole o conteúdo de: scripts/test-zenith-links.js
```

## 📊 Verificar Resultado

### SQL Query

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
    ELSE '❌ SEM FRANQUIA'
  END as franchise,
  is_active,
  created_at
FROM affiliate_links
WHERE brand ILIKE '%zenith%'
ORDER BY is_active DESC, created_at DESC;
```

### Resultado Esperado

Você deve ver **3 links ativos** para Zenith:

| Brand  | URL                                                                      | Franchise      | Active |
|--------|--------------------------------------------------------------------------|----------------|--------|
| Zenith | https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Santos-SP    | ✅ Santos-SP   | true   |
| Zenith | https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Garopaba-SC  | ✅ Garopaba-SC | true   |
| Zenith | https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Taquara-RS   | ✅ Taquara-RS  | true   |

## 🔮 Adicionar Novas Franquias

Para adicionar uma nova franquia no futuro:

### 1. Atualizar o Array de Franquias

**Arquivo:** `app/api/admin/process-auto-affiliate-links/route.ts`

```typescript
const franchises = [
  { name: "Santos-SP", displayName: "Santos - SP" },
  { name: "Garopaba-SC", displayName: "Garopaba - SC" },
  { name: "Taquara-RS", displayName: "Taquara - RS" },
  { name: "NOVA-FRANQUIA", displayName: "Nova Franquia" }, // ← ADICIONAR AQUI
];
```

### 2. Atualizar a Verificação

```typescript
// Adicionar verificação para a nova franquia
const hasNova = zenithLinks.some((l) => l.url.includes("NOVA-FRANQUIA"));

const hasAllFranchiseLinks = hasSantos && hasGaropaba && hasTaquara && hasNova;
```

### 3. Atualizar o SQL Trigger

**Arquivo:** `supabase/migrations/auto_affiliate_link_generation.sql`

```sql
franchise_names TEXT[] := ARRAY['Santos-SP', 'Garopaba-SC', 'Taquara-RS', 'NOVA-FRANQUIA'];
```

### 4. Atualizar types/franchise.ts

```typescript
export const ZENITH_FRANCHISES: Franchise[] = [
  { id: "santos-sp", name: "Santos - SP", displayName: "Santos - SP" },
  { id: "garopaba-sc", name: "Garopaba - SC", displayName: "Garopaba - SC" },
  { id: "taquara-rs", name: "Taquara - RS", displayName: "Taquara - RS" },
  { id: "nova-franquia", name: "Nova Franquia", displayName: "Nova Franquia" }, // ← ADICIONAR
];
```

### 5. Executar o Processamento

Após fazer as alterações, execute:

```javascript
fetch('/api/admin/process-auto-affiliate-links', { method: 'POST' })
```

O sistema automaticamente criará o link para a nova franquia!

## 🐛 Troubleshooting

### Problema: "Found 0 brands needing auto-affiliate-links"

**Causa:** Todas as marcas já têm links (mas Zenith pode ter link genérico)

**Solução:** A nova lógica detecta automaticamente e cria os links de franquia

### Problema: Links duplicados

**Causa:** Executou o processamento múltiplas vezes

**Solução:** A nova lógica verifica links existentes e evita duplicatas

### Problema: Link genérico ainda aparece

**Causa:** Link antigo não foi desativado

**Solução:** Execute o script `scripts/recreate-zenith-links.sql`

## 📝 Logs de Debug

Ao executar o processamento, você verá logs como:

```
🔗 Processing auto-affiliate-links for all brands...
⚠️ Zenith brand needs franchise-specific links. Current: Santos=false, Garopaba=false, Taquara=false
🗑️ Deactivating 1 old Zenith links without franchise info...
✅ Old Zenith links deactivated
🏷️ Found 1 brands needing auto-affiliate-links: [ 'Zenith' ]
🔗 Creating auto-affiliate-link for brand: Zenith
✅ Auto-affiliate-link created for Zenith - Santos - SP: https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Santos-SP
✅ Auto-affiliate-link created for Zenith - Garopaba - SC: https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Garopaba-SC
✅ Auto-affiliate-link created for Zenith - Taquara - RS: https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Taquara-RS
🎯 Auto-affiliate-links processing completed: 3 created, 0 errors
```

## ✅ Checklist de Implementação

- [x] Detectar marca Zenith automaticamente
- [x] Verificar se tem os 3 links de franquia
- [x] Desativar links genéricos antigos
- [x] Criar links específicos por franquia
- [x] Evitar duplicatas
- [x] Criar apenas links faltantes
- [x] Atualizar interface para mostrar franquia no link
- [x] Documentar processo de adicionar novas franquias
- [x] Criar scripts de teste e verificação

