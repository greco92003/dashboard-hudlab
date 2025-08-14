# Nuvemshop API Integration

Este documento descreve como usar a integração com a API do Nuvemshop implementada no dashboard.

## Configuração

### Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env.local`:

```env
# Nuvemshop Configuration
NUVEMSHOP_ACCESS_TOKEN=your_access_token_here
NUVEMSHOP_USER_ID=your_user_id_here
NUVEMSHOP_STORE_ID=your_store_id_here
```

### Como obter as credenciais:

1. **Access Token**: Obtido através do processo de autenticação OAuth do Nuvemshop
2. **User ID**: ID do usuário da sua conta Nuvemshop
3. **Store ID**: ID da sua loja no Nuvemshop

## Rotas Disponíveis

### 1. Buscar Pedidos

#### GET `/api/nuvemshop/orders`

Busca todos os pedidos da loja com filtros opcionais.

**Parâmetros de Query:**

- `page` (opcional): Número da página (padrão: 1)
- `per_page` (opcional): Itens por página (padrão: 50, máximo: 200)
- `since` (opcional): Data ISO 8601 para buscar pedidos desde
- `until` (opcional): Data ISO 8601 para buscar pedidos até
- `created_at_min` (opcional): Data mínima de criação (ISO 8601)
- `created_at_max` (opcional): Data máxima de criação (ISO 8601)
- `updated_at_min` (opcional): Data mínima de atualização (ISO 8601)
- `updated_at_max` (opcional): Data máxima de atualização (ISO 8601)
- `status` (opcional): Status do pedido (open, closed, cancelled)
- `payment_status` (opcional): Status do pagamento (authorized, pending, paid, etc.)
- `shipping_status` (opcional): Status do envio (unpacked, packed, shipped, etc.)
- `fields` (opcional): Campos específicos para retornar
- `q` (opcional): Termo de busca

**Exemplo:**

```javascript
// Buscar pedidos dos últimos 7 dias
const response = await fetch(
  "/api/nuvemshop/orders?created_at_min=2024-01-01T00:00:00Z&per_page=100"
);
const data = await response.json();
```

#### POST `/api/nuvemshop/orders`

Sincroniza pedidos do Nuvemshop para o banco de dados local.

**Body:**

```json
{
  "syncPeriodDays": 30, // Período em dias para sincronizar (padrão: 30)
  "batchSize": 50 // Tamanho do lote para processamento (padrão: 50)
}
```

### 2. Buscar Pedido Específico

#### GET `/api/nuvemshop/orders/[id]`

Busca um pedido específico pelo ID.

**Parâmetros:**

- `id`: ID do pedido no Nuvemshop

**Parâmetros de Query:**

- `fields` (opcional): Campos específicos para retornar

**Exemplo:**

```javascript
const response = await fetch("/api/nuvemshop/orders/123456");
const data = await response.json();
```

#### PUT `/api/nuvemshop/orders/[id]`

Atualiza um pedido específico.

**Body:** Dados do pedido para atualizar (conforme documentação do Nuvemshop)

### 3. Operações de Pedidos

#### POST `/api/nuvemshop/orders/[id]/close`

Fecha um pedido.

#### POST `/api/nuvemshop/orders/[id]/open`

Reabre um pedido fechado.

#### POST `/api/nuvemshop/orders/[id]/cancel`

Cancela um pedido.

**Body:**

```json
{
  "reason": "other", // customer, inventory, fraud, other
  "email": true, // Notificar cliente
  "restock": true // Repor estoque
}
```

### 4. Produtos

#### GET `/api/nuvemshop/products`

Busca todos os produtos da loja com filtros opcionais.

**Parâmetros de Query:**

- `page` (opcional): Número da página (padrão: 1)
- `per_page` (opcional): Itens por página (padrão: 50, máximo: 200)
- `since` (opcional): Data ISO 8601 para buscar produtos desde
- `until` (opcional): Data ISO 8601 para buscar produtos até
- `created_at_min` (opcional): Data mínima de criação (ISO 8601)
- `created_at_max` (opcional): Data máxima de criação (ISO 8601)
- `updated_at_min` (opcional): Data mínima de atualização (ISO 8601)
- `updated_at_max` (opcional): Data máxima de atualização (ISO 8601)
- `published` (opcional): Produtos publicados (true, false)
- `free_shipping` (opcional): Produtos com frete grátis (true, false)
- `max_price` (opcional): Preço máximo (decimal)
- `min_price` (opcional): Preço mínimo (decimal)
- `category_id` (opcional): ID da categoria (integer)
- `handle` (opcional): Handle do produto (string)
- `fields` (opcional): Campos específicos para retornar
- `q` (opcional): Termo de busca

**Exemplo:**

```javascript
// Buscar produtos publicados dos últimos 30 dias
const response = await fetch(
  "/api/nuvemshop/products?published=true&created_at_min=2024-01-01T00:00:00Z&per_page=50"
);
const data = await response.json();
```

#### POST `/api/nuvemshop/products`

Cria um novo produto no Nuvemshop.

**Body:** Dados do produto conforme documentação do Nuvemshop

#### PUT `/api/nuvemshop/products`

Sincroniza produtos do Nuvemshop para o banco de dados local.

**Body:**

```json
{
  "syncPeriodDays": 30, // Período em dias para sincronizar (padrão: 30)
  "batchSize": 50 // Tamanho do lote para processamento (padrão: 50)
}
```

### 5. Produto Específico

#### GET `/api/nuvemshop/products/[id]`

Busca um produto específico pelo ID.

**Parâmetros:**

- `id`: ID do produto no Nuvemshop

**Parâmetros de Query:**

- `fields` (opcional): Campos específicos para retornar

#### PUT `/api/nuvemshop/products/[id]`

Atualiza um produto específico.

**Body:** Dados do produto para atualizar

#### DELETE `/api/nuvemshop/products/[id]`

Deleta um produto específico.

### 6. Imagens de Produtos

#### GET `/api/nuvemshop/products/[id]/images`

Busca todas as imagens de um produto específico.

**Parâmetros:**

- `id`: ID do produto no Nuvemshop

**Parâmetros de Query:**

- `page` (opcional): Número da página (padrão: 1)
- `per_page` (opcional): Itens por página (padrão: 50)
- `since` (opcional): Data ISO 8601 para buscar imagens desde
- `until` (opcional): Data ISO 8601 para buscar imagens até
- `fields` (opcional): Campos específicos para retornar

#### POST `/api/nuvemshop/products/[id]/images`

Adiciona uma nova imagem a um produto.

**Body:** Dados da imagem conforme documentação do Nuvemshop

### 7. Imagem Específica de Produto

#### GET `/api/nuvemshop/products/[id]/images/[imageId]`

Busca uma imagem específica de um produto.

#### PUT `/api/nuvemshop/products/[id]/images/[imageId]`

Atualiza uma imagem específica de um produto.

#### DELETE `/api/nuvemshop/products/[id]/images/[imageId]`

Deleta uma imagem específica de um produto.

### 8. Informações da Loja

#### GET `/api/nuvemshop/store`

Busca informações da loja.

**Parâmetros de Query:**

- `fields` (opcional): Campos específicos para retornar

## Estrutura de Resposta

Todas as rotas retornam uma resposta no formato:

```json
{
  "success": true,
  "data": {
    /* dados da API do Nuvemshop */
  },
  "message": "Mensagem opcional",
  "pagination": {
    /* informações de paginação quando aplicável */
  }
}
```

Em caso de erro:

```json
{
  "error": "Descrição do erro",
  "message": "Detalhes do erro"
}
```

## Autenticação

Todas as rotas requerem autenticação. O usuário deve estar logado no sistema para acessar as APIs do Nuvemshop.

## Limitações e Boas Práticas

1. **Rate Limiting**: Respeite os limites de taxa da API do Nuvemshop
2. **Paginação**: Use paginação para grandes volumes de dados
3. **Filtros de Data**: Use filtros de data para evitar buscar dados desnecessários
4. **Webhooks**: Considere usar webhooks do Nuvemshop para atualizações em tempo real
5. **Cache**: Implemente cache quando apropriado para reduzir chamadas à API

## Exemplos de Uso

### Buscar pedidos pagos dos últimos 30 dias

```javascript
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const response = await fetch(
  `/api/nuvemshop/orders?payment_status=paid&created_at_min=${thirtyDaysAgo.toISOString()}`
);
const data = await response.json();
```

### Sincronizar pedidos para o banco local

```javascript
const response = await fetch("/api/nuvemshop/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    syncPeriodDays: 60,
    batchSize: 100,
  }),
});
const result = await response.json();
```

### Cancelar um pedido

```javascript
const response = await fetch("/api/nuvemshop/orders/123456/cancel", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    reason: "customer",
    email: true,
    restock: true,
  }),
});
const result = await response.json();
```

### Buscar produtos publicados

```javascript
const response = await fetch(
  "/api/nuvemshop/products?published=true&per_page=50"
);
const data = await response.json();
```

### Sincronizar produtos para o banco local

```javascript
const response = await fetch("/api/nuvemshop/products", {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    syncPeriodDays: 60,
    batchSize: 100,
  }),
});
const result = await response.json();
```

### Buscar imagens de um produto

```javascript
const response = await fetch("/api/nuvemshop/products/123456/images");
const images = await response.json();
```

### Criar um novo produto

```javascript
const response = await fetch("/api/nuvemshop/products", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: { pt: "Produto Teste" },
    description: { pt: "Descrição do produto" },
    published: true,
    free_shipping: false,
    variants: [
      {
        price: "99.90",
        stock_management: true,
        stock: 10,
      },
    ],
  }),
});
const result = await response.json();
```

## Suporte

Para mais informações sobre a API do Nuvemshop, consulte a [documentação oficial](https://tiendanube.github.io/api-documentation/).
