# Integração Tiny/Olist no `/financial-dashboard`

## Objetivo

Criar a integração do Tiny/Olist na página `/financial-dashboard` para exibir:

- **Contas a pagar** com categorias
- **Contas a receber**
- **Saldo em caixa**
- **Gráfico de linhas** usando **shadcn/ui charts**
- **Item na sidebar** em **primeira posição**, junto da categoria de custos

---

## Base oficial e diretriz técnica

Antes de implementar, a integração deve seguir a documentação oficial do Tiny/Olist.

### O que foi confirmado na documentação oficial

- A **API V2** continua funcionando, porém a Olist informa que a **API V3** é a nova API disponível para desenvolvimento de integrações.
- A documentação/central de ajuda da **API V3** já cita recursos de:
  - **Contas a Pagar**
  - **Contas a Receber**

- A API V3 utiliza:
  - **JSON via HTTP**
  - **OAuth2**
  - **Rate limit por plano**

- O shadcn/ui recomenda charts construídos sobre **Recharts v3**.

### Diretriz do projeto

Para novas implementações, usar **API V3 como padrão**.

### Fallback permitido

Se algum dado financeiro específico ainda não estiver disponível de forma estável na V3, podemos:

1. validar endpoint oficial equivalente;
2. usar V2 apenas como fallback temporário;
3. encapsular a origem dos dados em uma camada de serviço para futura migração sem quebrar o dashboard.

---

## Escopo funcional da página

### 1. Cards de resumo no topo

A página `/financial-dashboard` deve exibir cards com:

- **Total a pagar**
- **Total a receber**
- **Saldo em caixa**
- **Resultado líquido previsto** = `total a receber - total a pagar`

### 2. Seção de gráfico

Adicionar um **gráfico de linhas** com visão temporal.

#### Série sugerida

- Linha 1: **Contas a pagar** por período
- Linha 2: **Contas a receber** por período
- Linha 3: **Saldo em caixa** por período

#### Granularidade inicial

Permitir agregação por:

- dia
- semana
- mês

Padrão inicial recomendado: **mês**.

### 3. Tabelas operacionais

#### Tabela: Contas a pagar

Colunas mínimas:

- vencimento
- descrição
- fornecedor/contato
- categoria
- valor
- status

#### Tabela: Contas a receber

Colunas mínimas:

- vencimento
- descrição
- cliente/contato
- valor
- status
- forma de recebimento (quando houver)

### 4. Filtros

Adicionar filtros para:

- período
- status
- categoria
- tipo de visualização

---

## Arquitetura recomendada

## Estrutura sugerida

```txt
src/
  app/
    financial-dashboard/
      page.tsx
      loading.tsx
      error.tsx
  components/
    financial-dashboard/
      summary-cards.tsx
      financial-line-chart.tsx
      accounts-payable-table.tsx
      accounts-receivable-table.tsx
      financial-filters.tsx
  lib/
    tiny/
      client.ts
      auth.ts
      endpoints.ts
      mappers.ts
      queries.ts
      types.ts
      service.ts
```

---

## Estratégia de integração

### Camadas

#### `lib/tiny/auth.ts`

Responsável por autenticação com a API do Tiny/Olist.

Responsabilidades:

- obter/access token
- renovar token quando necessário
- centralizar headers de autenticação

#### `lib/tiny/client.ts`

HTTP client da integração.

Responsabilidades:

- baseURL
- headers comuns
- tratamento de erros
- retries simples para falhas transitórias
- observabilidade/logs

#### `lib/tiny/endpoints.ts`

Mapeia endpoints da API V3.

Exemplo conceitual:

```ts
export const tinyEndpoints = {
  contasPagar: "/finance/accounts-payable",
  contasReceber: "/finance/accounts-receivable",
  saldoCaixa: "/finance/cash-balance",
};
```

> **Importante:** os paths acima são apenas nomes internos de organização. Os caminhos finais devem ser confirmados diretamente na documentação oficial antes do código definitivo.

#### `lib/tiny/mappers.ts`

Normaliza respostas da API para o formato do frontend.

#### `lib/tiny/service.ts`

Expõe funções de negócio já prontas para uso na página.

---

## Modelo de dados interno recomendado

### Conta a pagar

```ts
export type FinancialPayable = {
  id: string;
  description: string;
  dueDate: string;
  amount: number;
  status: "open" | "paid" | "partial" | "overdue" | "canceled";
  category?: {
    id?: string;
    name: string;
  };
  supplier?: {
    id?: string;
    name: string;
  };
};
```

### Conta a receber

```ts
export type FinancialReceivable = {
  id: string;
  description: string;
  dueDate: string;
  amount: number;
  status: "open" | "received" | "partial" | "overdue" | "canceled";
  customer?: {
    id?: string;
    name: string;
  };
  receiptMethod?: string;
};
```

### Saldo em caixa

```ts
export type FinancialCashBalance = {
  balance: number;
  currency: "BRL";
  referenceDate: string;
};
```

### Série do gráfico

```ts
export type FinancialTimelinePoint = {
  period: string;
  payable: number;
  receivable: number;
  cashBalance: number;
};
```

---

## Regras de negócio

### Contas a pagar com categorias

O dashboard deve sempre tentar trazer a **categoria** da conta a pagar.

#### Regras

- se a API retornar categoria diretamente, usar o valor original;
- se retornar apenas `idCategoria`, resolver por lookup complementar;
- se não houver categoria, exibir **"Sem categoria"**;
- nunca quebrar a renderização por ausência de categoria.

### Contas a receber

- exibir valores previstos e realizados conforme o status;
- permitir filtro por aberto/recebido/vencido;
- usar vencimento como data principal de ordenação.

### Saldo em caixa

Como a disponibilidade exata do endpoint deve ser validada na API oficial, o saldo em caixa deve ser implementado com esta ordem de prioridade:

1. **Endpoint oficial direto de saldo em caixa**, se existir na V3;
2. **Agregação de registros financeiros de caixa**, se a API expuser os lançamentos;
3. **Fallback documentado** via origem alternativa aprovada.

### Resultado líquido previsto

```ts
netForecast = totalReceivable - totalPayable;
```

---

## Boas práticas de implementação

### 1. Não consumir a API diretamente do client público

A integração deve acontecer no **server side**.

#### Recomendado

- usar **route handler** interno ou server actions;
- nunca expor `client_secret`, token ou credenciais no browser;
- retornar ao frontend apenas os dados já tratados.

### 2. Criar uma camada de API interna

Exemplo:

```txt
/app/api/financial-dashboard/summary/route.ts
/app/api/financial-dashboard/timeline/route.ts
/app/api/financial-dashboard/payables/route.ts
/app/api/financial-dashboard/receivables/route.ts
```

### 3. Padronizar formatação

- valores em **pt-BR**
- moeda em **BRL**
- datas em **dd/MM/yyyy**

### 4. Rate limit e resiliência

Como a API possui limites por plano, devemos:

- reduzir chamadas duplicadas;
- usar cache curto no servidor quando fizer sentido;
- agrupar consultas;
- evitar refetch agressivo no frontend.

### 5. Tratamento de erros

Criar respostas claras para:

- credencial inválida
- permissão insuficiente
- limite de requisição
- indisponibilidade temporária da API
- endpoint financeiro ainda não habilitado na conta

---

## Estratégia de fetch recomendada

## Resumo da página

No carregamento inicial, buscar em paralelo:

- contas a pagar do período
- contas a receber do período
- saldo em caixa

Depois derivar:

- totalPayable
- totalReceivable
- netForecast

### Exemplo conceitual

```ts
const [payables, receivables, cashBalance] = await Promise.all([
  getPayables(filters),
  getReceivables(filters),
  getCashBalance(filters),
]);
```

---

## Endpoint interno sugerido: summary

```ts
export type FinancialDashboardSummaryResponse = {
  totalPayable: number;
  totalReceivable: number;
  cashBalance: number;
  netForecast: number;
};
```

## Endpoint interno sugerido: timeline

```ts
export type FinancialDashboardTimelineResponse = {
  granularity: "day" | "week" | "month";
  points: FinancialTimelinePoint[];
};
```

---

## Gráfico de linhas com shadcn

Usar o componente de charts do shadcn/ui, que é construído sobre Recharts.

### Instalação

```bash
pnpm dlx shadcn@latest add chart
```

### Requisitos importantes

- usar `ChartContainer`
- manter `min-h-*` no container
- montar o gráfico com componentes do Recharts

### Estrutura sugerida do componente

```tsx
"use client";

import { Line, LineChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  payable: {
    label: "A pagar",
    color: "var(--chart-1)",
  },
  receivable: {
    label: "A receber",
    color: "var(--chart-2)",
  },
  cashBalance: {
    label: "Saldo em caixa",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;
```

### Exemplo de shape de dados

```ts
const data = [
  { period: "Jan", payable: 12000, receivable: 18000, cashBalance: 34000 },
  { period: "Fev", payable: 15000, receivable: 21000, cashBalance: 40000 },
];
```

### Comportamento visual esperado

- tooltip com valores formatados em real;
- legenda clara;
- eixo X com período;
- eixo Y com valores monetários;
- suporte a dark mode se o projeto já utilizar tokens.

---

## Sidebar

Adicionar o item da nova página na **primeira posição** da sidebar, dentro do agrupamento de custos.

### Exemplo conceitual

```ts
{
  title: "Custos",
  items: [
    {
      title: "Dashboard Financeiro",
      href: "/financial-dashboard",
      icon: Wallet,
    },
    // demais itens atuais...
  ]
}
```

### Regras

- o item deve aparecer **antes dos demais itens** da categoria;
- a rota deve apontar para `/financial-dashboard`;
- manter consistência com o sistema atual de ícones e permissões da sidebar.

---

## Variáveis de ambiente

```env
TINY_CLIENT_ID=
TINY_CLIENT_SECRET=
TINY_BASE_URL=
TINY_REDIRECT_URI=
```

> Ajustar os nomes conforme o padrão já existente no projeto.

---

## Segurança

- não salvar segredo no client;
- não logar token em produção;
- mascarar mensagens sensíveis em logs;
- validar permissões antes de processar a resposta;
- versionar a integração com camada isolada.

---

## Critérios de aceite

### Página

- existe a rota `/financial-dashboard`
- carrega dados financeiros sem expor credenciais
- exibe cards de resumo
- exibe gráfico de linhas
- exibe tabela de contas a pagar com categoria
- exibe tabela de contas a receber
- possui loading e tratamento de erro

### Sidebar

- item criado dentro da categoria de custos
- item inserido na **primeira posição**
- navegação funcionando corretamente

### Integração

- uso preferencial da API V3
- fallback isolado caso algum recurso financeiro ainda exija V2
- respostas normalizadas via mappers
- formatação pt-BR aplicada

---

## Ordem recomendada de implementação

1. Validar no Tiny/Olist os endpoints finais da **API V3** para:
   - contas a pagar
   - contas a receber
   - saldo em caixa / registros de caixa

2. Implementar autenticação server-side
3. Criar `client.ts`, `service.ts`, `types.ts` e `mappers.ts`
4. Criar endpoints internos de summary, timeline, payables e receivables
5. Criar página `/financial-dashboard`
6. Implementar cards
7. Implementar gráfico de linhas com shadcn
8. Implementar tabelas e filtros
9. Inserir item na sidebar na primeira posição da categoria de custos
10. Validar estados de erro, vazio e carregamento

---

## Observação importante

Para evitar acoplamento indevido com detalhes da API, o frontend **não deve depender do shape bruto do Tiny/Olist**. Todo dado deve passar antes por normalização.

Isso vai facilitar:

- manutenção
- troca entre V2 e V3
- testes
- evolução futura do dashboard
