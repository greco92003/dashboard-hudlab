# Calculadora de Dias Úteis

## Descrição

A Calculadora de Dias Úteis é uma funcionalidade disponível na página de **Vendedores** que permite calcular 15 dias úteis a partir de uma data selecionada, considerando:

- ✅ Finais de semana (sábados e domingos)
- ✅ Feriados nacionais brasileiros
- ✅ Interface intuitiva com calendário

## Localização

A calculadora está disponível em um **card verde** logo abaixo do título da página de Vendedores (`/sellers`).

## Como Usar

1. Acesse a página de **Vendedores**
2. Localize o card verde "Calculadora de Dias Úteis"
3. Clique no ícone da calculadora (botão branco à direita)
4. Selecione uma data inicial no calendário
5. Clique em "Calcular 15 Dias Úteis"
6. O resultado será exibido mostrando:
   - Data inicial selecionada
   - Data final após 15 dias úteis
   - Quantidade de feriados considerados no período

## Configuração

### Variável de Ambiente Necessária

Para que a calculadora funcione corretamente, é necessário configurar o token da API InverTexto no arquivo `.env.local`:

```env
INVERTEXTO_API_TOKEN=seu_token_aqui
```

### Como Obter o Token

1. Acesse [https://www.invertexto.com/](https://www.invertexto.com/)
2. Crie uma conta ou faça login
3. Acesse a seção de API
4. Copie seu token de acesso
5. Cole no arquivo `.env.local`

## API Utilizada

A calculadora utiliza a **API de Feriados do InverTexto** para obter a lista de feriados nacionais brasileiros:

- **Endpoint**: `https://api.invertexto.com/v1/holidays/{year}`
- **Documentação**: [https://www.invertexto.com/api-feriados](https://www.invertexto.com/api-feriados)
- **Cache**: Os feriados são armazenados em cache por 24 horas para melhor performance

## Arquivos Relacionados

- **Componente**: `components/business-days-calculator.tsx`
- **API Route**: `app/api/holidays/route.ts`
- **Página**: `app/sellers/page.tsx`

## Funcionalidades Técnicas

### Cálculo de Dias Úteis

O algoritmo:
1. Busca os feriados do ano selecionado via API
2. Itera dia a dia a partir da data inicial
3. Verifica se o dia é:
   - Fim de semana (sábado ou domingo)
   - Feriado nacional
4. Conta apenas os dias que não são fim de semana nem feriado
5. Para quando atingir 15 dias úteis

### Cache e Performance

- Feriados são cacheados por 24 horas (Next.js revalidate)
- Reduz chamadas à API externa
- Melhora a performance e experiência do usuário

## Tratamento de Erros

A calculadora possui tratamento de erros para:
- Token não configurado
- Token inválido ou expirado
- Falha na conexão com a API
- Erros de rede

Todos os erros são exibidos ao usuário via toast notifications.

