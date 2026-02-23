# Limitações da API de Transações do Nuvemshop

## Problema Identificado

Os seguintes campos **NÃO estão disponíveis** através da API regular do Nuvemshop:

- `gateway_fees` - Taxas cobradas pelo gateway de pagamento
- `transaction_taxes` - Impostos sobre a transação
- `installment_interest` - Taxa de juros de parcelamento

## Por que isso acontece?

A API de Transactions do Nuvemshop (`/orders/{order_id}/transactions`) é **exclusiva para Payment Provider apps** (aplicativos de gateway de pagamento integrados ao Nuvemshop).

Quando você acessa a API como lojista (usando credenciais de store), você **NÃO tem permissão** para acessar esses dados detalhados de transação.

### Referência da Documentação

> "Note: This endpoint is for the exclusive use of payment apps."

Fonte: https://tiendanube.github.io/api-documentation/resources/transaction

## Dados Disponíveis

Através da API de Orders, você TEM acesso a:

```json
{
  "payment_details": {
    "method": "credit_card",
    "credit_card_company": "mastercard",
    "installments": "3"
  }
}
```

- `payment_details.method` - Método de pagamento (credit_card, pix, boleto, etc.)
- `payment_details.credit_card_company` - Bandeira do cartão
- `payment_details.installments` - Número de parcelas

## Dados NÃO Disponíveis

Os seguintes dados **NÃO estão disponíveis** via API regular:

- Valor das taxas do gateway
- Valor dos impostos da transação
- Taxa de juros aplicada nas parcelas
- Detalhes de merchant_charges
- Detalhes de consumer_charges

## Soluções Alternativas

### 1. Cálculo Manual (Recomendado)

Você pode calcular estimativas baseadas em taxas conhecidas:

```typescript
// Exemplo: Calcular taxa estimada do gateway
function estimateGatewayFee(total: number, method: string, installments: number) {
  // Taxas típicas do Nuvem Pago (exemplo)
  const rates = {
    pix: 0.99, // R$ 0,99 fixo
    credit_card_1x: 0.0399, // 3.99%
    credit_card_2_6x: 0.0499, // 4.99%
    credit_card_7_12x: 0.0599, // 5.99%
  };
  
  if (method === 'pix') {
    return rates.pix;
  }
  
  if (method === 'credit_card') {
    if (installments === 1) return total * rates.credit_card_1x;
    if (installments <= 6) return total * rates.credit_card_2_6x;
    return total * rates.credit_card_7_12x;
  }
  
  return null;
}
```

**Importante:** Essas são apenas estimativas. As taxas reais podem variar.

### 2. Integração Manual

Você pode:
1. Acessar o painel do Nuvem Pago ou seu gateway de pagamento
2. Exportar relatórios de transações
3. Importar manualmente para o sistema

### 3. Tornar-se um Payment Provider (Avançado)

Se você realmente precisa desses dados automaticamente:
1. Desenvolver um app de Payment Provider
2. Registrar o app no Nuvemshop
3. Obter aprovação como Payment Provider
4. Usar a API de Transactions

**Nota:** Isso é um processo complexo e requer infraestrutura de pagamento.

## Status Atual no Sistema

As colunas `gateway_fees`, `transaction_taxes` e `installment_interest` existem na tabela `nuvemshop_orders` do Supabase, mas permanecerão com valor `NULL` até que uma das soluções alternativas seja implementada.

## Recomendação

Para a maioria dos casos de uso (análise de vendas, cálculo de receita de franquias), os dados disponíveis na API de Orders são suficientes. 

Se você precisa de dados precisos de taxas e impostos, recomendamos:
1. Usar estimativas baseadas nas taxas conhecidas do seu gateway
2. Ou fazer reconciliação manual mensal com os relatórios do gateway de pagamento

