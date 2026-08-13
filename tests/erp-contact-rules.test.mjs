import test from "node:test";
import assert from "node:assert/strict";
import { isValidCpfCnpj, mapGhlContactToErpDraft } from "../lib/erp/contact-rules.ts";

const definitions = [
  { id: "cnpj", name: "CNPJ", fieldKey: "contact.cnpj", model: "contact", dataType: "TEXT" },
  { id: "cpf", name: "CPF", fieldKey: "contact.cpf", model: "contact", dataType: "TEXT" },
  { id: "ie", name: "Inscrição Estadual", fieldKey: "contact.inscricao_estadual", model: "contact", dataType: "TEXT" },
  { id: "address", name: "Endereço (Rua/Avenida)", fieldKey: "contact.endereo_ruaavenida", model: "contact", dataType: "TEXT" },
  { id: "postal", name: "CEP (Favor verificar no Google se está apontando para o endereço correto)", fieldKey: "contact.cep_favor_verificar", model: "contact", dataType: "TEXT" },
];

test("mapeia pessoa jurídica pelo campo CNPJ e replica o e-mail para NFe", () => {
  const result = mapGhlContactToErpDraft({
    id: "1",
    contactName: "Responsável",
    companyName: "Empresa Exemplo Ltda",
    email: "nfe@exemplo.com",
    state: "sp",
    customFields: [
      { id: "cnpj", value: "11.222.333/0001-81" },
      { id: "ie", value: "123456789" },
      { id: "address", value: "Rua das Flores" },
      { id: "postal", value: "01234-567" },
    ],
  }, definitions);

  assert.equal(result.personType, "J");
  assert.equal(result.name, "Empresa Exemplo Ltda");
  assert.equal(result.fantasy, "Empresa Exemplo Ltda");
  assert.equal(result.emailNfe, "nfe@exemplo.com");
  assert.equal(result.state, "SP");
  assert.equal(result.address, "Rua das Flores");
  assert.equal(result.postalCode, "01234-567");
});

test("mapeia pessoa física quando o campo CNPJ está vazio", () => {
  const result = mapGhlContactToErpDraft({
    id: "2",
    firstName: "Angélica",
    lastName: "Leal",
    customFields: [{ id: "cpf", value: "529.982.247-25" }],
  }, definitions);

  assert.equal(result.personType, "F");
  assert.equal(result.name, "Angélica Leal");
  assert.equal(result.document, "529.982.247-25");
});

test("valida os dígitos verificadores de CPF e CNPJ", () => {
  assert.equal(isValidCpfCnpj("529.982.247-25", "F"), true);
  assert.equal(isValidCpfCnpj("529.982.247-24", "F"), false);
  assert.equal(isValidCpfCnpj("11.222.333/0001-81", "J"), true);
  assert.equal(isValidCpfCnpj("11.222.333/0001-80", "J"), false);
});
