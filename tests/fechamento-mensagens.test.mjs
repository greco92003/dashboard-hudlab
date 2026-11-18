import assert from "node:assert/strict";
import test from "node:test";
import {
  lerValor,
  mensagemArteAprovada,
  mensagemConfirmacao,
  mensagemOrcamentoFinal,
  precosDoPedido,
  totalDaGrade,
} from "../lib/fechamento/mensagens.ts";

const bress = { nome: "", adulto: { "34/35": 3, "36/37": 5, "38/39": 5, "40/41": 12, "42/43": 3 }, infantil: {} };

test("arte aprovada de um modelo: o formato que a Schay já usa, com total e evento", () => {
  const texto = mensagemArteAprovada({ evento: "15/12", obs: "" }, [bress]);
  assert.equal(
    texto,
    "*ARTE APROVADA*\n\n*GRADE DE NUMERAÇÕES*\n34/35 - 3\n36/37 - 5\n38/39 - 5\n40/41 - 12\n42/43 - 3\n\nTOTAL: 28 PARES\nEvento: 15/12",
  );
});

test("vários modelos: um bloco por modelo, infantil no próprio bloco, modelo vazio fica de fora", () => {
  const modelos = [
    { nome: "MODELO PRETO (logo centralizado)", adulto: { "34/35": 2, "40/41": 3 }, infantil: { "32/33": 2 } },
    { nome: "", adulto: {}, infantil: {} },
    { nome: "", adulto: { "36/37": 4 }, infantil: {} },
  ];
  const texto = mensagemArteAprovada({ evento: "", obs: "1 par 32/33 de brinde" }, modelos);
  assert.equal(
    texto,
    "*ARTES APROVADAS*\n\n*MODELO PRETO (logo centralizado)*\n34/35 - 2\n40/41 - 3\nInfantil:\n32/33 - 2\n\n*MODELO 3*\n36/37 - 4\n\nTOTAL: 11 PARES\nObs.: 1 par 32/33 de brinde",
  );
  assert.equal(totalDaGrade(modelos), 11);
  assert.equal(mensagemArteAprovada({ evento: "", obs: "" }, [{ nome: "", adulto: {}, infantil: {} }]), null);
});

test("orçamento final com frete do cliente: preços da faixa 24 a 35 e totais com frete", () => {
  const o = precosDoPedido({ pares: 28, frete: 59 });
  const texto = mensagemOrcamentoFinal(o);
  assert.match(texto, /\*Seu orçamento: 28 pares\*/);
  assert.match(texto, /Total dos pares sem desconto: R\$ 1\.621,20/);
  assert.match(texto, /\*Frete: R\$ 59,00\*\nOs totais abaixo já incluem o frete\./);
  assert.match(texto, /\*1\. Pix à vista\*\nR\$ 52,10 o par\nTotal com frete: R\$ 1\.517,80/);
  assert.match(texto, /\*2\. Cartão em até 6x sem juros\*\nR\$ 55,00 o par\nTotal com frete: R\$ 1\.599,00/);
  assert.match(texto, /\*3\. Em 2x no Pix sem juros \(50% \+ 50%\)\*\nR\$ 55,00 o par\nTotal com frete: R\$ 1\.599,00/);
});

test("36 pares ou mais: frete grátis, frete informado é ignorado", () => {
  const texto = mensagemOrcamentoFinal(precosDoPedido({ pares: 36, frete: 80 }));
  assert.match(texto, /\*Frete: GRÁTIS\*/);
  assert.match(texto, /\*1\. Pix à vista\*\nR\$ 50,90 o par\nTotal: R\$ 1\.832,40/);
  assert.match(texto, /\*2\. Cartão em até 6x sem juros\*\nR\$ 53,80 o par\nTotal: R\$ 1\.936,80/);
});

test("confirmação: cartão com parcelas, Pix com chave, 50/50 com as duas partes; valor do negócio sem frete", () => {
  const o = precosDoPedido({ pares: 28, frete: 59 });
  const cartao = mensagemConfirmacao(o, "cartao");
  assert.equal(cartao.precoDoPar, 55);
  assert.equal(cartao.valorDosPares, 1540);
  assert.equal(cartao.total, 1599);
  assert.match(cartao.texto, /Em até 6x de R\$ 266,50 sem juros/);
  assert.match(cartao.texto, /link de pagamento/);

  const pix = mensagemConfirmacao(precosDoPedido({ pares: 36, frete: null }), "pix");
  assert.match(pix.texto, /\*Pedido confirmado: 36 pares\*\n\n\*1\. Pix à vista\*\nR\$ 50,90 o par\nFrete: GRÁTIS\nTotal: R\$ 1\.832,40/);
  assert.match(pix.texto, /28\.757\.684\/0001-90/);

  const meio = mensagemConfirmacao(o, "pix5050");
  assert.match(meio.texto, /1ª parte \(50%\), para liberar a produção: R\$ 799,50/);
  assert.match(meio.texto, /2ª parte \(50%\), antes do envio: R\$ 799,50/);
});

test("abaixo de 12 pares não há orçamento; valores em reais são lidos com vírgula ou ponto", () => {
  assert.equal(precosDoPedido({ pares: 10, frete: 59 }), null);
  assert.equal(lerValor("59,00"), 59);
  assert.equal(lerValor("R$ 1.059,38"), 1059.38);
  assert.equal(lerValor("94.87"), 94.87);
  assert.equal(lerValor(""), null);
});
