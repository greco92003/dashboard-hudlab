import assert from "node:assert/strict";
import test from "node:test";
import {
  avaliarChegada,
  avaliarFechamento,
  codigoValido,
  gerarCodigo,
  lerSatisfacao,
  linkDoCodigo,
  normalizarCodigo,
  numerosDoPrograma,
  pagoDeUmaVez,
  primeiroNome,
  telefoneComparavel,
} from "../lib/hud-indica/regras.ts";

const sequencia = (...valores) => {
  let i = 0;
  return () => valores[i++ % valores.length];
};

test("código: primeiro nome sem acento e 3 caracteres, no formato que o site aceita", () => {
  const c = gerarCodigo("ÂNGELA Maria", sequencia(0, 0.5, 0.99));
  assert.match(c, /^angela-[a-z2-9]{3}$/);
  assert.equal(codigoValido(c), true);
  assert.equal(gerarCodigo("", sequencia(0.1)).startsWith("cliente-"), true);
  assert.equal(gerarCodigo("José-Carlos & Cia", sequencia(0.1)).startsWith("josecarlos-"), true);
  // sem caracteres que se confundem
  for (let i = 0; i < 200; i++) assert.doesNotMatch(gerarCodigo("Ana").slice(4), /[01ilo]/);
});

test("código do campo Afiliado e link pessoal", () => {
  assert.equal(normalizarCodigo("  Ana-X7K "), "ana-x7k");
  assert.equal(normalizarCodigo("a b"), null);
  assert.equal(normalizarCodigo(""), null);
  assert.equal(linkDoCodigo("ana-x7k"), "https://www.hudlab.com.br/indica/ana-x7k");
  assert.equal(primeiroNome("ANA PAULA SILVA"), "Ana");
});

test("resposta da pesquisa: os 3 botões; 'Sim, tudo certo' do modelo antigo não é nota", () => {
  assert.equal(lerSatisfacao("Nota 10!"), "Nota 10");
  assert.equal(lerSatisfacao("Ficou ok"), "Ficou ok");
  assert.equal(lerSatisfacao("Tive um problema"), "Tive um problema");
  assert.equal(lerSatisfacao("Não, tive problemas"), "Tive um problema");
  assert.equal(lerSatisfacao("Sim, tudo certo"), null);
  assert.equal(lerSatisfacao(""), null);
});

test("chegada: não vale indicar a si mesmo nem quem já é cliente", () => {
  const indicador = { contactId: "c1", telefone: "+55 51 99999-0000", email: "ana@x.com" };
  assert.deepEqual(avaliarChegada({ indicador, indicado: { contactId: "c2", telefone: "51988887777" }, indicadoJaComprou: false }), {
    valida: true,
    motivo: null,
  });
  assert.equal(avaliarChegada({ indicador, indicado: { contactId: "c1" }, indicadoJaComprou: false }).valida, false);
  assert.equal(avaliarChegada({ indicador, indicado: { contactId: "c2", telefone: "(51) 99999-0000" }, indicadoJaComprou: false }).motivo, "Mesmo telefone de quem indicou.");
  assert.equal(avaliarChegada({ indicador, indicado: { contactId: "c2", email: "ANA@x.com " }, indicadoJaComprou: false }).motivo, "Mesmo e-mail de quem indicou.");
  assert.equal(avaliarChegada({ indicador, indicado: { contactId: "c2" }, indicadoJaComprou: true }).motivo, "Já é cliente: tem pedido ganho.");
  assert.equal(telefoneComparavel("+55 (51) 99999-0000"), "51999990000");
});

test("fechamento: à vista libera na hora; 50/50 e boleto esperam; prazo e documento", () => {
  const base = { status: "recebida", expiraEmMs: 1000, agoraMs: 500, documentoIndicado: "12.345.678/0001-90", documentosIndicador: ["98765432100"] };
  assert.equal(avaliarFechamento({ ...base, formaDePagamento: "Pix à vista" }).status, "liberada");
  assert.equal(avaliarFechamento({ ...base, formaDePagamento: "Cartão de Crédito" }).status, "liberada");
  assert.equal(avaliarFechamento({ ...base, formaDePagamento: "Pix 50/50" }).status, "fechou");
  assert.equal(avaliarFechamento({ ...base, formaDePagamento: "Boleto 30/60" }).status, "fechou");
  assert.equal(avaliarFechamento({ ...base, agoraMs: 2000, formaDePagamento: "Pix à vista" }).status, "expirada");
  assert.equal(
    avaliarFechamento({ ...base, documentosIndicador: ["12345678000190"], formaDePagamento: "Pix à vista" }).motivo,
    "Mesmo CNPJ ou CPF de quem indicou.",
  );
  assert.equal(avaliarFechamento({ ...base, status: "paga", formaDePagamento: "Pix à vista" }).status, "paga");
  assert.equal(pagoDeUmaVez("Pix 50/50"), false);
});

test("números do programa: adesão, conversão, fila de Pix e prêmios pagos", () => {
  const ind = (status, indicador_id, valor = null) => ({ status, indicador_id, premio_centavos: 10000, valor_centavos: valor, criado_em: "", pago_em: null });
  const n = numerosDoPrograma(10, [
    ind("recebida", "a"),
    ind("liberada", "a", 200000),
    ind("paga", "b", 150000),
    ind("invalida", "c"),
    ind("fechou", "d", 100000),
  ]);
  assert.equal(n.indicadoresAtivos, 3);
  assert.equal(n.adesaoPct, 30);
  assert.equal(n.invalidas, 1);
  assert.equal(n.emAndamento, 1);
  assert.equal(n.fechadas, 3);
  assert.equal(n.conversaoPct, 75);
  assert.equal(n.pixAPagar, 1);
  assert.equal(n.pixAPagarCentavos, 10000);
  assert.equal(n.premiosPagosCentavos, 10000);
  assert.equal(n.faturamentoIndicadoCentavos, 450000);
});
