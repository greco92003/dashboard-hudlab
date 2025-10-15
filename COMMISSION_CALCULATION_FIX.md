# Correção do Cálculo de Comissão - Partners Dashboard

## 🐛 Problema Identificado

### Sintomas

- **Marca**: Zenith Franquia Taquara
- **Vendas**: R$ 427,20
- **Comissão Definida**: 30%
- **Valor Esperado**: R$ 128,16 (427,20 × 0,30)
- **Valor Mostrado**: R$ 21,36 (427,20 × 0,05)
- **Persistência**: Ao limpar cache e retornar, o valor volta para R$ 21,36

### Causa Raiz

O dashboard estava usando a função `calculateRealRevenue` que calcula o **total do pedido inteiro** (subtotal - descontos), mas para **franquias Zenith**, deveria usar `calculateFranchiseRevenue` que calcula apenas a **receita dos produtos da franquia selecionada**.

#### Fluxo do Problema:

1. ✅ Usuário seleciona marca "Zenith" e franquia "Taquara-RS"
2. ✅ API `/api/partners/orders` filtra corretamente os pedidos por franquia
3. ✅ API retorna apenas produtos da franquia Taquara-RS
4. ❌ **Dashboard calcula vendas usando `calculateRealRevenue`** que soma o subtotal total do pedido
5. ❌ Se o pedido tem produtos de múltiplas franquias, conta tudo ao invés de só Taquara
6. ❌ Resultado: valor de vendas **inflado** ou **incorreto**
7. ❌ Comissão calculada sobre valor errado

## ✅ Solução Implementada

### 1. Correção da Função `calculateRealRevenue` no Dashboard

Atualizado arquivo: `app/partners/dashboard/page.tsx`

**O que foi corrigido:**

A função `calculateRealRevenue` agora verifica se é uma franquia Zenith e usa o cálculo correto:

```typescript
// ANTES - Sempre calculava o total do pedido
const calculateRealRevenue = useCallback((order: NuvemshopOrder): number => {
  const subtotal = parseFloat(order.subtotal) || 0;
  const discounts = /* soma de todos os descontos */;
  return subtotal - discounts; // ❌ Conta tudo, mesmo produtos de outras franquias
}, []);

// DEPOIS - Usa cálculo específico para franquias Zenith
const calculateRealRevenue = useCallback(
  (order: NuvemshopOrder): number => {
    // Para Zenith com franquia, calcula apenas receita dos produtos da franquia
    if (selectedFranchise && effectiveBrand && isZenithProduct(effectiveBrand)) {
      return calculateFranchiseRevenue(order, selectedFranchise); // ✅ Correto!
    }

    // Para outras marcas, usa cálculo padrão
    const subtotal = parseFloat(order.subtotal) || 0;
    const discounts = /* soma de todos os descontos */;
    return subtotal - discounts;
  },
  [selectedFranchise, effectiveBrand] // ✅ Dependências atualizadas
);
```

**Como funciona `calculateFranchiseRevenue`:**

```typescript
// Itera pelos produtos do pedido
order.products.forEach((product) => {
  const productFranchise = getFranchiseFromOrderProduct(product);

  // Só soma se o produto for da franquia selecionada
  if (productFranchise === franchise) {
    franchiseRevenue += product.price * product.quantity;
  }
});
```

### 2. Atualização do Schema TypeScript

Atualizado arquivo: `types/supabase.ts`

**Mudanças:**

```typescript
// Adicionada coluna brand ao schema (já existia no banco, faltava no TypeScript)
partners_commission_settings: {
  Row: {
    id: string;
    percentage: number;
    brand: string;  // ← ADICIONADO
    updated_by: string | null;
    updated_at: string;
    created_at: string;
  };
  Insert: {
    brand: string;  // ← OBRIGATÓRIO no insert
    // ...
  };
  Update: {
    brand?: string;  // ← OPCIONAL no update
    // ...
  };
}
```

## 🔧 Como Aplicar a Correção

### Passo 1: Testar o Fluxo

**Não é necessário executar migrations** - a correção é apenas no código JavaScript/TypeScript.

1. **Recarregar a aplicação** (se estiver em dev mode, o Next.js já recarregou automaticamente)

2. **Acessar o dashboard** de parceiros

3. **Selecionar marca** "Zenith"

4. **Selecionar franquia** "Taquara-RS"

5. **Verificar o valor de vendas** - deve mostrar apenas vendas dos produtos da franquia Taquara

6. **Definir comissão** para 30% (se ainda não estiver definida)

7. **Verificar o cálculo** - deve mostrar 30% sobre o valor correto das vendas

### Passo 2: Verificar Cálculo

Para Zenith Franquia Taquara com R$ 427,20 em vendas de produtos da franquia:

```
Comissão = 427,20 × 0,30 = R$ 128,16 ✓
```

### Passo 3: Verificar Logs (Opcional)

Abra o console do navegador (F12) e verifique se há logs mostrando:

- Produtos sendo filtrados por franquia
- Cálculo de receita usando `calculateFranchiseRevenue`

## 🔍 Arquivos Modificados

1. ✅ `app/partners/dashboard/page.tsx` - **ATUALIZADO**

   - **Linha 30**: Importada função `calculateFranchiseRevenue` de `@/types/franchise`
   - **Linhas 222-263**: Função `calculateRealRevenue` agora usa `calculateFranchiseRevenue` para franquias Zenith
   - **Linhas 508-518**: Modificado para usar `data.summary.totalRevenue` da API ao invés de recalcular no frontend
   - Adicionadas dependências `selectedFranchise` e `effectiveBrand` ao useCallback

2. ✅ `types/supabase.ts` - **ATUALIZADO** (linhas 780-814)
   - Adicionada coluna `brand` ao schema TypeScript (já existia no banco)

## 🔄 Correções Adicionais

### Problema 1: Faturamento Incorreto

Faturamento mostrava **R$ 449,70** ao invés de **R$ 427,20**

**Causa**: O dashboard estava **recalculando** o total no frontend usando `calculateRealRevenue` sobre todos os pedidos retornados, mas a API já havia calculado corretamente usando `calculateFranchiseRevenue`.

**Solução**: Modificado para usar `data.summary.totalRevenue` que vem da API, garantindo **consistência** entre backend e frontend.

```typescript
// ANTES - Recalculava no frontend (podia dar diferença)
const total = data.orders.reduce((sum, order) => {
  const realRevenue = calculateRealRevenue(order);
  return sum + realRevenue;
}, 0);

// DEPOIS - Usa valor já calculado pela API
const total = data.summary?.totalRevenue || 0;
```

### Problema 2: Ao Sincronizar, Números Ficavam Errados

Ao clicar no botão **"Sincronizar"**, os números atualizavam e ficavam incorretos novamente.

**Causa**: A função `debouncedFetchOrders` (usada após sincronização e em outras situações) ainda tinha o código antigo que recalculava no frontend.

**Solução**: Corrigido `debouncedFetchOrders` (linhas 418-426) para também usar `data.summary.totalRevenue` da API.

**Locais corrigidos:**

- ✅ `fetchOrders` (linha 515) - Usa `data.summary.totalRevenue`
- ✅ `debouncedFetchOrders` (linha 421) - Usa `data.summary.totalRevenue`

Agora, **todas as funções** que buscam dados usam o valor correto da API!

## 🧪 Testes Recomendados

### Teste 1: Salvar Comissão

- [ ] Selecionar marca "Zenith"
- [ ] Definir comissão 30%
- [ ] Clicar em "Salvar"
- [ ] Verificar mensagem de sucesso

### Teste 2: Persistência

- [ ] Recarregar página (F5)
- [ ] Verificar se comissão continua 30%
- [ ] Limpar cache do navegador
- [ ] Recarregar novamente
- [ ] Verificar se comissão continua 30%

### Teste 3: Cálculo Correto

- [ ] Com vendas de R$ 427,20
- [ ] Comissão de 30%
- [ ] Verificar se mostra R$ 128,16

### Teste 4: Múltiplas Marcas

- [ ] Definir comissão para "Zenith" = 30%
- [ ] Definir comissão para outra marca = 10%
- [ ] Alternar entre marcas
- [ ] Verificar se cada uma mantém sua comissão

## 📝 Notas Importantes

1. **Sem Migrations**: A correção é apenas no código JavaScript/TypeScript, não requer mudanças no banco de dados

2. **Coluna `brand`**: Já existia no banco de dados, apenas faltava no schema TypeScript

3. **Cálculo Específico**: Para franquias Zenith, agora usa `calculateFranchiseRevenue` que soma apenas produtos da franquia selecionada

4. **Outras Marcas**: Para marcas que não são Zenith, continua usando o cálculo padrão (subtotal - descontos)

## 🎯 Resultado Esperado

Após aplicar a correção:

- ✅ Comissões são salvas corretamente por marca
- ✅ Comissões persistem após recarregar a página
- ✅ Cálculos usam a porcentagem correta
- ✅ Zenith Taquara com R$ 427,20 e 30% = **R$ 128,16** ✓
