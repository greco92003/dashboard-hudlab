# 🏪 Suporte a Franquias - Resumo Completo

## 📋 Visão Geral

Implementado suporte completo para múltiplas franquias da marca **Zenith**. Agora cada franquia pode ter seus próprios:
- ✅ Links de afiliado
- ✅ Contratos de parceria
- ✅ Chaves PIX

## 🎯 Franquias Zenith

1. **Santos - SP**
2. **Garopaba - SC**
3. **Taquara - RS**

## 🔧 Alterações Realizadas

### 1. **Banco de Dados**

#### Migration: `add_franchise_to_contracts_and_pix.sql`
- Adicionada coluna `franchise` às tabelas:
  - `partnership_contracts`
  - `partner_pix_keys`
- Removidas constraints de unicidade por marca
- Criadas constraints compostas (brand + franchise)
- Criados índices para melhor performance

**Execute este SQL no Supabase:**
```sql
-- Ver arquivo: supabase/migrations/add_franchise_to_contracts_and_pix.sql
```

### 2. **APIs Backend**

#### `app/api/partners/affiliate-links/route.ts`
- ✅ POST: Permite múltiplos links para Zenith (um por franquia)
- ✅ Valida URL única em vez de marca única
- ✅ Para outras marcas: mantém limite de 1 link por marca

#### `app/api/partners/contracts/route.ts`
- ✅ GET: Suporta filtro por `franchise` query param
- ✅ POST: Aceita campo `franchise` no body
- ✅ Permite múltiplos contratos para Zenith (um por franquia)
- ✅ Para outras marcas: mantém limite de 1 contrato por marca

#### `app/api/partners/pix-keys/route.ts`
- ✅ GET: Suporta filtro por `franchise` query param
- ✅ POST: Aceita campo `franchise` no body
- ✅ Permite múltiplas chaves PIX para Zenith (uma por franquia)
- ✅ Para outras marcas: mantém limite de 1 chave PIX por marca

### 3. **Frontend**

#### `app/partners/home/page.tsx`

**Funções de Fetch Atualizadas:**
- `fetchAffiliateLink()`: Filtra por franquia quando Zenith
- `fetchContract()`: Filtra por franquia quando Zenith
- `fetchPixKey()`: Filtra por franquia quando Zenith

**Funções de Save Atualizadas:**
- `handleSaveContract()`: Envia franquia ao criar contrato Zenith
- `handleSavePixKey()`: Envia franquia ao criar chave PIX Zenith

**Validações Adicionadas:**
- Exige seleção de franquia para criar link/contrato/pix da Zenith
- Mostra mensagem específica quando franquia não está selecionada

**UI Melhorada:**
- Badge visual mostrando a franquia selecionada
- Mensagens contextuais para Zenith

## 📊 Estrutura de Dados

### Affiliate Links
```typescript
{
  id: string;
  url: string;
  brand: string;
  is_active: boolean;
  created_at: string;
}
```

**Exemplo de URLs:**
```
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Santos-SP
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Garopaba-SC
https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Taquara-RS
```

### Partnership Contracts
```typescript
{
  id: string;
  brand: string;
  franchise?: string;  // NOVO: Franquia (apenas para Zenith)
  contract_url: string;
  created_at: string;
}
```

### Partner PIX Keys
```typescript
{
  id: string;
  brand: string;
  franchise?: string;  // NOVO: Franquia (apenas para Zenith)
  pix_key: string;
  pix_type: string;
  created_at: string;
}
```

## 🚀 Como Usar

### Para Usuários (Frontend)

1. **Selecionar Marca Zenith**
   - No dropdown de marcas, selecione "Zenith"

2. **Selecionar Franquia**
   - Aparecerá um dropdown de franquias
   - Selecione: Santos-SP, Garopaba-SC ou Taquara-RS

3. **Visualizar Dados da Franquia**
   - Link de afiliado específico da franquia
   - Contrato específico da franquia
   - Chave PIX específica da franquia

4. **Criar Novos Registros**
   - Ao criar link/contrato/pix, será automaticamente associado à franquia selecionada
   - Badge visual mostra qual franquia está ativa

### Para Desenvolvedores (API)

#### Criar Link de Afiliado para Zenith
```javascript
POST /api/partners/affiliate-links
{
  "url": "https://hudlab.com.br/?utm_source=LandingPage&utm_medium=Zenith-Taquara-RS",
  "brand": "Zenith"
}
```

#### Criar Contrato para Franquia
```javascript
POST /api/partners/contracts
{
  "contract_url": "https://drive.google.com/...",
  "brand": "Zenith",
  "franchise": "Taquara - RS"
}
```

#### Criar Chave PIX para Franquia
```javascript
POST /api/partners/pix-keys
{
  "pix_key": "12345678900",
  "pix_type": "cpf",
  "brand": "Zenith",
  "franchise": "Taquara - RS"
}
```

#### Buscar Dados de Franquia Específica
```javascript
// Links de afiliado
GET /api/partners/affiliate-links?brand=Zenith

// Contrato
GET /api/partners/contracts?brand=Zenith&franchise=Taquara - RS

// Chave PIX
GET /api/partners/pix-keys?brand=Zenith&franchise=Taquara - RS
```

## ✅ Checklist de Implementação

- [x] Migration SQL criada
- [x] API de affiliate links atualizada
- [x] API de contracts atualizada (GET e POST)
- [x] API de pix keys atualizada (GET e POST)
- [x] Frontend: fetchAffiliateLink com filtro de franquia
- [x] Frontend: fetchContract com filtro de franquia
- [x] Frontend: fetchPixKey com filtro de franquia
- [x] Frontend: handleSaveContract com franquia
- [x] Frontend: handleSavePixKey com franquia
- [x] Frontend: Validações para Zenith
- [x] Frontend: Badge visual de franquia
- [x] Frontend: Mensagens contextuais

## 🧪 Testes Necessários

### 1. Executar Migration
```sql
-- Execute: supabase/migrations/add_franchise_to_contracts_and_pix.sql
```

### 2. Testar Criação de Links
- [ ] Criar link para Zenith - Santos-SP
- [ ] Criar link para Zenith - Garopaba-SC
- [ ] Criar link para Zenith - Taquara-RS
- [ ] Verificar que todos os 3 links existem no banco

### 3. Testar Criação de Contratos
- [ ] Criar contrato para Zenith - Santos-SP
- [ ] Criar contrato para Zenith - Garopaba-SC
- [ ] Criar contrato para Zenith - Taquara-RS
- [ ] Verificar que todos os 3 contratos existem no banco

### 4. Testar Criação de Chaves PIX
- [ ] Criar chave PIX para Zenith - Santos-SP
- [ ] Criar chave PIX para Zenith - Garopaba-SC
- [ ] Criar chave PIX para Zenith - Taquara-RS
- [ ] Verificar que todas as 3 chaves existem no banco

### 5. Testar Seleção de Franquia
- [ ] Selecionar Zenith + Santos-SP → Ver link correto
- [ ] Selecionar Zenith + Garopaba-SC → Ver link correto
- [ ] Selecionar Zenith + Taquara-RS → Ver link correto
- [ ] Trocar entre franquias → Dados devem atualizar

### 6. Testar Outras Marcas
- [ ] Criar link para Nike → Deve funcionar normalmente
- [ ] Tentar criar 2º link para Nike → Deve bloquear
- [ ] Criar contrato para Adidas → Deve funcionar normalmente
- [ ] Tentar criar 2º contrato para Adidas → Deve bloquear

## 🔍 Verificação no Banco

```sql
-- Ver todos os links da Zenith
SELECT brand, url, is_active,
  CASE 
    WHEN url LIKE '%Santos-SP%' THEN 'Santos-SP'
    WHEN url LIKE '%Garopaba-SC%' THEN 'Garopaba-SC'
    WHEN url LIKE '%Taquara-RS%' THEN 'Taquara-RS'
  END as franchise
FROM affiliate_links
WHERE brand = 'Zenith' AND is_active = true;

-- Ver todos os contratos da Zenith
SELECT brand, franchise, contract_url
FROM partnership_contracts
WHERE brand = 'Zenith';

-- Ver todas as chaves PIX da Zenith
SELECT brand, franchise, pix_key, pix_type
FROM partner_pix_keys
WHERE brand = 'Zenith';
```

## 📝 Notas Importantes

1. **Apenas Zenith tem franquias**: Outras marcas continuam com 1 link/contrato/pix por marca
2. **Franquia é obrigatória para Zenith**: Ao criar link/contrato/pix para Zenith, deve selecionar franquia
3. **URLs únicas**: Cada link de afiliado deve ter URL única (mesmo para Zenith)
4. **Retrocompatibilidade**: Marcas existentes não são afetadas

## 🎉 Resultado Final

Agora o sistema suporta completamente as 3 franquias da Zenith, permitindo:
- Rastreamento independente de vendas por franquia
- Contratos específicos por franquia
- Pagamentos separados por franquia (via chaves PIX diferentes)
- Expansão futura para mais franquias

