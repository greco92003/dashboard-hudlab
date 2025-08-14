# Custos Variáveis - Nova Funcionalidade

## Resumo

Foi criada uma nova página de **Custos Variáveis** que é uma cópia exata da página de **Custos Fixos**, mas com dados separados e armazenados em uma tabela própria no Supabase.

## Arquivos Criados/Modificados

### Novos Arquivos:
1. **`app/variable-costs/page.tsx`** - Página principal de custos variáveis
2. **`app/variable-costs/layout.tsx`** - Layout da página com sidebar
3. **`app/api/variable-costs/route.ts`** - API routes para gerenciar custos variáveis
4. **`variable-costs-setup.sql`** - Script SQL para criar a tabela no Supabase

### Arquivos Modificados:
1. **`components/app-sidebar.tsx`** - Adicionado link para custos variáveis no menu
2. **`types/supabase.ts`** - Adicionados tipos TypeScript para a tabela variable_costs
3. **`SUPABASE_SETUP.md`** - Adicionado script SQL para criar a tabela

## Configuração do Banco de Dados

### 1. Criar a Tabela no Supabase

Execute o seguinte SQL no Supabase Dashboard (SQL Editor):

```sql
-- Create table for variable costs (similar to fixed_costs)
CREATE TABLE IF NOT EXISTS variable_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  recurrence TEXT NOT NULL CHECK (recurrence IN ('none', 'monthly', 'annually')),
  tag TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a function to automatically update the updated_at column (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column for variable_costs
CREATE TRIGGER update_variable_costs_updated_at
    BEFORE UPDATE ON variable_costs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for variable_costs
ALTER TABLE variable_costs ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for now (you can restrict this later)
CREATE POLICY "Allow all operations on variable_costs" ON variable_costs
FOR ALL USING (true);
```

### 2. Estrutura da Tabela

A tabela `variable_costs` tem a mesma estrutura da `fixed_costs`:

- **id**: UUID (chave primária)
- **description**: Texto (descrição do custo)
- **date**: Data (data do custo)
- **value**: Decimal (valor do custo)
- **recurrence**: Texto (none, monthly, annually)
- **tag**: Texto (categoria/tag do custo)
- **created_at**: Timestamp (data de criação)
- **updated_at**: Timestamp (data de atualização)

## Funcionalidades

A página de Custos Variáveis possui exatamente as mesmas funcionalidades da página de Custos Fixos:

### 1. Visualização
- Lista de custos variáveis em tabela
- Filtro por período de datas
- Cálculo do total de custos no período
- Ordenação por qualquer coluna

### 2. Adição de Custos
- Formulário para adicionar novos custos
- Campos: descrição, data, valor, recorrência, tag
- Suporte a recorrência (mensal/anual)
- Validação de campos obrigatórios

### 3. Edição de Custos
- Edição inline de custos existentes
- Para custos recorrentes: opção de editar apenas uma ocorrência ou todas
- Atualização em tempo real

### 4. Exclusão de Custos
- Exclusão de custos individuais
- Para custos recorrentes: opção de excluir apenas uma ocorrência ou todas futuras
- Confirmação via dropdown

### 5. Tags Disponíveis
- Marketing
- Logística
- Insumos
- Escritório
- Comida
- Hospedagem
- Viagem
- Colaboradores

## Como Usar

1. **Acesse a página**: Navegue para `/variable-costs` ou use o menu lateral "Custos Variáveis"

2. **Adicionar custo**: Clique em "Adicionar Custo Variável" e preencha o formulário

3. **Filtrar por período**: Use o calendário para selecionar um período e clique em "Filtrar"

4. **Editar custo**: Clique no ícone de edição na linha do custo

5. **Excluir custo**: Clique no ícone de lixeira e escolha a opção desejada

## Diferenças dos Custos Fixos

A única diferença é que os dados são armazenados em tabelas separadas:
- **Custos Fixos**: tabela `fixed_costs`
- **Custos Variáveis**: tabela `variable_costs`

Isso permite gerenciar os dois tipos de custos de forma independente, mantendo a mesma interface e funcionalidades.

## Próximos Passos

Após executar o script SQL no Supabase, a funcionalidade estará pronta para uso. Não são necessárias configurações adicionais.
