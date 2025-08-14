# Guia do Role Partners-Media

## 📋 Resumo

Este guia explica o novo role "partners-media" implementado no sistema, suas permissões e como utilizá-lo.

## 🎯 O que é o Role Partners-Media

O role **partners-media** é um novo nível de permissão criado especificamente para usuários que trabalham com mídia e parcerias. Este role fica posicionado entre "manager" e "user" na hierarquia de permissões e tem acesso apenas às vendas pagas (status "closed") da Nuvemshop.

### Hierarquia de Roles (do maior para o menor):

1. **owner** (nível 5) - Acesso total ao sistema
2. **admin** (nível 4) - Acesso administrativo completo
3. **manager** (nível 3) - Gerenciamento intermediário
4. **partners-media** (nível 2) - **NOVO** - Foco em mídia e parcerias
5. **user** (nível 1) - Usuário padrão

## 🔧 Como Configurar

### 1. Executar o Script SQL

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard/project/ubqervuhvwnztxmsodlg)
2. Navegue para **SQL Editor** no menu lateral
3. Abra o arquivo `PARTNERS_MEDIA_SETUP.sql`
4. Copie todo o conteúdo e cole no SQL Editor
5. Clique em **Run** para executar

### 2. Verificação da Instalação

Após executar o SQL, você deve ver:

- ✅ Constraint da tabela atualizada para incluir "partners-media"
- ✅ Função `is_partners_media()` criada
- ✅ Função `get_role_level()` atualizada
- ✅ Função `can_manage_role()` criada
- ✅ Sistema de hierarquia funcionando

## 👥 Como Atribuir o Role

### Quem Pode Atribuir:

- **Owners**: Podem atribuir qualquer role (exceto criar outros owners)
- **Admins**: Podem atribuir qualquer role (exceto owner)

### Como Atribuir:

1. Faça login como owner ou admin
2. Acesse **Gerenciamento de Usuários**
3. Encontre o usuário desejado
4. Clique no botão **"Partners Media"** na linha do usuário
5. O role será atualizado automaticamente

## 🛡️ Permissões do Role Partners-Media

### O que Partners-Media PODE fazer:

- ✅ Acessar o dashboard principal
- ✅ Visualizar dados de negócios
- ✅ Acessar relatórios e gráficos
- ✅ Usar funcionalidades básicas do sistema
- ✅ Editar seu próprio perfil

### O que Partners-Media NÃO pode fazer:

- ❌ Aprovar/desaprovar outros usuários
- ❌ Alterar roles de outros usuários
- ❌ Deletar usuários
- ❌ Acessar configurações administrativas
- ❌ Gerenciar outros usuários

### Comparação com Outros Roles:

| Funcionalidade     | User | Partners-Media | Manager | Admin | Owner |
| ------------------ | ---- | -------------- | ------- | ----- | ----- |
| Acessar Dashboard  | ✅   | ✅             | ✅      | ✅    | ✅    |
| Ver Relatórios     | ✅   | ✅             | ✅      | ✅    | ✅    |
| Gerenciar Usuários | ❌   | ❌             | ❌      | ✅    | ✅    |
| Aprovar Usuários   | ❌   | ❌             | ❌      | ✅    | ✅    |
| Alterar Roles      | ❌   | ❌             | ❌      | ✅    | ✅    |
| Criar Admins       | ❌   | ❌             | ❌      | ✅    | ✅    |
| Criar Owners       | ❌   | ❌             | ❌      | ❌    | ✅    |

## 🔄 Fluxo de Trabalho

### Para Novos Usuários Partners-Media:

1. **Usuário se cadastra** → Role inicial: "user" (não aprovado)
2. **Admin/Owner aprova** → Usuário pode fazer login
3. **Admin/Owner atribui role** → Altera de "user" para "partners-media"
4. **Usuário acessa sistema** → Com permissões de partners-media

### Para Usuários Existentes:

1. **Admin/Owner acessa gerenciamento** → Lista de usuários
2. **Seleciona usuário** → Clica em "Partners Media"
3. **Role é atualizado** → Usuário recebe novas permissões
4. **Usuário faz logout/login** → Permissões aplicadas

## 🧪 Como Testar

### 1. Teste de Atribuição:

```sql
-- Verificar se o role foi atribuído corretamente
SELECT id, email, role, approved
FROM user_profiles
WHERE role = 'partners-media';
```

### 2. Teste de Hierarquia:

```sql
-- Verificar níveis hierárquicos
SELECT
  role,
  get_role_level(role) as level
FROM user_profiles
ORDER BY get_role_level(role) DESC;
```

### 3. Teste de Permissões:

- Faça login com usuário partners-media
- Verifique se consegue acessar o dashboard
- Confirme que NÃO consegue acessar gerenciamento de usuários

## 🚨 Solução de Problemas

### Problema: Role não aparece na interface

**Solução:**

1. Verifique se o script SQL foi executado completamente
2. Faça logout e login novamente
3. Limpe o cache do navegador

### Problema: Erro ao atribuir role

**Solução:**

```sql
-- Verificar constraint da tabela
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'user_profiles_role_check';
```

### Problema: Permissões não funcionam

**Solução:**

```sql
-- Verificar se as funções foram criadas
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('is_partners_media', 'get_role_level', 'can_manage_role');
```

## 📞 Suporte

Se encontrar problemas:

1. Verifique se o script SQL foi executado completamente
2. Confirme se o usuário está logado corretamente
3. Verifique o console do navegador para erros
4. Teste com um refresh da página

## 🎉 Conclusão

O role **partners-media** oferece um nível intermediário de acesso, ideal para usuários que precisam de mais permissões que um "user" comum, mas não necessitam de acesso administrativo completo. É perfeito para equipes de mídia e parcerias que precisam acessar dados e relatórios sem poder alterar configurações críticas do sistema.
