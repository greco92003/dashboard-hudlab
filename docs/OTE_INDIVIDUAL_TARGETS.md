# Sistema de Metas Individuais OTE

## 📋 Visão Geral

Este documento descreve a implementação do sistema de metas individuais para vendedores no sistema OTE (On Target Earnings).

## 🎯 Funcionalidade

Permite dividir a meta mensal da empresa entre os vendedores usando porcentagens. Por exemplo:
- Meta da empresa: R$ 150.000,00
- Schay: 70% = R$ 105.000,00
- Raisa: 30% = R$ 45.000,00

## 🔧 Mudanças Implementadas

### 1. Banco de Dados

**Migration:** `supabase/migrations/add_seller_target_percentage.sql`
- Adiciona coluna `target_percentage` na tabela `ote_sellers`
- Tipo: `DECIMAL(5,2)` (permite valores como 70.00, 30.50, etc.)
- Default: 0
- Índice criado para otimizar consultas

### 2. Types TypeScript

**Arquivo:** `types/ote.ts`

**OTESeller:**
```typescript
target_percentage: number; // % da meta da empresa (ex: 70%)
```

**OTECalculationResult:**
```typescript
individual_target_amount: number; // Meta individual calculada
remaining_to_target: number; // Quanto falta para atingir
```

**OTESellerFormData:**
```typescript
target_percentage: number;
```

### 3. API Endpoints

#### POST/PATCH `/api/ote/sellers`
- Aceita campo `target_percentage`
- **Validação:** Porcentagem entre 0 e 100
- **Validação:** Soma das porcentagens dos vendedores ativos não pode exceder 100%
- Retorna erro descritivo se validação falhar

#### POST `/api/ote/calculate`
- Calcula meta individual: `target_amount * (target_percentage / 100)`
- Calcula quanto falta: `individual_target - vendas_do_vendedor`
- Retorna campos adicionais no resultado

#### GET `/api/ote/sellers-progress?month=X&year=Y`
**Novo endpoint** que retorna progresso de todos vendedores:
```typescript
{
  sellers: [
    {
      seller_name: string,
      target_percentage: number,
      individual_target: number,
      achieved: number,
      remaining: number,
      progress_percentage: number
    }
  ]
}
```

### 4. Componentes

#### SellerFormDialog
**Arquivo:** `components/ote/seller-form-dialog.tsx`

Adiciona campo no formulário:
- Label: "% da Meta da Empresa"
- Input numérico (0-100)
- Placeholder: 70.00
- Descrição explicativa com exemplo

#### CommissionCard
**Arquivo:** `components/ote/commission-card.tsx`

**Nova seção:** "Metas Individuais dos Vendedores"
- Card destacado com gradiente roxo/rosa
- Lista todos os vendedores ativos com target_percentage > 0
- Para cada vendedor mostra:
  - Nome e porcentagem da meta
  - Meta individual em R$
  - Valor já vendido em R$
  - Quanto falta em R$
  - Barra de progresso visual
  - Percentual de atingimento

**Cores da barra de progresso:**
- Verde: ≥ 100%
- Azul: ≥ 70%
- Laranja: < 70%

## 📊 Fluxo de Dados

1. **Cadastro/Edição de Vendedor:**
   - Admin define `target_percentage` (ex: 70%)
   - Sistema valida que soma não excede 100%
   - Salva no banco de dados

2. **Cálculo de Comissão:**
   - API busca meta da empresa (ex: R$ 150.000)
   - Calcula meta individual: R$ 150.000 × 70% = R$ 105.000
   - Busca vendas do vendedor no período
   - Calcula quanto falta: R$ 105.000 - vendas

3. **Exibição no Dashboard:**
   - CommissionCard busca progresso via `/api/ote/sellers-progress`
   - Exibe card com metas individuais de todos vendedores
   - Atualiza automaticamente quando mês/ano mudam

## ✅ Validações

1. **Porcentagem válida:** 0 ≤ target_percentage ≤ 100
2. **Soma não excede 100%:** Ao criar/editar vendedor ativo
3. **Considera status ativo:** Apenas vendedores ativos contam na soma
4. **Mensagens de erro descritivas:** Mostra valores atuais e novos

## 🎨 Interface

### Formulário de Vendedor
```
┌─────────────────────────────────────┐
│ % da Meta da Empresa *              │
│ ┌─────────────────────────────────┐ │
│ │ 70.00                           │ │
│ └─────────────────────────────────┘ │
│ Porcentagem da meta mensal da       │
│ empresa que é meta deste vendedor.  │
│ Ex: Se a meta da empresa é R$       │
│ 150.000 e este vendedor tem 70%,    │
│ sua meta individual será R$ 105.000 │
└─────────────────────────────────────┘
```

### Card de Metas Individuais
```
┌─────────────────────────────────────────────┐
│ Metas Individuais dos Vendedores      👥    │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ Schay                          70% meta │ │
│ │ Meta: R$ 105.000  Vendido: R$ 80.000   │ │
│ │ Falta: R$ 25.000                        │ │
│ │ ████████████░░░░░░░░ 76.2% atingido    │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ Raisa                          30% meta │ │
│ │ Meta: R$ 45.000   Vendido: R$ 35.000   │ │
│ │ Falta: R$ 10.000                        │ │
│ │ ███████████████░░░░░ 77.8% atingido    │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## 🚀 Como Usar

1. **Configurar Porcentagens:**
   - Acesse `/ote/admin`
   - Aba "Vendedores"
   - Edite cada vendedor
   - Defina a porcentagem da meta
   - Sistema valida automaticamente

2. **Visualizar Metas:**
   - Acesse `/ote` (vendedor) ou `/ote/admin` (admin)
   - Card "Metas Individuais" aparece automaticamente
   - Mostra progresso em tempo real

## 📝 Exemplo Prático

**Cenário:**
- Meta da empresa: R$ 150.000,00
- Vendedores:
  - Schay: 70% → Meta individual: R$ 105.000,00
  - Raisa: 30% → Meta individual: R$ 45.000,00

**Vendas no mês:**
- Schay vendeu: R$ 80.000,00 → Falta: R$ 25.000,00 (76.2%)
- Raisa vendeu: R$ 35.000,00 → Falta: R$ 10.000,00 (77.8%)
- Total empresa: R$ 115.000,00 (76.7% da meta)

**Comissão:**
- Calculada com base no atingimento da meta da EMPRESA (76.7%)
- Multiplicador aplicado conforme tabela OTE
- Cada vendedor recebe comissão proporcional

