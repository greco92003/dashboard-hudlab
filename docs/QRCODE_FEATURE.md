# Funcionalidade de QR Code para Links de Afiliado

## Visão Geral

A funcionalidade de QR Code permite que parceiros gerem códigos QR de alta qualidade (600x600px) para seus links de afiliado, facilitando o compartilhamento offline e em materiais impressos.

## Como Usar

### Para Parceiros

1. **Acesse a página de parceiros** (`/partners/home`)
2. **Localize o card "Link de Afiliado"**
3. **Clique no botão QR Code** (ícone de QR code) ao lado do botão de copiar
4. **No modal que abrir:**
   - Visualize o preview do QR code gerado
   - Clique em "Baixar PNG (600x600)" para fazer download
   - Use "Regenerar" se necessário

### Funcionalidades

- **Preview em tempo real**: QR code é gerado automaticamente ao abrir o modal
- **Download direto**: Arquivo PNG de 600x600 pixels
- **Nome personalizado**: Arquivo nomeado com a marca (ex: `qrcode-afiliado-nike.png`)
- **Validação de segurança**: Apenas links do próprio usuário podem gerar QR codes

## Implementação Técnica

### API Endpoints

#### `GET /api/qrcode/generate`
- **Parâmetros**: `url` (obrigatório), `brand` (opcional)
- **Retorna**: Arquivo PNG para download direto
- **Uso**: Download do QR code

#### `POST /api/qrcode/generate`
- **Body**: `{ url: string, brand?: string }`
- **Retorna**: `{ qrCode: string (base64), url: string, brand?: string }`
- **Uso**: Preview do QR code no modal

### Componentes

#### `QRCodeModal`
- Modal responsivo para exibir e baixar QR codes
- Estados de loading durante geração
- Botões para download e regeneração
- Exibição do link de afiliado com opções de copiar/abrir

### Segurança

- **Autenticação obrigatória**: Usuário deve estar logado
- **Validação de permissões**: Partners-media só podem gerar QR codes de suas marcas
- **Validação de URL**: Verifica formato válido do link
- **Rate limiting**: Proteção contra abuso (implementado pelo Next.js)

## Especificações do QR Code

- **Tamanho**: 600x600 pixels
- **Formato**: PNG
- **Cores**: Preto no branco
- **Margem**: 4 módulos
- **Correção de erro**: Nível M (15%)
- **Biblioteca**: `qrcode` (Node.js)

## Benefícios

### Para Parceiros
- **Compartilhamento offline**: Materiais impressos, cartões de visita
- **Facilidade mobile**: QR codes são mais fáceis de usar em dispositivos móveis
- **Profissionalismo**: Aparência mais profissional em materiais de marketing

### Para a Plataforma
- **Rastreamento mantido**: Links de afiliado preservam UTMs originais
- **Conversão melhorada**: Facilita acesso aos links
- **Experiência do usuário**: Interface intuitiva e responsiva

## Arquivos Modificados/Criados

### Novos Arquivos
- `app/api/qrcode/generate/route.ts` - API para geração de QR codes
- `components/QRCodeModal.tsx` - Modal para exibir e baixar QR codes
- `docs/QRCODE_FEATURE.md` - Esta documentação

### Arquivos Modificados
- `app/partners/home/page.tsx` - Adicionado botão e modal de QR code
- `package.json` - Adicionadas dependências `qrcode` e `@types/qrcode`

## Dependências Adicionadas

```json
{
  "qrcode": "^1.5.3",
  "@types/qrcode": "^1.5.5"
}
```

## Uso da Funcionalidade

1. **Geração automática**: QR code é gerado automaticamente ao abrir o modal
2. **Cache inteligente**: QR code é mantido em memória durante a sessão do modal
3. **Download otimizado**: Arquivo é gerado sob demanda, sem armazenamento
4. **Responsividade**: Interface adaptada para desktop e mobile

## Considerações de Performance

- **Geração em tempo real**: QR codes são gerados em milissegundos
- **Sem armazenamento**: Não ocupa espaço no Supabase Storage
- **Determinístico**: Mesmo link sempre gera o mesmo QR code
- **Eficiência**: Mais rápido que upload/download de arquivos

## Futuras Melhorias

- **Customização de cores**: Permitir cores personalizadas por marca
- **Tamanhos variados**: Opções de 300x300, 600x600, 1200x1200
- **Formatos adicionais**: SVG para impressão vetorial
- **Analytics**: Rastreamento de quantos QR codes foram gerados
- **Bulk generation**: Gerar QR codes para múltiplas marcas simultaneamente
