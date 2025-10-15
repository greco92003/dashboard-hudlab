# 🔧 Resumo da Correção - Cálculo de Comissão

## 📋 Problema Reportado

**Marca**: Zenith Franquia Taquara  
**Vendas**: R$ 427,20  
**Comissão Definida**: 30%  
**Valor Esperado**: R$ 128,16  
**Valor Mostrado**: R$ 21,36 ❌

## 🎯 Causa Raiz

O dashboard estava calculando a comissão sobre o **valor total do pedido** ao invés de calcular apenas sobre os **produtos da franquia selecionada**.

Para franquias Zenith, um pedido pode conter produtos de múltiplas franquias (Santos-SP, Garopaba-SC, Taquara-RS). O cálculo estava somando tudo, quando deveria somar apenas os produtos da franquia Taquara-RS.

## ✅ Solução Aplicada

### Arquivo: `app/partners/dashboard/page.tsx`

**1. Importação da função correta (linha 30):**

```typescript
import { isZenithProduct, calculateFranchiseRevenue } from "@/types/franchise";
```

**2. Atualização da função `calculateRealRevenue` (linhas 222-263):**

```typescript
const calculateRealRevenue = useCallback(
  (order: NuvemshopOrder): number => {
    // Para Zenith com franquia, usa cálculo específico
    if (selectedFranchise && effectiveBrand && isZenithProduct(effectiveBrand)) {
      return calculateFranchiseRevenue(order, selectedFranchise); // ✅ CORRETO
    }

    // Para outras marcas, usa cálculo padrão
    const subtotal = parseFloat(order.subtotal) || 0;
    const discounts = /* soma de descontos */;
    return subtotal - discounts;
  },
  [selectedFranchise, effectiveBrand] // Dependências atualizadas
);
```

## 🧪 Como Testar

1. Acesse o dashboard de parceiros
2. Selecione marca "Zenith"
3. Selecione franquia "Taquara-RS"
4. Verifique se o valor de vendas mostra apenas produtos da franquia Taquara
5. Defina comissão de 30%
6. Verifique se o cálculo está correto: **R$ 427,20 × 30% = R$ 128,16** ✅

## 📊 Resultado

- ✅ Vendas calculadas corretamente por franquia
- ✅ Comissão calculada sobre o valor correto
- ✅ Persistência funcionando (dados salvos no banco)
- ✅ Zenith Taquara: R$ 427,20 × 30% = **R$ 128,16** ✓

## 📝 Arquivos Modificados

1. `app/partners/dashboard/page.tsx` - Importação, função `calculateRealRevenue` e uso do `totalRevenue` da API
2. `types/franchise.ts` - Função `calculateFranchiseRevenue` agora aplica descontos proporcionalmente
3. `types/supabase.ts` - Schema TypeScript atualizado com coluna `brand`
4. `COMMISSION_CALCULATION_FIX.md` - Documentação detalhada

## 🔄 Correções Adicionais

### Problema 1: Faturamento mostrando R$ 449,70 ao invés de R$ 427,20

**Causa**: O dashboard estava recalculando o total no frontend ao invés de usar o valor já calculado pela API.

**Solução**: Modificado para usar `data.summary.totalRevenue` que vem da API, garantindo consistência entre backend e frontend.

```typescript
// ANTES - Recalculava no frontend
const total = data.orders.reduce((sum, order) => {
  const realRevenue = calculateRealRevenue(order);
  return sum + realRevenue;
}, 0);

// DEPOIS - Usa valor da API
const total = data.summary?.totalRevenue || 0;
```

### Problema 2: Ao clicar em "Sincronizar", os números ficavam errados novamente

**Causa**: A função `debouncedFetchOrders` (usada após sincronização) ainda tinha o código antigo que recalculava no frontend.

**Solução**: Corrigido `debouncedFetchOrders` (linhas 418-426) para também usar `data.summary.totalRevenue` da API.

**Locais corrigidos:**

- ✅ `fetchOrders` (linha 515) - Usa `data.summary.totalRevenue`
- ✅ `debouncedFetchOrders` (linha 421) - Usa `data.summary.totalRevenue`

### Problema 3: Total Ganho na página Home mostrando R$ 134,91 ao invés de R$ 128,16

**Causa**: A função `calculateFranchiseRevenue` estava somando apenas os produtos da franquia **sem aplicar os descontos proporcionalmente**.

Quando um pedido tem produtos de múltiplas franquias e tem descontos (cupom, gateway, promocional), esses descontos devem ser aplicados proporcionalmente a cada franquia.

**Exemplo do problema:**

- Pedido com subtotal total: R$ 500,00
- Produtos Taquara: R$ 450,00 (90% do pedido)
- Produtos outras franquias: R$ 50,00 (10% do pedido)
- Desconto total: R$ 50,00
- ❌ **Antes**: Calculava R$ 450,00 (sem descontos) → Comissão 30% = R$ 135,00
- ✅ **Depois**: Calcula R$ 450,00 - (R$ 50,00 × 90%) = R$ 405,00 → Comissão 30% = R$ 121,50

**Solução**: Modificada função `calculateFranchiseRevenue` em `types/franchise.ts` (linhas 166-252) para:

1. Calcular o subtotal da franquia
2. Calcular a proporção da franquia no pedido total
3. Aplicar cada desconto proporcionalmente
4. Retornar: subtotal da franquia - descontos proporcionais

```typescript
// Calcula proporção da franquia no pedido
const franchiseProportion = franchiseSubtotal / orderSubtotal;

// Aplica descontos proporcionalmente
const franchisePromotionalDiscount = promotionalDiscount * franchiseProportion;
const franchiseDiscountCoupon = discountCoupon * franchiseProportion;
const franchiseDiscountGateway = discountGateway * franchiseProportion;

// Receita final = subtotal - descontos proporcionais
const franchiseRevenue =
  franchiseSubtotal -
  franchisePromotionalDiscount -
  franchiseDiscountCoupon -
  franchiseDiscountGateway;
```

## 🔍 Observações

- A coluna `brand` já existia no banco de dados
- Não foi necessário executar migrations
- A correção é apenas no código JavaScript/TypeScript
- A API `/api/partners/orders` já estava filtrando corretamente
- O problema era apenas no cálculo do dashboard
