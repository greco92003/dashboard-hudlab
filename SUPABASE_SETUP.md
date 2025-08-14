# Configuração do Supabase para Valor do Par

## Instruções para criar a tabela no Supabase

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard/project/xxcwlmuplcretthwsrqa)
2. Vá para a seção "SQL Editor" no menu lateral
3. Execute o seguinte SQL:

```sql
-- Create table for storing pair values
CREATE TABLE IF NOT EXISTS pair_values (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER update_pair_values_updated_at
    BEFORE UPDATE ON pair_values
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert a default value if the table is empty
INSERT INTO pair_values (value)
SELECT '100,00'
WHERE NOT EXISTS (SELECT 1 FROM pair_values);

-- Enable Row Level Security (RLS)
ALTER TABLE pair_values ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for now (you can restrict this later)
CREATE POLICY "Allow all operations on pair_values" ON pair_values
FOR ALL USING (true);

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

-- Create table for direct costs
CREATE TABLE IF NOT EXISTS direct_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  value_per_pair DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a trigger to automatically update the updated_at column for direct_costs
CREATE TRIGGER update_direct_costs_updated_at
    BEFORE UPDATE ON direct_costs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for direct_costs
ALTER TABLE direct_costs ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations for now (you can restrict this later)
CREATE POLICY "Allow all operations on direct_costs" ON direct_costs
FOR ALL USING (true);
```

## Funcionalidades Implementadas

### 1. Tabela `pair_values`

- **id**: Chave primária auto-incrementada
- **value**: Valor do par em formato texto (ex: "100,00")
- **created_at**: Data de criação do registro
- **updated_at**: Data da última atualização (atualizada automaticamente)

### 2. API Routes

- **GET /api/pair-value**: Busca o valor atual do par
- **POST /api/pair-value**: Atualiza o valor do par

### 3. Integração na Página

- O valor do par é carregado automaticamente do Supabase ao abrir a página
- Quando o usuário altera o valor e sai do campo (onBlur), o valor é salvo automaticamente no Supabase
- Indicador visual de "Salvando..." durante a operação
- Fallback para valor padrão em caso de erro

### 4. Migração do localStorage

- A página não usa mais localStorage para o valor do par
- Todos os valores são persistidos no Supabase
- O período selecionado ainda usa localStorage (não foi alterado)

## Como Testar

1. Execute o SQL no Supabase Dashboard
2. Acesse a página de "Pares Vendidos"
3. Altere o valor do par no campo "Valor unitário do par"
4. Clique fora do campo ou pressione Tab
5. Verifique que aparece "Salvando..." e depois desaparece
6. Recarregue a página e verifique que o valor foi mantido
7. Verifique no Supabase Dashboard (Table Editor > pair_values) que o valor foi salvo

## Estrutura de Arquivos Criados/Modificados

- `lib/supabase.ts` - Cliente Supabase e tipos TypeScript
- `app/api/pair-value/route.ts` - API routes para gerenciar valores do par
- `app/pairs-sold/page.tsx` - Página modificada para usar Supabase
- `supabase-setup.sql` - Script SQL para criar a tabela
- `SUPABASE_SETUP.md` - Este arquivo de documentação
