# 🏪 Implementação de Comissões por Franquia - Zenith

## 📋 Resumo

Implementação de comissões separadas por franquia para a marca Zenith. Agora cada franquia (Santos-SP, Garopaba-SC, Taquara-RS) tem suas próprias comissões calculadas e rastreadas separadamente.

## 🎯 Funcionalidades Implementadas

### 1. **Separação de Comissões por Franquia**
- Cada franquia da marca Zenith tem suas comissões calculadas separadamente
- Se vendemos produtos apenas da franquia Taquara, apenas Taquara terá comissões
- As comissões são calculadas com base nos produtos vendidos de cada franquia

### 2. **Mensagem de Seleção de Franquia**
- Quando a marca Zenith está selecionada mas nenhuma franquia foi escolhida, o card de comissões mostra:
  - "Selecione uma franquia para ver as informações de comissões"
  - "Escolha uma franquia específica para visualizar o resumo de comissões, histórico de pagamentos e saldo disponível."

### 3. **Pagamentos por Franquia**
- Os pagamentos de comissão agora incluem o campo `franchise`
- Cada pagamento pode ser associado a uma franquia específica
- Os pagamentos são filtrados por franquia quando uma está selecionada

## 🗄️ Mudanças no Banco de Dados

### Migration Criada
Arquivo: `supabase/migrations/add_franchise_to_commission_payments.sql`

**Mudanças:**
- Adiciona coluna `franchise` (TEXT, nullable) à tabela `commission_payments`
- Cria índice `idx_commission_payments_franchise` para melhor performance
- Cria índice composto `idx_commission_payments_brand_franchise` para queries combinadas

### Como Aplicar a Migration

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg)
2. Vá para **SQL Editor** no menu lateral
3. Execute o conteúdo do arquivo `supabase/migrations/add_franchise_to_commission_payments.sql`

**OU** use a CLI do Supabase:
```bash
supabase db push
```

## 📝 Arquivos Modificados

### 1. Backend - APIs

#### `app/api/partners/commission-summary/route.ts`
- Modificado para filtrar pagamentos por franquia quando aplicável
- Calcula comissões apenas para a franquia selecionada (Zenith)

#### `app/api/partners/commission-payments/route.ts`
- GET: Aceita parâmetro `franchise` para filtrar pagamentos
- POST: Aceita campo `franchise` ao criar novos pagamentos
- Retorna campo `franchise` nos resultados

#### `app/api/partners/commission-payments/[id]/route.ts`
- PUT: Aceita campo `franchise` ao atualizar pagamentos
- Permite atualizar a franquia de um pagamento existente

### 2. Frontend - Interface

#### `app/partners/home/page.tsx`
**Mudanças principais:**
- Importa `isZenithProduct` de `@/types/franchise`
- Adiciona campo `franchise` à interface `CommissionPayment`
- Modifica `fetchCommissionSummary` para:
  - Não buscar dados se Zenith sem franquia selecionada
  - Passar parâmetro `franchise` para a API
- Modifica `fetchCommissionPayments` para:
  - Não buscar dados se Zenith sem franquia selecionada
  - Passar parâmetro `franchise` para a API
- Modifica `handleSavePayment` para incluir `franchise` ao criar/editar pagamentos
- Adiciona verificação no card de comissões:
  - Mostra mensagem especial quando Zenith sem franquia
  - Exibe badge da franquia selecionada
- Exibe franquia nos pagamentos listados

## 🔄 Fluxo de Funcionamento

### Para Marca Zenith:

1. **Seleção de Marca e Franquia**
   - Usuário seleciona marca "Zenith"
   - Sistema exibe seletor de franquia
   - Usuário seleciona uma franquia (Santos-SP, Garopaba-SC, ou Taquara-RS)

2. **Cálculo de Comissões**
   - Sistema busca todos os pedidos da marca Zenith
   - Filtra produtos pela franquia selecionada usando `variant.values[1].pt`
   - Calcula comissão apenas sobre produtos da franquia selecionada
   - Usa função `calculateFranchiseRevenue()` para cálculo preciso

3. **Pagamentos**
   - Pagamentos são criados com campo `franchise` preenchido
   - Ao buscar pagamentos, filtra pela franquia selecionada
   - Saldo é calculado: (comissões ganhas da franquia) - (pagamentos da franquia)

4. **Exibição**
   - Card mostra badge da marca e da franquia
   - Resumo de comissões específico da franquia
   - Lista de pagamentos filtrada por franquia
   - Cada pagamento exibe sua franquia associada

### Para Outras Marcas:

- Funcionamento normal sem filtro de franquia
- Campo `franchise` permanece NULL nos pagamentos
- Comissões calculadas sobre todos os produtos da marca

## 🎨 Interface do Usuário

### Card de Comissões - Estados:

1. **Nenhuma marca selecionada:**
   - 💰 "Selecione uma marca para ver as informações de comissões"

2. **Zenith sem franquia:**
   - 🏪 "Selecione uma franquia para ver as informações de comissões"

3. **Zenith com franquia:**
   - Exibe badges: [Zenith] [🏪 Taquara-RS]
   - Mostra dados de comissão da franquia
   - Lista pagamentos da franquia

4. **Outras marcas:**
   - Exibe badge: [Nome da Marca]
   - Mostra dados de comissão da marca
   - Lista pagamentos da marca

## 📊 Estrutura de Dados

### Informação de Franquia nos Produtos

A franquia vem do campo `products` na tabela `nuvemshop_orders`:

```json
{
  "products": [
    {
      "name": "Chinelo Zenith",
      "price": 150.00,
      "quantity": 1,
      "variant": {
        "values": [
          { "pt": "39-40" },      // Tamanho (values[0])
          { "pt": "Taquara-RS" }  // Franquia (values[1])
        ]
      }
    }
  ]
}
```

### Funções Auxiliares (types/franchise.ts)

- `isZenithProduct(brand)` - Verifica se é produto Zenith
- `getFranchiseFromOrderProduct(product)` - Extrai franquia do produto
- `calculateFranchiseRevenue(order, franchise)` - Calcula receita da franquia

## ✅ Checklist de Implementação

- [x] Criar migration para adicionar campo `franchise`
- [x] Modificar API commission-summary para filtrar por franquia
- [x] Modificar API commission-payments GET para aceitar franchise
- [x] Modificar API commission-payments POST para aceitar franchise
- [x] Modificar API commission-payments PUT para aceitar franchise
- [x] Importar isZenithProduct no page.tsx
- [x] Modificar fetchCommissionSummary para passar franchise
- [x] Modificar fetchCommissionPayments para passar franchise
- [x] Adicionar verificação Zenith sem franquia no card
- [x] Incluir franchise ao criar/editar pagamentos
- [x] Exibir badge de franquia no card
- [x] Exibir franquia nos pagamentos listados
- [x] Atualizar interface CommissionPayment

## 🚀 Próximos Passos

1. **Aplicar a migration no banco de dados** (IMPORTANTE!)
2. Testar com dados reais da marca Zenith
3. Verificar cálculos de comissão por franquia
4. Criar pagamentos de teste para cada franquia
5. Validar saldos e histórico de pagamentos

## 📌 Notas Importantes

- A migration é **backward compatible** - o campo `franchise` é nullable
- Pagamentos antigos (sem franquia) continuam funcionando normalmente
- Apenas a marca Zenith usa o filtro de franquia
- Outras marcas não são afetadas pelas mudanças
- A informação de franquia vem de `variant.values[1].pt` nos produtos

