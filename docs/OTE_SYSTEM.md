# Sistema OTE (On Target Earnings)

## 📋 Visão Geral

O Sistema OTE é uma solução completa de comissionamento individual para vendedores, baseado em metas mensais e multiplicadores de desempenho.

## 🎯 Como Funciona

### 1. **Estrutura de Comissionamento**

Cada vendedor possui:
- **Salário Fixo**: Valor base mensal (ex: R$ 1.846,25)
- **Meta Mensal**: Valor de vendas a ser atingido (ex: R$ 150.000,00)
- **% de Comissão Base**: Percentual da meta que vira comissão (ex: 2%)

### 2. **Cálculo da Comissão Base**

```
Comissão Base = Meta × % de Comissão
Exemplo: R$ 150.000 × 2% = R$ 3.000,00
```

### 3. **Multiplicadores de Desempenho**

A comissão base é multiplicada de acordo com o % de atingimento da meta:

| % da Meta | Multiplicador |
|-----------|---------------|
| 0% - 70%  | 0x (sem comissão) |
| 71% - 85% | 0.5x |
| 86% - 99% | 0.7x |
| 100% - 119% | 1x |
| 120% - 149% | 1.5x |
| 150%+ | 2x |

### 4. **Divisão por Canal**

As vendas são divididas em dois canais:
- **Tráfego Pago**: 80% das vendas
- **Orgânico**: 20% das vendas

A comissão é calculada proporcionalmente para cada canal.

### 5. **Exemplo Prático**

**Dados do Vendedor:**
- Salário Fixo: R$ 1.846,25
- Meta: R$ 150.000,00
- % Comissão: 2%
- Vendas do Mês: R$ 180.000,00

**Cálculo:**
1. Comissão Base = R$ 150.000 × 2% = R$ 3.000,00
2. % Atingimento = (R$ 180.000 / R$ 150.000) × 100 = 120%
3. Multiplicador = 1.5x (120% está entre 120% e 149%)
4. Comissão Tráfego Pago = R$ 3.000 × 1.5 × 80% = R$ 3.600,00
5. Comissão Orgânico = R$ 3.000 × 1.5 × 20% = R$ 900,00
6. **Comissão Total = R$ 4.500,00**
7. **Total de Ganhos = R$ 1.846,25 + R$ 4.500,00 = R$ 6.346,25**

## 🚀 Instalação

### 1. Executar Migration SQL

Execute o arquivo SQL no Supabase SQL Editor:

```bash
supabase/migrations/create_ote_system.sql
```

### 2. Cadastrar Vendedores

Acesse `/ote/admin` e cadastre os vendedores com:
- Nome do vendedor (deve corresponder ao campo "vendedor" nos deals)
- Salário fixo
- % de comissão base
- Vincular ao usuário do sistema

### 3. Definir Metas Mensais

Para cada vendedor, defina metas mensais com:
- Mês e ano
- Valor da meta em reais

## 📊 Funcionalidades

### Dashboard do Vendedor (`/ote`)

- **Cards de Desempenho**: Meta, atingimento, multiplicador e ganhos
- **Tabela de Multiplicadores**: Visualização dos níveis de comissão
- **Histórico**: Últimos 6 meses de comissões
- **Notificações**: Alertas de marcos e conquistas

### Painel Administrativo (`/ote/admin`)

- **Gerenciar Vendedores**: Cadastro e edição
- **Gerenciar Metas**: Definir metas mensais
- **Configurações**: Ajustar % de canais e multiplicadores

## 🔐 Permissões

- **Vendedores**: Acesso apenas ao próprio dashboard
- **Admins/Owners**: Acesso total ao painel administrativo

## 📡 API Endpoints

### `GET /api/ote/dashboard`
Retorna dashboard completo do vendedor logado

### `POST /api/ote/calculate`
Calcula comissão para um período específico
```json
{
  "seller_id": "uuid",
  "month": 1,
  "year": 2024
}
```

### `GET /api/ote/sellers`
Lista todos os vendedores

### `POST /api/ote/sellers`
Cria novo vendedor

### `GET /api/ote/targets`
Lista metas (filtros: seller_id, month, year)

### `POST /api/ote/targets`
Cria nova meta

### `GET /api/ote/config`
Retorna configuração ativa

### `PATCH /api/ote/config`
Atualiza configuração

## 🎨 Componentes

- `<CommissionCard>`: Cards de desempenho do mês
- `<MultiplierTable>`: Tabela de multiplicadores
- `<CommissionHistoryComponent>`: Histórico de comissões

## 📝 Tipos TypeScript

Todos os tipos estão definidos em `types/ote.ts`:
- `OTEConfig`
- `OTESeller`
- `OTEMonthlyTarget`
- `OTECommissionHistory`
- `OTECalculationResult`
- `OTESellerDashboard`

## 🔄 Fluxo de Dados

1. Vendedor realiza vendas (registradas em `deals_cache`)
2. Sistema busca deals do vendedor no período
3. Calcula total de vendas e % de atingimento
4. Aplica multiplicador baseado na tabela
5. Divide comissão entre canais (80/20)
6. Soma salário fixo + comissão = Total de ganhos

## 🎯 Próximos Passos

- [ ] Implementar formulários de cadastro/edição
- [ ] Adicionar gráficos de evolução
- [ ] Sistema de notificações automáticas
- [ ] Exportação de relatórios
- [ ] Integração com folha de pagamento

