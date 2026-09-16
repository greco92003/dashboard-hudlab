# Ordem de produção e etiquetas no Cadastro ERP

## Objetivo
Depois de criar o pedido de venda no `/cadastro-erp`, gerar a ordem de produção (OP) no Tiny e imprimir as etiquetas sem sair da aplicação. Em `/cadastro-erp/pedidos`, imprimir as etiquetas de qualquer pedido.

## Limites da API do Tiny
- A v3 tem `POST /pedidos/{id}/gerar-ordem-producao` sem corpo e com retorno não documentado. A v2 (`gerar.ordem.producao.pedido.php`) devolve, por item, `quantidade` e `quantidade_gerada`, por isso a geração usa a v2.
- Nenhuma versão deixa escolher a quantidade, listar OPs ou imprimir as etiquetas de OP. As etiquetas são geradas por nós.

## Gerar OP (`/cadastro-erp`, depois do pedido criado)
1. Janela com os itens do pedido (descrição, quantidade vendida, estoque disponível via `GET /estoque/{idProduto}`).
2. Item com `disponivel > 0` mostra aviso: o Tiny pode gerar menos que o vendido.
3. Ao confirmar, chama a v2 com `lancarEstoque=N`.
4. Compara vendido × gerado por item. Divergência (ou item fabricado ausente do retorno) mostra alerta vermelho com os números e o botão "Corrigir no Tiny" (lista de ordens de produção do Tiny em nova aba).
5. Registro em `erp_ordens_producao` (pedido, data, usuário, situação, itens). Gerar de novo exige confirmação explícita.

## Etiquetas
- PDF 80×50 mm (POS-9210), uma etiqueta por tamanho (item do pedido), itens repetidos somados numa só.
- Dados: descrição do item, no padrão `Tipo Código - Modelo - Cor - Tamanho`. Fora do padrão, imprime a descrição inteira com quebra de linha.
- Layout em preto sólido: tipo pequeno no topo; código e modelo em destaque; cor embaixo à esquerda; tamanho grande num card arredondado embaixo à direita.
- "Livro Digital" não gera etiqueta.
- Impressão: o PDF é carregado num iframe oculto e a janela de impressão abre direto.

## A validar com a primeira OP real
- Formato real do retorno da v2.
- Quantidade de etiquetas (uma por tamanho × uma por par).
- URL da lista de ordens de produção no Tiny.
