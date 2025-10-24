# Correção de Cálculo de Comissão - Todas as Marcas

## 📋 Problema Identificado

Para a marca **"desculpa qualquer coisa"** no período de 01/10/25 a 24/10/25:

| Métrica | Valor Exibido | Problema |
|---------|---------------|----------|
| **Faturamento Real** | R$ 720,35 | ✅ Correto (agora) |
| **Vendas por Período (gráfico)** | R$ 643,53 | ✅ Correto |
| **Comissão (30%)** | R$ 216,10 | ✅ Correto (agora) |

### Causa Raiz

**Inconsistência entre API e Frontend:**

1. **API `/api/partners/orders/route.ts` (ANTES):**
   - Linha 312: Usava `order.total` que **INCLUI frete**
   - Resultado: Faturamento inflado

2. **Frontend `dashboard/page.tsx`:**
   - Linhas 232-256: Usava `subtotal - descontos` que **NÃO inclui frete**
   - Resultado: Gráfico com valores corretos

3. **Resultado:**
   - Faturamento Real: R$ 720,35 (com frete)
   - Gráfico: R$ 643,53 (sem frete)
   - Diferença: R$ 76,82 (valor do frete)

## ✅ Solução Implementada

### Arquivo Modificado: `app/api/partners/orders/route.ts`

**Mudança 1: Cálculo de `totalRevenue` (linhas 296-339)**

```typescript
// ANTES - Usava order.total (com frete)
totalRevenue = filteredOrders?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;

// DEPOIS - Usa subtotal - descontos (sem frete)
totalRevenue = filteredOrders?.reduce((sum, order) => {
  const subtotal = typeof order.subtotal === "string" 
    ? parseFloat(order.subtotal) 
    : order.subtotal || 0;

  const promotionalDiscount = typeof order.promotional_discount === "string"
    ? parseFloat(order.promotional_discount)
    : order.promotional_discount || 0;

  const discountCoupon = typeof order.discount_coupon === "string"
    ? parseFloat(order.discount_coupon)
    : order.discount_coupon || 0;

  const discountGateway = typeof order.discount_gateway === "string"
    ? parseFloat(order.discount_gateway)
    : order.discount_gateway || 0;

  const realRevenue = subtotal - promotionalDiscount - discountCoupon - discountGateway;

  return sum + Math.max(0, realRevenue);
}, 0) || 0;
```

**Mudança 2: Cálculo de `provinceStats` (linhas 345-397)**

```typescript
// ANTES - Usava order.total (com frete)
acc[province].revenue += order.total || 0;

// DEPOIS - Usa subtotal - descontos (sem frete)
const subtotal = typeof order.subtotal === "string"
  ? parseFloat(order.subtotal)
  : order.subtotal || 0;

const promotionalDiscount = typeof order.promotional_discount === "string"
  ? parseFloat(order.promotional_discount)
  : order.promotional_discount || 0;

const discountCoupon = typeof order.discount_coupon === "string"
  ? parseFloat(order.discount_coupon)
  : order.discount_coupon || 0;

const discountGateway = typeof order.discount_gateway === "string"
  ? parseFloat(order.discount_gateway)
  : order.discount_gateway || 0;

const realRevenue = subtotal - promotionalDiscount - discountCoupon - discountGateway;

acc[province].revenue += Math.max(0, realRevenue);
```

## 🎯 Impacto da Correção

### Marcas Afetadas

✅ **TODAS as marcas não-Zenith:**
- "desculpa qualquer coisa"
- Todas as outras marcas existentes
- Todas as marcas futuras que forem criadas

### Marcas NÃO Afetadas

❌ **Zenith (com franquias):**
- Já usava `calculateFranchiseRevenue` que calcula corretamente
- Não precisa de correção

## 📊 Resultado Esperado

### Para "desculpa qualquer coisa" (01/10/25 a 24/10/25)

| Métrica | Antes | Depois | Status |
|---------|-------|--------|--------|
| **Faturamento Real** | R$ 720,35 | R$ 643,53 | ✅ Corrigido |
| **Vendas por Período** | R$ 643,53 | R$ 643,53 | ✅ Consistente |
| **Comissão (30%)** | R$ 216,10 | R$ 193,06 | ✅ Correto |

### Cálculo Correto da Comissão

```
Faturamento Real: R$ 643,53
Comissão (30%): R$ 643,53 × 0,30 = R$ 193,06
```

## 🔍 Verificação

### 1. Verificar no Dashboard

1. Acesse `/partners/dashboard`
2. Selecione a marca "desculpa qualquer coisa"
3. Selecione o período: 01/10/25 a 24/10/25
4. Verifique:
   - **Faturamento Real** = **Soma do Gráfico**
   - **Comissão** = **Faturamento × Percentual**

### 2. Verificar em Gerenciamento de Comissões

1. Acesse `/partners/home`
2. Selecione a marca "desculpa qualquer coisa"
3. Verifique:
   - **Total Ganho** deve refletir o cálculo correto
   - **Saldo** deve estar consistente

## 📝 Notas Importantes

### Por que não incluir frete?

1. **Comissão justa**: Parceiros devem receber comissão sobre produtos vendidos, não sobre frete
2. **Consistência**: Mesmo cálculo usado para Zenith (via `calculateFranchiseRevenue`)
3. **Padrão do mercado**: Programas de afiliados geralmente não pagam comissão sobre frete

### Outras APIs Verificadas

✅ **`/api/partners/commission-summary`**: Já estava correto (usa `subtotal - descontos`)
✅ **Frontend `dashboard/page.tsx`**: Já estava correto (usa `calculateRealRevenue`)
✅ **Frontend `home/page.tsx`**: Usa dados da API, será corrigido automaticamente

## 🚀 Próximos Passos

1. ✅ Correção aplicada no código
2. ⏳ Testar com a marca "desculpa qualquer coisa"
3. ⏳ Verificar outras marcas
4. ⏳ Confirmar que marcas futuras funcionam corretamente

## 📌 Resumo

- **Problema**: API calculava faturamento com frete, frontend sem frete
- **Solução**: Padronizar para calcular sem frete em ambos os lugares
- **Impacto**: Todas as marcas não-Zenith
- **Resultado**: Consistência entre faturamento, gráfico e comissão

