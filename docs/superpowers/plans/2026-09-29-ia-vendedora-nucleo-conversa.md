# IA vendedora — fatia 1 (núcleo de conversa) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma IA (persona "Lia") que atende no WhatsApp, do ponto em que hoje o vendedor humano assume até o cliente ficar pronto para pagar, acionada por um workflow do GHL e testável por palavra-chave antes de qualquer cliente real.

**Architecture:** O GHL cuida do gatilho e da espera (workflow "Cliente respondeu" → espera 90s → webhook). O endpoint `POST /api/ai-seller/respond` decide se roda (função pura), monta o contexto (manual, conversa, oportunidade ao vivo), roda um loop de ferramentas no `gpt-5.6-terra` e grava cada acionamento em `ai_seller_runs`. A lógica fica em módulos puros testáveis (`decide`, `tools`, `loop`, `prompt`, `pricing`, `packing`) e as chamadas externas em módulos server-only (`ghl-actions`, `runs-store`, `run`).

**Tech Stack:** Next.js (App Router, Vercel), TypeScript, OpenAI Responses API (`openai` 6.48, function tools), GHL API (`services.leadconnectorhq.com`), Supabase (Postgres + RLS), testes com `node --test` + `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-29-ia-vendedora-nucleo-conversa-design.md`

## Global Constraints

- Módulos puros (`config`, `pricing`, `packing`, `decide`, `tools`, `loop`, `prompt`) não importam `server-only`, `next/*` nem clientes Supabase em tempo de execução — só `import type`. É o que permite testá-los com `node --test`.
- Testes: `node --experimental-strip-types --import ./tests/ts-extension-resolve.mjs --test <arquivos>`, estilo dos testes existentes (`node:test` + `node:assert/strict`), arquivos em `tests/`.
- Modelo: `gpt-5.6-terra`, `reasoning.effort: "medium"`, `store: false` com `include: ["reasoning.encrypted_content"]`, `tool_choice: "required"`, `parallel_tool_calls: false`.
- Tabela de preço por par (manual): 12–23: 67,90 · 24–99: 59,90 · 100–499: 54,90 · 500–999: 52,90 · 1.000+: 49,90. Mínimo 12 pares. Frete grátis a partir de 36 pares.
- Limiares: agrupamento 80s · máximo 6 mensagens da IA por contato por hora · máximo 5 passos no loop · pedido grande = 500 pares ou mais.
- Tags: `ia-atendimento` (contato na IA), `ia-teste` (ambiente de teste), `ia-escalado` (passado para humano).
- Persona padrão "Lia" (`AI_SELLER_PERSONA_NAME`). Escalonamento para a Schay: `AI_SELLER_ESCALATION_USER_ID=XdbufXkZKhQ5YeleSeCw`, `AI_SELLER_ESCALATION_NAME=Schay`.
- IDs do GHL: pipeline Atendimento `xrsxNXLo0SIkWAxiHPf0`; pipeline Fábrica de Mockups `ShSCF8BTLIdKHAjq491X` (já em `lib/ghl/pipelines.ts` como `GHL_MOCKUP_FACTORY_PIPELINE_ID`).
- Nunca enviar WhatsApp a cliente real durante o desenvolvimento. Escrita e envio ao vivo só no contato de teste da equipe indicado pelo Greco, com a autorização dele.
- Migrações e consultas de verificação: conexão direta pelo `DATABASE_URL` do `.env.local` (projeto `ubqervuhvwnztxmsodlg`, pacote `pg` já instalado), com `scripts/run-sql.mjs` criado na Task 7. O conector Supabase MCP estava sem credencial em 29/09 e não é necessário.
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Ajustes em relação ao spec

Decididos durante o planejamento; o spec deve ser atualizado junto com a Task 1.

1. **`cotar_frete` virou parte de `atualizar_orcamento`** (com CEP opcional). Uma ferramenta a menos; o frete só existe junto de uma quantidade.
2. **Nova ferramenta `mover_etapa`**, aprovada pelo Greco em 29/09: "Atendimento" na primeira resposta, "Negociação" quando o cliente discute condições, "Prioridade de Fechamento" quando diz que quer fechar. Só move para frente e só dentro do pipeline Atendimento. É o que gera a tag `emnegociacao` e põe a conversa no Copiloto, no Auditor e no funil.
3. **Corte do "humano assumiu" = primeira rodada da IA para o contato**, não a criação da oportunidade. Não sabemos se o robô cria oportunidade nova para cliente recorrente; se reaproveitar uma antiga, o corte pela criação calaria a IA e deixaria o cliente no vácuo. Na primeira rodada não há checagem de humano.
4. **Decisão `pulou:sem_tag`**: o endpoint confere a tag `ia-atendimento` por conta própria, caso o workflow seja configurado errado.
5. **Modo `dryRun`** no endpoint: roda o cérebro numa conversa real sem enviar nada e sem gravar. Serve para validar o prompt antes do piloto.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/ghl/ai-seller/config.ts` | Constantes, listas fechadas (motivos, etapas) e leitura de env |
| `lib/ghl/ai-seller/types.ts` | Tipos compartilhados (decisões, ações, execução de ferramenta) |
| `lib/ghl/ai-seller/pricing.ts` | Preço por faixa, subtotal, frete grátis |
| `lib/freight/packing.ts` | Converte pares em caixas cadastradas |
| `lib/ghl/ai-seller/decide.ts` | Decide se o acionamento roda, pula, ou se um humano assumiu |
| `lib/ghl/ai-seller/tools.ts` | Definição das ferramentas para o modelo e execução com ações injetadas |
| `lib/ghl/ai-seller/loop.ts` | Loop modelo → ferramentas com retentativa e limite de passos |
| `lib/ghl/ai-seller/prompt.ts` | Instruções da persona e bloco de contexto |
| `lib/ghl/sales-agent/agent.ts` | (modificado) exporta `buildTranscriptParts` com rótulo "VOCÊ" e `todayBRDateString` |
| `lib/freight/quote.ts` | Cotação de frete extraída da rota, reusável fora de requisição de usuário |
| `app/api/freight/quote/route.ts` | (modificado) passa a chamar `quoteFreight` |
| `supabase/migrations/ai_seller_runs.sql` | Tabela de registro + RLS |
| `supabase/migrations/v_contatos_importados_source_exclui_ia_teste.sql` | Testadores fora das métricas de negócio |
| `lib/ghl/ai-seller/runs-store.ts` | Leitura do histórico da IA e gravação das rodadas |
| `lib/ghl/api.ts` | (modificado) `tags` e `assignedTo` em `GhlContactDetail` |
| `lib/ghl/ai-seller/ghl-actions.ts` | Envio de WhatsApp, tags, atribuição, cadeia do orçamento, mudança de etapa, frete |
| `scripts/ai-seller-verify-ghl.mjs` | Verificação ao vivo dos contratos da API do GHL num contato de teste |
| `lib/ghl/ai-seller/run.ts` | Orquestração de um acionamento |
| `app/api/ai-seller/respond/route.ts` | Endpoint chamado pelo workflow do GHL |
| `vercel.json` | (modificado) `maxDuration` do endpoint |
| `package.json` | (modificado) script `test:ai-seller` |

---

### Task 1: Configuração, preço e empacotamento

**Files:**
- Create: `lib/ghl/ai-seller/config.ts`
- Create: `lib/ghl/ai-seller/types.ts`
- Create: `lib/ghl/ai-seller/pricing.ts`
- Create: `lib/freight/packing.ts`
- Create: `tests/ai-seller-pricing.test.mjs`
- Create: `tests/ai-seller-packing.test.mjs`
- Modify: `package.json` (scripts)
- Modify: `docs/superpowers/specs/2026-09-29-ia-vendedora-nucleo-conversa-design.md`

**Interfaces:**
- Produces:
  - `config.ts`: `AI_SELLER_MODEL`, `AI_TAG`, `AI_TEST_TAG`, `AI_ESCALATED_TAG`, `DEBOUNCE_MS`, `MAX_AI_SENDS_PER_HOUR`, `MAX_AGENT_STEPS`, `LARGE_ORDER_PARES`, `FREE_SHIPPING_MIN_PARES`, `GHL_ATENDIMENTO_PIPELINE_ID`, `ART_CHANGE_STAGE_NAME`, `AI_MOVABLE_STAGES`, `type AiMovableStage`, `MODEL_ESCALATION_REASONS`, `type ModelEscalationReason`, `personaName(): string`, `escalationUserId(): string`, `escalationUserName(): string`
  - `types.ts`: `EscalationReason`, `RunDecision`, `FunctionCall`, `ToolExecution`, `SellerActions`, `BudgetWrite`
  - `pricing.ts`: `MIN_PARES`, `unitPriceForPares(pares: number): number | null`, `subtotalForPares(pares: number): number | null`, `hasFreeShipping(pares: number): boolean`, `roundMoney(value: number): number`
  - `packing.ts`: `PackableVolume`, `VolumeSelection`, `packPairsIntoVolumes(pares: number, volumes: PackableVolume[]): VolumeSelection[]`

- [ ] **Step 1: Escrever os testes de preço**

`tests/ai-seller-pricing.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  hasFreeShipping,
  subtotalForPares,
  unitPriceForPares,
} from "../lib/ghl/ai-seller/pricing.ts";

test("preço por par segue as faixas do manual", () => {
  assert.equal(unitPriceForPares(12), 67.9);
  assert.equal(unitPriceForPares(23), 67.9);
  assert.equal(unitPriceForPares(24), 59.9);
  assert.equal(unitPriceForPares(99), 59.9);
  assert.equal(unitPriceForPares(100), 54.9);
  assert.equal(unitPriceForPares(499), 54.9);
  assert.equal(unitPriceForPares(500), 52.9);
  assert.equal(unitPriceForPares(999), 52.9);
  assert.equal(unitPriceForPares(1000), 49.9);
});

test("abaixo do mínimo ou quantidade inválida não tem preço", () => {
  assert.equal(unitPriceForPares(11), null);
  assert.equal(unitPriceForPares(0), null);
  assert.equal(unitPriceForPares(12.5), null);
});

test("subtotal bate com orçamentos reais", () => {
  assert.equal(subtotalForPares(12), 814.8);
  assert.equal(subtotalForPares(36), 2156.4);
  assert.equal(subtotalForPares(40), 2396);
  assert.equal(subtotalForPares(10), null);
});

test("frete grátis a partir de 36 pares", () => {
  assert.equal(hasFreeShipping(35), false);
  assert.equal(hasFreeShipping(36), true);
});
```

- [ ] **Step 2: Escrever os testes de empacotamento**

`tests/ai-seller-packing.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { packPairsIntoVolumes } from "../lib/freight/packing.ts";

const CAIXAS = [
  { id: "c1", pairs_capacity: 1 },
  { id: "c3", pairs_capacity: 3 },
  { id: "c6", pairs_capacity: 6 },
  { id: "c12", pairs_capacity: 12 },
  { id: "c18", pairs_capacity: 18 },
];

function asMap(selection) {
  return Object.fromEntries(selection.map((s) => [s.volume_id, s.count]));
}

test("quantidade que cabe numa caixa usa a menor caixa que comporta", () => {
  assert.deepEqual(asMap(packPairsIntoVolumes(12, CAIXAS)), { c12: 1 });
  assert.deepEqual(asMap(packPairsIntoVolumes(13, CAIXAS)), { c18: 1 });
});

test("quantidade maior enche caixas grandes e fecha com a menor que comporta o resto", () => {
  assert.deepEqual(asMap(packPairsIntoVolumes(20, CAIXAS)), { c18: 1, c3: 1 });
  assert.deepEqual(asMap(packPairsIntoVolumes(40, CAIXAS)), { c18: 2, c6: 1 });
});

test("sem pares ou sem caixas não seleciona nada", () => {
  assert.deepEqual(packPairsIntoVolumes(0, CAIXAS), []);
  assert.deepEqual(packPairsIntoVolumes(12, []), []);
});
```

- [ ] **Step 3: Adicionar o script de teste e ver os testes falharem**

Em `package.json`, dentro de `"scripts"`, depois de `"test:ghl"`:

```json
"test:ai-seller": "node --experimental-strip-types --import ./tests/ts-extension-resolve.mjs --test tests/ai-seller-pricing.test.mjs tests/ai-seller-packing.test.mjs",
```

Run: `npm run test:ai-seller`
Expected: FAIL — `Cannot find module` para `pricing.ts` e `packing.ts`.

- [ ] **Step 4: Criar `lib/ghl/ai-seller/config.ts`**

```ts
// Constantes da IA vendedora (spec: docs/superpowers/specs/2026-09-29-ia-vendedora-nucleo-conversa-design.md).
// Módulo puro: sem server-only, next ou Supabase.

export const AI_SELLER_MODEL = "gpt-5.6-terra";

export const AI_TAG = "ia-atendimento";
export const AI_TEST_TAG = "ia-teste";
export const AI_ESCALATED_TAG = "ia-escalado";

/** Mensagem do cliente mais nova que isso: outra chamada, disparada por ela, vai responder. */
export const DEBOUNCE_MS = 80_000;
export const MAX_AI_SENDS_PER_HOUR = 6;
export const MAX_AGENT_STEPS = 5;
export const LARGE_ORDER_PARES = 500;
export const FREE_SHIPPING_MIN_PARES = 36;

export const GHL_ATENDIMENTO_PIPELINE_ID = "xrsxNXLo0SIkWAxiHPf0";
export const ART_CHANGE_STAGE_NAME = "Alteração";

export const AI_MOVABLE_STAGES = [
  "Atendimento",
  "Negociação",
  "Prioridade de Fechamento",
] as const;
export type AiMovableStage = (typeof AI_MOVABLE_STAGES)[number];

export const MODEL_ESCALATION_REASONS = [
  "pedido_grande",
  "desconto_ou_excecao",
  "reclamacao",
  "cliente_pediu_pessoa",
  "pronto_para_pagar",
  "outro",
] as const;
export type ModelEscalationReason = (typeof MODEL_ESCALATION_REASONS)[number];

export function personaName(): string {
  return process.env.AI_SELLER_PERSONA_NAME || "Lia";
}

export function escalationUserId(): string {
  const id = process.env.AI_SELLER_ESCALATION_USER_ID;
  if (!id) throw new Error("AI_SELLER_ESCALATION_USER_ID não configurado");
  return id;
}

export function escalationUserName(): string {
  return process.env.AI_SELLER_ESCALATION_NAME || "Schay";
}
```

- [ ] **Step 5: Criar `lib/ghl/ai-seller/types.ts`**

```ts
import type { AiMovableStage, ModelEscalationReason } from "./config";

export type EscalationReason =
  | ModelEscalationReason
  | "falha_tecnica"
  | "limite_mensagens";

export type RunDecision =
  | "respondeu"
  | "nao_respondeu"
  | "escalou"
  | "humano_assumiu"
  | "pulou:sem_tag"
  | "pulou:agrupando"
  | "pulou:ja_respondido"
  | "pulou:limite"
  | "erro";

export interface FunctionCall {
  call_id: string;
  name: string;
  arguments: string;
}

export interface ToolExecution {
  /** Texto devolvido ao modelo como function_call_output. */
  output: string;
  /** true encerra a rodada (enviar_mensagens, nao_responder, escalar_para_humano). */
  terminal: boolean;
  sentMessageIds: string[];
  decision?: "respondeu" | "nao_respondeu" | "escalou";
  escalationReason?: EscalationReason;
}

export interface BudgetWrite {
  pares: number;
  unitario: number;
  subtotal: number;
  /** null = frete ainda desconhecido (falta CEP); os campos de frete não são tocados. */
  frete: number | null;
}

/** Efeitos colaterais de uma rodada, já presos ao contato e à oportunidade. */
export interface SellerActions {
  sendMessages(messages: string[]): Promise<string[]>;
  escalate(input: {
    motivo: EscalationReason;
    resumo: string;
    mensagemCliente: string;
  }): Promise<string[]>;
  quoteFreight(input: {
    cep: string;
    pares: number;
    valorNf: number;
  }): Promise<number | null>;
  writeBudget(input: BudgetWrite): Promise<void>;
  requestArtChange(resumo: string): Promise<"movido" | "ja_em_alteracao">;
  moveStage(
    etapa: AiMovableStage,
  ): Promise<"movido" | "sem_mudanca" | "fora_do_atendimento">;
}
```

- [ ] **Step 6: Criar `lib/ghl/ai-seller/pricing.ts`**

```ts
import { FREE_SHIPPING_MIN_PARES } from "./config";

// Faixas do manual (seção de preços). A IA nunca faz conta de preço:
// tudo passa por aqui.
const PRICE_TIERS = [
  { min: 1000, unit: 49.9 },
  { min: 500, unit: 52.9 },
  { min: 100, unit: 54.9 },
  { min: 24, unit: 59.9 },
  { min: 12, unit: 67.9 },
] as const;

export const MIN_PARES = 12;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function unitPriceForPares(pares: number): number | null {
  if (!Number.isInteger(pares) || pares < MIN_PARES) return null;
  const tier = PRICE_TIERS.find((t) => pares >= t.min);
  return tier ? tier.unit : null;
}

export function subtotalForPares(pares: number): number | null {
  const unit = unitPriceForPares(pares);
  return unit == null ? null : roundMoney(unit * pares);
}

export function hasFreeShipping(pares: number): boolean {
  return pares >= FREE_SHIPPING_MIN_PARES;
}
```

- [ ] **Step 7: Criar `lib/freight/packing.ts`**

```ts
export interface PackableVolume {
  id: string;
  pairs_capacity: number;
}

export interface VolumeSelection {
  volume_id: string;
  count: number;
}

/**
 * Converte uma quantidade de pares nas caixas cadastradas em freight_volumes:
 * enquanto sobrar par, usa a menor caixa que comporta o resto; se nenhuma
 * comporta, usa a maior e continua. 20 pares = 18 + 3, não 18 + 1 + 1.
 */
export function packPairsIntoVolumes(
  pares: number,
  volumes: PackableVolume[],
): VolumeSelection[] {
  const boxes = volumes
    .filter((v) => v.pairs_capacity > 0)
    .sort((a, b) => a.pairs_capacity - b.pairs_capacity);
  if (boxes.length === 0 || pares <= 0) return [];

  const largest = boxes[boxes.length - 1];
  const counts = new Map<string, number>();
  let remaining = pares;
  while (remaining > 0) {
    const pick = boxes.find((b) => b.pairs_capacity >= remaining) ?? largest;
    counts.set(pick.id, (counts.get(pick.id) ?? 0) + 1);
    remaining -= pick.pairs_capacity;
  }
  return [...counts.entries()].map(([volume_id, count]) => ({ volume_id, count }));
}
```

- [ ] **Step 8: Rodar os testes**

Run: `npm run test:ai-seller`
Expected: PASS, 7 testes.

- [ ] **Step 9: Atualizar o spec com os ajustes**

No spec, na tabela de ferramentas:
- remover a linha `cotar_frete`;
- trocar a entrada de `atualizar_orcamento` por: "quantidade de pares, CEP (opcional) — calcula o preço unitário no código pela tabela de faixas, o frete pelo motor existente quando há CEP e menos de 36 pares (0 a partir de 36), grava a cadeia do orçamento no GHL e devolve os valores. O LLM nunca faz conta de preço.";
- adicionar a linha `mover_etapa` | etapa ("Atendimento", "Negociação" ou "Prioridade de Fechamento") | "Move a oportunidade para frente dentro do pipeline Atendimento: Atendimento na primeira resposta, Negociação quando o cliente discute condições, Prioridade de Fechamento quando diz que quer fechar. Nunca volta etapa e nunca tira a oportunidade da Fábrica de Mockups.".

No passo 3 do Fluxo, trocar o item de "humano assumiu" por: "há mensagem de humano (saída que não é automação nem enviada pela IA) depois da primeira rodada da IA para esse contato → `humano_assumiu` (remove a tag `ia-atendimento`, deixa nota, não responde). Na primeira rodada não há essa checagem: o histórico antigo de um cliente recorrente não cala a IA." E acrescentar antes dele: "contato sem a tag `ia-atendimento` → `pulou:sem_tag` (defesa contra workflow mal configurado)."

Na lista de `decision` da tabela `ai_seller_runs`, acrescentar `pulou:sem_tag`.

- [ ] **Step 10: Commit**

```bash
git add lib/ghl/ai-seller/config.ts lib/ghl/ai-seller/types.ts lib/ghl/ai-seller/pricing.ts lib/freight/packing.ts tests/ai-seller-pricing.test.mjs tests/ai-seller-packing.test.mjs package.json docs/superpowers/specs/2026-09-29-ia-vendedora-nucleo-conversa-design.md
git commit -m "feat: base da IA vendedora — faixas de preço e empacotamento em caixas"
```

---

### Task 2: Decisão de rodar

**Files:**
- Create: `lib/ghl/ai-seller/decide.ts`
- Create: `tests/ai-seller-decide.test.mjs`
- Modify: `package.json` (acrescentar o arquivo ao `test:ai-seller`)

**Interfaces:**
- Consumes: `DEBOUNCE_MS`, `MAX_AI_SENDS_PER_HOUR` (config.ts); `NegotiationMessage` (`lib/ghl/negotiation-conversations.ts`, só tipo — campos `id`, `direction`, `dateAdded`, `isAutomated`).
- Produces: `DecideInput`, `DecideResult`, `decideRun(input: DecideInput): DecideResult`, `isHumanSellerMessage(message, aiSentMessageIds, cutoffMs): boolean`

- [ ] **Step 1: Escrever os testes**

`tests/ai-seller-decide.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { decideRun } from "../lib/ghl/ai-seller/decide.ts";

const NOW = Date.parse("2026-09-29T15:00:00.000Z");
const at = (secondsAgo) => new Date(NOW - secondsAgo * 1000).toISOString();
const msg = (id, direction, secondsAgo, extra = {}) => ({
  id,
  direction,
  body: "",
  dateAdded: at(secondsAgo),
  userId: null,
  attachments: [],
  isAutomated: false,
  ...extra,
});
const input = (over = {}) => ({
  now: NOW,
  hasAiTag: true,
  messages: [],
  aiSentMessageIds: new Set(),
  aiSendsLastHour: 0,
  aiFirstRunAt: null,
  ...over,
});

test("sem a tag da IA, pula", () => {
  assert.deepEqual(
    decideRun(input({ hasAiTag: false, messages: [msg("c1", "inbound", 120)] })),
    { kind: "skip", decision: "pulou:sem_tag" },
  );
});

test("mensagem do cliente com menos de 80s espera o agrupamento", () => {
  assert.deepEqual(decideRun(input({ messages: [msg("c1", "inbound", 30)] })), {
    kind: "skip",
    decision: "pulou:agrupando",
  });
});

test("cliente escreveu há 2 minutos e ninguém respondeu: roda", () => {
  assert.deepEqual(decideRun(input({ messages: [msg("c1", "inbound", 120)] })), {
    kind: "run",
  });
});

test("IA já respondeu depois da última mensagem do cliente", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [msg("c1", "inbound", 300), msg("a1", "outbound", 200)],
        aiSentMessageIds: new Set(["a1"]),
        aiFirstRunAt: at(210),
      }),
    ),
    { kind: "skip", decision: "pulou:ja_respondido" },
  );
});

test("automação depois do cliente não conta como resposta", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [
          msg("c1", "inbound", 300),
          msg("w1", "outbound", 200, { isAutomated: true }),
        ],
      }),
    ),
    { kind: "run" },
  );
});

test("vendedor humano depois da primeira rodada da IA: humano assumiu", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [
          msg("c1", "inbound", 600),
          msg("a1", "outbound", 500),
          msg("h1", "outbound", 100),
        ],
        aiSentMessageIds: new Set(["a1"]),
        aiFirstRunAt: at(510),
      }),
    ),
    { kind: "human_took_over" },
  );
});

test("mensagem humana de antes da IA entrar não cala a IA", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [msg("h0", "outbound", 5000), msg("c1", "inbound", 120)],
        aiFirstRunAt: at(4000),
      }),
    ),
    { kind: "run" },
  );
});

test("primeira rodada não procura humano no histórico", () => {
  assert.deepEqual(
    decideRun(
      input({
        messages: [msg("h0", "outbound", 3000), msg("c1", "inbound", 120)],
        aiFirstRunAt: null,
      }),
    ),
    { kind: "run" },
  );
});

test("limite de mensagens da IA na última hora", () => {
  assert.deepEqual(
    decideRun(input({ messages: [msg("c1", "inbound", 120)], aiSendsLastHour: 6 })),
    { kind: "limit" },
  );
});

test("sem mensagem do cliente, nada a responder", () => {
  assert.deepEqual(
    decideRun(input({ messages: [msg("w1", "outbound", 100, { isAutomated: true })] })),
    { kind: "skip", decision: "pulou:ja_respondido" },
  );
});
```

- [ ] **Step 2: Acrescentar o teste ao script e ver falhar**

Em `package.json`, no fim da linha `test:ai-seller`, acrescentar ` tests/ai-seller-decide.test.mjs` antes das aspas finais.

Run: `npm run test:ai-seller`
Expected: FAIL — `Cannot find module` para `decide.ts`.

- [ ] **Step 3: Criar `lib/ghl/ai-seller/decide.ts`**

```ts
import type { NegotiationMessage } from "@/lib/ghl/negotiation-conversations";
import { DEBOUNCE_MS, MAX_AI_SENDS_PER_HOUR } from "./config";

export interface DecideInput {
  now: number;
  hasAiTag: boolean;
  /** Conversa em ordem cronológica, como getNegotiationTranscript devolve. */
  messages: NegotiationMessage[];
  aiSentMessageIds: ReadonlySet<string>;
  aiSendsLastHour: number;
  /** Primeiro acionamento registrado para o contato; null na primeira vez. */
  aiFirstRunAt: string | null;
}

export type DecideResult =
  | { kind: "run" }
  | {
      kind: "skip";
      decision: "pulou:sem_tag" | "pulou:agrupando" | "pulou:ja_respondido";
    }
  | { kind: "human_took_over" }
  | { kind: "limit" };

export function isHumanSellerMessage(
  message: NegotiationMessage,
  aiSentMessageIds: ReadonlySet<string>,
  cutoffMs: number,
): boolean {
  return (
    message.direction === "outbound" &&
    !message.isAutomated &&
    !aiSentMessageIds.has(message.id) &&
    Date.parse(message.dateAdded) >= cutoffMs
  );
}

export function decideRun(input: DecideInput): DecideResult {
  if (!input.hasAiTag) return { kind: "skip", decision: "pulou:sem_tag" };

  // Sem rodada anterior, o corte é "agora": nada do histórico conta como
  // humano assumindo (ver "Ajustes em relação ao spec", item 3, no plano).
  const cutoffMs = input.aiFirstRunAt ? Date.parse(input.aiFirstRunAt) : input.now;
  if (
    input.messages.some((m) =>
      isHumanSellerMessage(m, input.aiSentMessageIds, cutoffMs),
    )
  ) {
    return { kind: "human_took_over" };
  }

  const lastInbound = [...input.messages]
    .reverse()
    .find((m) => m.direction === "inbound");
  if (!lastInbound) return { kind: "skip", decision: "pulou:ja_respondido" };

  const lastInboundMs = Date.parse(lastInbound.dateAdded);
  if (input.now - lastInboundMs < DEBOUNCE_MS) {
    return { kind: "skip", decision: "pulou:agrupando" };
  }

  const alreadyAnswered = input.messages.some(
    (m) =>
      input.aiSentMessageIds.has(m.id) && Date.parse(m.dateAdded) > lastInboundMs,
  );
  if (alreadyAnswered) return { kind: "skip", decision: "pulou:ja_respondido" };

  if (input.aiSendsLastHour >= MAX_AI_SENDS_PER_HOUR) return { kind: "limit" };

  return { kind: "run" };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm run test:ai-seller`
Expected: PASS, 17 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/ghl/ai-seller/decide.ts tests/ai-seller-decide.test.mjs package.json
git commit -m "feat: IA vendedora decide quando responder, agrupar ou sair da conversa"
```

---

### Task 3: Ferramentas

**Files:**
- Create: `lib/ghl/ai-seller/tools.ts`
- Create: `tests/ai-seller-tools.test.mjs`
- Modify: `package.json` (acrescentar o arquivo ao `test:ai-seller`)

**Interfaces:**
- Consumes: `AI_MOVABLE_STAGES`, `LARGE_ORDER_PARES`, `MODEL_ESCALATION_REASONS` (config.ts); `hasFreeShipping`, `MIN_PARES`, `roundMoney`, `subtotalForPares`, `unitPriceForPares` (pricing.ts); `FunctionCall`, `SellerActions`, `ToolExecution` (types.ts).
- Produces: `TOOL_DEFINITIONS: FunctionTool[]`, `TERMINAL_TOOLS: ReadonlySet<string>`, `executeTool(call: FunctionCall, actions: SellerActions): Promise<ToolExecution>`

- [ ] **Step 1: Escrever os testes**

`tests/ai-seller-tools.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { TOOL_DEFINITIONS, executeTool } from "../lib/ghl/ai-seller/tools.ts";

function fakeActions(overrides = {}) {
  const calls = [];
  const actions = {
    async sendMessages(messages) {
      calls.push(["sendMessages", messages]);
      return messages.map((_, i) => `msg-${i}`);
    },
    async escalate(input) {
      calls.push(["escalate", input]);
      return ["esc-1"];
    },
    async quoteFreight(input) {
      calls.push(["quoteFreight", input]);
      return 153;
    },
    async writeBudget(input) {
      calls.push(["writeBudget", input]);
    },
    async requestArtChange(resumo) {
      calls.push(["requestArtChange", resumo]);
      return "movido";
    },
    async moveStage(etapa) {
      calls.push(["moveStage", etapa]);
      return "movido";
    },
    ...overrides,
  };
  return { actions, calls };
}

const call = (name, args) => ({ call_id: "c1", name, arguments: JSON.stringify(args) });

test("as seis ferramentas estão definidas no modo estrito", () => {
  assert.deepEqual(
    TOOL_DEFINITIONS.map((t) => t.name).sort(),
    [
      "atualizar_orcamento",
      "enviar_mensagens",
      "escalar_para_humano",
      "mover_etapa",
      "nao_responder",
      "solicitar_ajuste_arte",
    ],
  );
  for (const tool of TOOL_DEFINITIONS) assert.equal(tool.strict, true);
});

test("enviar_mensagens envia no máximo 3, ignora vazias e encerra a rodada", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(
    call("enviar_mensagens", { mensagens: ["Oi!", "  ", "Tudo bem?", "Três", "Quatro"] }),
    actions,
  );
  assert.deepEqual(calls[0], ["sendMessages", ["Oi!", "Tudo bem?", "Três"]]);
  assert.equal(result.terminal, true);
  assert.equal(result.decision, "respondeu");
  assert.deepEqual(result.sentMessageIds, ["msg-0", "msg-1", "msg-2"]);
});

test("enviar_mensagens sem texto não envia e não encerra", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(call("enviar_mensagens", { mensagens: [" "] }), actions);
  assert.equal(calls.length, 0);
  assert.equal(result.terminal, false);
});

test("atualizar_orcamento com 40 pares: frete grátis, sem cotar", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(call("atualizar_orcamento", { pares: 40, cep: null }), actions);
  assert.equal(calls.some(([name]) => name === "quoteFreight"), false);
  assert.deepEqual(calls[0], [
    "writeBudget",
    { pares: 40, unitario: 59.9, subtotal: 2396, frete: 0 },
  ]);
  const output = JSON.parse(result.output);
  assert.equal(output.total, 2396);
  assert.equal(output.frete_gratis, true);
  assert.equal(result.terminal, false);
});

test("atualizar_orcamento com 12 pares e CEP cota o frete sobre o subtotal", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(
    call("atualizar_orcamento", { pares: 12, cep: "03911-040" }),
    actions,
  );
  assert.deepEqual(calls[0], ["quoteFreight", { cep: "03911-040", pares: 12, valorNf: 814.8 }]);
  assert.deepEqual(calls[1], [
    "writeBudget",
    { pares: 12, unitario: 67.9, subtotal: 814.8, frete: 153 },
  ]);
  assert.equal(JSON.parse(result.output).total, 967.8);
});

test("atualizar_orcamento sem CEP abaixo de 36 pares deixa o frete em aberto", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(call("atualizar_orcamento", { pares: 20, cep: null }), actions);
  assert.deepEqual(calls[0], [
    "writeBudget",
    { pares: 20, unitario: 67.9, subtotal: 1358, frete: null },
  ]);
  assert.equal(JSON.parse(result.output).total, null);
});

test("atualizar_orcamento recusa pedido grande e abaixo do mínimo sem gravar", async () => {
  const grande = fakeActions();
  const r1 = await executeTool(call("atualizar_orcamento", { pares: 600, cep: null }), grande.actions);
  assert.equal(JSON.parse(r1.output).erro, "pedido_grande");
  assert.equal(grande.calls.length, 0);

  const pequeno = fakeActions();
  const r2 = await executeTool(call("atualizar_orcamento", { pares: 8, cep: null }), pequeno.actions);
  assert.equal(JSON.parse(r2.output).erro, "abaixo_do_minimo");
  assert.equal(pequeno.calls.length, 0);
});

test("escalar_para_humano repassa motivo e mensagem e encerra", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(
    call("escalar_para_humano", {
      motivo: "pronto_para_pagar",
      resumo: "Arte aprovada, 40 pares, CEP 03911-040, cartão.",
      mensagem_cliente: "A Schay já te chama pra finalizar!",
    }),
    actions,
  );
  assert.deepEqual(calls[0], [
    "escalate",
    {
      motivo: "pronto_para_pagar",
      resumo: "Arte aprovada, 40 pares, CEP 03911-040, cartão.",
      mensagemCliente: "A Schay já te chama pra finalizar!",
    },
  ]);
  assert.equal(result.terminal, true);
  assert.equal(result.decision, "escalou");
  assert.equal(result.escalationReason, "pronto_para_pagar");
  assert.deepEqual(result.sentMessageIds, ["esc-1"]);
});

test("nao_responder encerra sem enviar", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(call("nao_responder", { motivo: "cliente só agradeceu" }), actions);
  assert.equal(calls.length, 0);
  assert.equal(result.terminal, true);
  assert.equal(result.decision, "nao_respondeu");
});

test("mover_etapa só aceita as etapas liberadas", async () => {
  const ok = fakeActions();
  const r1 = await executeTool(call("mover_etapa", { etapa: "Negociação" }), ok.actions);
  assert.deepEqual(ok.calls[0], ["moveStage", "Negociação"]);
  assert.equal(JSON.parse(r1.output).status, "movido");

  const bloqueada = fakeActions();
  const r2 = await executeTool(call("mover_etapa", { etapa: "Finalizando Venda" }), bloqueada.actions);
  assert.equal(bloqueada.calls.length, 0);
  assert.ok(JSON.parse(r2.output).erro);
});

test("solicitar_ajuste_arte move a demanda e não encerra", async () => {
  const { actions, calls } = fakeActions();
  const result = await executeTool(
    call("solicitar_ajuste_arte", { resumo_ajuste: "Trocar o monograma para branco" }),
    actions,
  );
  assert.deepEqual(calls[0], ["requestArtChange", "Trocar o monograma para branco"]);
  assert.equal(result.terminal, false);
});

test("ferramenta desconhecida ou argumento inválido volta como erro para o modelo", async () => {
  const { actions } = fakeActions();
  const r1 = await executeTool({ call_id: "c1", name: "apagar_tudo", arguments: "{}" }, actions);
  assert.ok(JSON.parse(r1.output).erro);
  const r2 = await executeTool({ call_id: "c1", name: "mover_etapa", arguments: "{quebrado" }, actions);
  assert.ok(JSON.parse(r2.output).erro);
});
```

- [ ] **Step 2: Acrescentar o teste ao script e ver falhar**

Em `package.json`, no fim da linha `test:ai-seller`, acrescentar ` tests/ai-seller-tools.test.mjs`.

Run: `npm run test:ai-seller`
Expected: FAIL — `Cannot find module` para `tools.ts`.

- [ ] **Step 3: Criar `lib/ghl/ai-seller/tools.ts`**

```ts
import type { FunctionTool } from "openai/resources/responses/responses";
import {
  AI_MOVABLE_STAGES,
  LARGE_ORDER_PARES,
  MODEL_ESCALATION_REASONS,
  type AiMovableStage,
  type ModelEscalationReason,
} from "./config";
import {
  hasFreeShipping,
  MIN_PARES,
  roundMoney,
  subtotalForPares,
  unitPriceForPares,
} from "./pricing";
import type { FunctionCall, SellerActions, ToolExecution } from "./types";

function objectSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export const TOOL_DEFINITIONS: FunctionTool[] = [
  {
    type: "function",
    name: "enviar_mensagens",
    description:
      "Envia sua resposta ao cliente no WhatsApp: de 1 a 3 mensagens curtas, em sequência. Encerra a rodada.",
    strict: true,
    parameters: objectSchema({
      mensagens: { type: "array", items: { type: "string" } },
    }),
  },
  {
    type: "function",
    name: "nao_responder",
    description:
      "Encerra a rodada sem enviar nada, quando nenhuma resposta cabe (despedida já encerrada, 'ok' final, mensagem que não era para a Hud Lab, spam).",
    strict: true,
    parameters: objectSchema({ motivo: { type: "string" } }),
  },
  {
    type: "function",
    name: "escalar_para_humano",
    description:
      "Passa o atendimento para uma pessoa do time e encerra a rodada. Obrigatório nos casos listados nas instruções.",
    strict: true,
    parameters: objectSchema({
      motivo: { type: "string", enum: [...MODEL_ESCALATION_REASONS] },
      resumo: {
        type: "string",
        description:
          "Resumo da negociação e do motivo, para a pessoa que vai assumir.",
      },
      mensagem_cliente: {
        type: "string",
        description:
          "Mensagem curta avisando o cliente que alguém do time continua o atendimento por aqui.",
      },
    }),
  },
  {
    type: "function",
    name: "atualizar_orcamento",
    description:
      "Calcula preço (tabela do manual) e frete, grava o orçamento no CRM e devolve os valores. Use sempre que o cliente definir ou mudar a quantidade de pares, ou pedir o valor com frete.",
    strict: true,
    parameters: objectSchema({
      pares: { type: "integer" },
      cep: {
        type: ["string", "null"],
        description: "CEP de entrega, se o cliente informou; null se não.",
      },
    }),
  },
  {
    type: "function",
    name: "solicitar_ajuste_arte",
    description:
      "Manda um pedido de ajuste da arte para o time de design (Fábrica de Mockups, etapa Alteração).",
    strict: true,
    parameters: objectSchema({
      resumo_ajuste: {
        type: "string",
        description: "Tudo o que o cliente pediu para mudar, numa frase clara.",
      },
    }),
  },
  {
    type: "function",
    name: "mover_etapa",
    description:
      "Move a oportunidade para frente no pipeline Atendimento. Nunca volta etapa.",
    strict: true,
    parameters: objectSchema({
      etapa: { type: "string", enum: [...AI_MOVABLE_STAGES] },
    }),
  },
];

export const TERMINAL_TOOLS: ReadonlySet<string> = new Set([
  "enviar_mensagens",
  "nao_responder",
  "escalar_para_humano",
]);

function ok(output: unknown): ToolExecution {
  return { output: JSON.stringify(output), terminal: false, sentMessageIds: [] };
}

function erro(mensagem: string): ToolExecution {
  return ok({ erro: mensagem });
}

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function executeTool(
  call: FunctionCall,
  actions: SellerActions,
): Promise<ToolExecution> {
  const args = parseArgs(call.arguments);
  if (!args) return erro("argumentos inválidos");

  switch (call.name) {
    case "enviar_mensagens": {
      const mensagens = (Array.isArray(args.mensagens) ? args.mensagens : [])
        .filter((m): m is string => typeof m === "string")
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, 3);
      if (mensagens.length === 0) return erro("nenhuma mensagem com texto");
      const ids = await actions.sendMessages(mensagens);
      return {
        output: JSON.stringify({ ok: true, enviadas: ids.length }),
        terminal: true,
        sentMessageIds: ids,
        decision: "respondeu",
      };
    }

    case "nao_responder":
      return {
        output: JSON.stringify({ ok: true }),
        terminal: true,
        sentMessageIds: [],
        decision: "nao_respondeu",
      };

    case "escalar_para_humano": {
      const motivo = (MODEL_ESCALATION_REASONS as readonly string[]).includes(
        String(args.motivo),
      )
        ? (args.motivo as ModelEscalationReason)
        : "outro";
      const ids = await actions.escalate({
        motivo,
        resumo: String(args.resumo ?? ""),
        mensagemCliente: String(args.mensagem_cliente ?? ""),
      });
      return {
        output: JSON.stringify({ ok: true }),
        terminal: true,
        sentMessageIds: ids,
        decision: "escalou",
        escalationReason: motivo,
      };
    }

    case "atualizar_orcamento": {
      const pares = Number(args.pares);
      if (!Number.isInteger(pares)) return erro("pares precisa ser um número inteiro");
      if (pares >= LARGE_ORDER_PARES) {
        return ok({
          erro: "pedido_grande",
          instrucao: `Pedidos de ${LARGE_ORDER_PARES} pares ou mais vão para uma pessoa do time: use escalar_para_humano com motivo pedido_grande.`,
        });
      }
      const unitario = unitPriceForPares(pares);
      const subtotal = subtotalForPares(pares);
      if (unitario == null || subtotal == null) {
        return ok({ erro: "abaixo_do_minimo", minimo: MIN_PARES });
      }
      const cep = typeof args.cep === "string" && args.cep.trim() ? args.cep.trim() : null;
      const freteGratis = hasFreeShipping(pares);
      const frete = freteGratis
        ? 0
        : cep
          ? await actions.quoteFreight({ cep, pares, valorNf: subtotal })
          : null;
      await actions.writeBudget({ pares, unitario, subtotal, frete });
      return ok({
        pares,
        valor_unitario: unitario,
        subtotal,
        frete,
        frete_gratis: freteGratis,
        total: frete == null ? null : roundMoney(subtotal + frete),
        observacao:
          frete == null
            ? cep
              ? "Não foi possível cotar o frete para esse CEP; diga que vai confirmar o valor do frete."
              : "Frete ainda não calculado: peça o CEP de entrega."
            : null,
      });
    }

    case "solicitar_ajuste_arte": {
      const resumo = String(args.resumo_ajuste ?? "").trim();
      if (!resumo) return erro("resumo_ajuste vazio");
      const status = await actions.requestArtChange(resumo);
      return ok({
        status,
        instrucao:
          "Avise o cliente que o time de design faz o ajuste em até 24h úteis e que a nova arte chega por aqui.",
      });
    }

    case "mover_etapa": {
      const etapa = String(args.etapa);
      if (!(AI_MOVABLE_STAGES as readonly string[]).includes(etapa)) {
        return erro(`etapa não permitida: ${etapa}`);
      }
      const status = await actions.moveStage(etapa as AiMovableStage);
      return ok({ status });
    }

    default:
      return erro(`ferramenta desconhecida: ${call.name}`);
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm run test:ai-seller`
Expected: PASS, 29 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/ghl/ai-seller/tools.ts tests/ai-seller-tools.test.mjs package.json
git commit -m "feat: ferramentas da IA vendedora — responder, orçar, pedir arte, mover etapa, escalar"
```

---

### Task 4: Loop do agente

**Files:**
- Create: `lib/ghl/ai-seller/loop.ts`
- Create: `tests/ai-seller-loop.test.mjs`
- Modify: `package.json` (acrescentar o arquivo ao `test:ai-seller`)

**Interfaces:**
- Consumes: `EscalationReason`, `FunctionCall`, `ToolExecution` (types.ts).
- Produces: `ModelTurn`, `CallModel`, `ExecuteTool`, `LoopResult`, `runAgentLoop(opts: { initialInput: unknown[]; callModel: CallModel; executeTool: ExecuteTool; maxSteps: number }): Promise<LoopResult>`

- [ ] **Step 1: Escrever os testes**

`tests/ai-seller-loop.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop } from "../lib/ghl/ai-seller/loop.ts";

const call = (name, args = {}) => ({
  call_id: `c-${name}`,
  name,
  arguments: JSON.stringify(args),
});

function scriptedModel(turns) {
  let index = 0;
  const inputs = [];
  const fn = async (input) => {
    inputs.push(structuredClone(input));
    const turn = turns[index++];
    if (turn instanceof Error) throw turn;
    if (!turn) throw new Error("sem turno roteirizado");
    return {
      outputItems: [{ type: "fake_output", step: index }],
      functionCalls: turn,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  };
  return { fn, inputs };
}

const terminalSend = async () => ({
  output: '{"ok":true}',
  terminal: true,
  sentMessageIds: ["m1"],
  decision: "respondeu",
});
const nonTerminal = async () => ({ output: '{"subtotal":2396}', terminal: false, sentMessageIds: [] });

function executor(byName) {
  const executed = [];
  const fn = async (c) => {
    executed.push(c.name);
    const handler = byName[c.name];
    if (!handler) throw new Error(`sem handler para ${c.name}`);
    return handler(c);
  };
  return { fn, executed };
}

test("responde em um passo", async () => {
  const model = scriptedModel([[call("enviar_mensagens", { mensagens: ["Oi"] })]]);
  const exec = executor({ enviar_mensagens: terminalSend });
  const result = await runAgentLoop({
    initialInput: [{ role: "user", content: "x" }],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "respondeu");
  assert.deepEqual(result.sentMessageIds, ["m1"]);
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 5 });
  assert.equal(result.error, null);
});

test("usa uma ferramenta, devolve o resultado ao modelo e responde", async () => {
  const model = scriptedModel([
    [call("atualizar_orcamento", { pares: 40, cep: null })],
    [call("enviar_mensagens", { mensagens: ["Fica R$ 2.396,00"] })],
  ]);
  const exec = executor({ atualizar_orcamento: nonTerminal, enviar_mensagens: terminalSend });
  const result = await runAgentLoop({
    initialInput: [{ role: "user", content: "x" }],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "respondeu");
  assert.deepEqual(exec.executed, ["atualizar_orcamento", "enviar_mensagens"]);
  const secondInput = model.inputs[1];
  assert.deepEqual(secondInput.at(-1), {
    type: "function_call_output",
    call_id: "c-atualizar_orcamento",
    output: '{"subtotal":2396}',
  });
  assert.equal(result.toolCalls.length, 2);
});

test("sem ação final dentro do limite de passos vira erro", async () => {
  const model = scriptedModel([
    [call("mover_etapa", { etapa: "Negociação" })],
    [call("mover_etapa", { etapa: "Negociação" })],
  ]);
  const exec = executor({ mover_etapa: nonTerminal });
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 2,
  });
  assert.equal(result.decision, "erro");
  assert.match(result.error, /passos/);
});

test("falha do modelo é tentada mais uma vez", async () => {
  const model = scriptedModel([new Error("timeout"), [call("enviar_mensagens")]]);
  const exec = executor({ enviar_mensagens: terminalSend });
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "respondeu");
});

test("duas falhas seguidas do modelo viram erro", async () => {
  const model = scriptedModel([new Error("timeout"), new Error("timeout")]);
  const exec = executor({});
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "erro");
  assert.match(result.error, /modelo/);
});

test("modelo sem chamar ferramenta vira erro", async () => {
  const model = scriptedModel([[]]);
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: executor({}).fn,
    maxSteps: 5,
  });
  assert.equal(result.decision, "erro");
});

test("falha no envio não é repetida (evita mensagem duplicada)", async () => {
  const model = scriptedModel([[call("enviar_mensagens")]]);
  let attempts = 0;
  const exec = executor({
    enviar_mensagens: async () => {
      attempts++;
      throw new Error("GHL 500");
    },
  });
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(attempts, 1);
  assert.equal(result.decision, "erro");
  assert.match(result.error, /enviar_mensagens/);
});

test("falha em ferramenta sem efeito duplicável é tentada mais uma vez", async () => {
  const model = scriptedModel([[call("mover_etapa")], [call("enviar_mensagens")]]);
  let attempts = 0;
  const exec = executor({
    mover_etapa: async () => {
      attempts++;
      if (attempts === 1) throw new Error("GHL 502");
      return { output: '{"status":"movido"}', terminal: false, sentMessageIds: [] };
    },
    enviar_mensagens: terminalSend,
  });
  const result = await runAgentLoop({
    initialInput: [],
    callModel: model.fn,
    executeTool: exec.fn,
    maxSteps: 5,
  });
  assert.equal(attempts, 2);
  assert.equal(result.decision, "respondeu");
});
```

- [ ] **Step 2: Acrescentar o teste ao script e ver falhar**

Em `package.json`, no fim da linha `test:ai-seller`, acrescentar ` tests/ai-seller-loop.test.mjs`.

Run: `npm run test:ai-seller`
Expected: FAIL — `Cannot find module` para `loop.ts`.

- [ ] **Step 3: Criar `lib/ghl/ai-seller/loop.ts`**

```ts
import type { EscalationReason, FunctionCall, ToolExecution } from "./types";

export interface ModelTurn {
  /** response.output do modelo, devolvido como entrada no passo seguinte. */
  outputItems: unknown[];
  functionCalls: FunctionCall[];
  usage: { input_tokens: number; output_tokens: number } | null;
}

export type CallModel = (input: unknown[]) => Promise<ModelTurn>;
export type ExecuteTool = (call: FunctionCall) => Promise<ToolExecution>;

export interface LoopResult {
  decision: "respondeu" | "nao_respondeu" | "escalou" | "erro";
  escalationReason: EscalationReason | null;
  sentMessageIds: string[];
  toolCalls: Array<{ name: string; arguments: string; output: string }>;
  usage: { input_tokens: number; output_tokens: number };
  error: string | null;
}

// Ferramentas que podem rodar duas vezes sem efeito visível para o cliente.
// Envio e escalonamento ficam de fora: repetir mandaria mensagem duplicada.
const RETRYABLE_TOOLS = new Set([
  "atualizar_orcamento",
  "solicitar_ajuste_arte",
  "mover_etapa",
  "nao_responder",
]);

async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runAgentLoop(opts: {
  initialInput: unknown[];
  callModel: CallModel;
  executeTool: ExecuteTool;
  maxSteps: number;
}): Promise<LoopResult> {
  const input = [...opts.initialInput];
  const toolCalls: LoopResult["toolCalls"] = [];
  const sentMessageIds: string[] = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  const fail = (error: string): LoopResult => ({
    decision: "erro",
    escalationReason: null,
    sentMessageIds,
    toolCalls,
    usage,
    error,
  });

  for (let step = 0; step < opts.maxSteps; step++) {
    let turn: ModelTurn;
    try {
      turn = await retryOnce(() => opts.callModel(input));
    } catch (err) {
      return fail(`modelo: ${describe(err)}`);
    }
    if (turn.usage) {
      usage.input_tokens += turn.usage.input_tokens;
      usage.output_tokens += turn.usage.output_tokens;
    }
    if (turn.functionCalls.length === 0) {
      return fail("modelo respondeu sem chamar ferramenta");
    }
    input.push(...turn.outputItems);

    for (const call of turn.functionCalls) {
      let execution: ToolExecution;
      try {
        execution = RETRYABLE_TOOLS.has(call.name)
          ? await retryOnce(() => opts.executeTool(call))
          : await opts.executeTool(call);
      } catch (err) {
        return fail(`ferramenta ${call.name}: ${describe(err)}`);
      }
      toolCalls.push({ name: call.name, arguments: call.arguments, output: execution.output });
      sentMessageIds.push(...execution.sentMessageIds);
      input.push({ type: "function_call_output", call_id: call.call_id, output: execution.output });
      if (execution.terminal) {
        return {
          decision: execution.decision ?? "respondeu",
          escalationReason: execution.escalationReason ?? null,
          sentMessageIds,
          toolCalls,
          usage,
          error: null,
        };
      }
    }
  }
  return fail(`${opts.maxSteps} passos sem ação final`);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm run test:ai-seller`
Expected: PASS, 37 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/ghl/ai-seller/loop.ts tests/ai-seller-loop.test.mjs package.json
git commit -m "feat: loop de ferramentas da IA vendedora com retentativa segura"
```

---

### Task 5: Instruções da persona e transcrição com "VOCÊ"

**Files:**
- Create: `lib/ghl/ai-seller/prompt.ts`
- Modify: `lib/ghl/sales-agent/agent.ts` (função `buildTranscriptParts`, função `todayBRDateString`, tipo `ContentPart`)
- Create: `tests/ai-seller-prompt.test.mjs`
- Modify: `package.json` (acrescentar o arquivo ao `test:ai-seller`)

**Interfaces:**
- Consumes: `MANUAL_COMERCIAL_TEXT`, `MANUAL_VERSION` (`lib/ghl/sales-agent/manual.ts`); `LARGE_ORDER_PARES` (config.ts).
- Produces:
  - `prompt.ts`: `buildSellerInstructions(opts: { persona: string; escalationName: string }): string`, `SellerContext`, `buildContextText(ctx: SellerContext): string`
  - `agent.ts`: `export type ContentPart`, `export function todayBRDateString(): string`, `export async function buildTranscriptParts(messages: NegotiationMessage[], options?: { ownMessageIds?: ReadonlySet<string>; ownLabel?: string }): Promise<ContentPart[]>`

- [ ] **Step 1: Escrever os testes**

`tests/ai-seller-prompt.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildContextText, buildSellerInstructions } from "../lib/ghl/ai-seller/prompt.ts";
import { buildTranscriptParts } from "../lib/ghl/sales-agent/agent.ts";

test("instruções levam persona, escalonamento, regras de preço e o manual", () => {
  const text = buildSellerInstructions({ persona: "Lia", escalationName: "Schay" });
  assert.match(text, /Você é Lia/);
  assert.match(text, /500 pares ou mais/);
  assert.match(text, /pendente de decisão/);
  assert.match(text, /pronto_para_pagar/);
  assert.match(text, /Schay/);
  assert.match(text, /MANUAL COMERCIAL HUD LAB/);
});

test("contexto traz a data e marca o valor do CRM como orçamento inicial", () => {
  const text = buildContextText({
    today: "29/09/2026",
    contactName: "Arthur",
    pipelineName: "Atendimento",
    stageName: "Amostra Digital Enviada",
    crmPares: 40,
    crmValor: 2396,
  });
  assert.match(text, /Data de hoje: 29\/09\/2026/);
  assert.match(text, /orçamento automático inicial/);
  assert.match(text, /R\$ 2396\.00/);
});

test("mensagens da própria IA aparecem como VOCÊ na transcrição", async () => {
  const base = { body: "", userId: null, attachments: [], isAutomated: false };
  const parts = await buildTranscriptParts(
    [
      { ...base, id: "c1", direction: "inbound", body: "Oi", dateAdded: "2026-09-29T12:00:00.000Z" },
      { ...base, id: "a1", direction: "outbound", body: "Olá!", dateAdded: "2026-09-29T12:02:00.000Z" },
      { ...base, id: "h1", direction: "outbound", body: "Sou a Schay", dateAdded: "2026-09-29T12:05:00.000Z" },
    ],
    { ownMessageIds: new Set(["a1"]), ownLabel: "VOCÊ (Lia)" },
  );
  const texts = parts.map((p) => p.text);
  assert.match(texts[0], /CLIENTE: Oi/);
  assert.match(texts[1], /VOCÊ \(Lia\): Olá!/);
  assert.match(texts[2], /VENDEDOR: Sou a Schay/);
});
```

- [ ] **Step 2: Acrescentar o teste ao script e ver falhar**

Em `package.json`, no fim da linha `test:ai-seller`, acrescentar ` tests/ai-seller-prompt.test.mjs`.

Run: `npm run test:ai-seller`
Expected: FAIL — `Cannot find module` para `prompt.ts`.

- [ ] **Step 3: Mudar `lib/ghl/sales-agent/agent.ts`**

Trocar `type ContentPart = TextContentPart | ImageContentPart;` por:

```ts
export type ContentPart = TextContentPart | ImageContentPart;
```

Trocar `function todayBRDateString(): string {` por:

```ts
export function todayBRDateString(): string {
```

Trocar a assinatura e o cálculo do rótulo em `buildTranscriptParts`. De:

```ts
async function buildTranscriptParts(
  messages: NegotiationMessage[],
): Promise<ContentPart[]> {
  const includedByMessage = await selectIncludedAttachments(messages);

  const parts: ContentPart[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const who =
      m.direction === "inbound"
        ? "CLIENTE"
        : m.isAutomated
          ? "AUTOMAÇÃO (mensagem automática do sistema, não é o vendedor)"
          : "VENDEDOR";
```

Para:

```ts
export async function buildTranscriptParts(
  messages: NegotiationMessage[],
  options: { ownMessageIds?: ReadonlySet<string>; ownLabel?: string } = {},
): Promise<ContentPart[]> {
  const includedByMessage = await selectIncludedAttachments(messages);

  const parts: ContentPart[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const who =
      m.direction === "inbound"
        ? "CLIENTE"
        : m.isAutomated
          ? "AUTOMAÇÃO (mensagem automática do sistema, não é o vendedor)"
          : options.ownMessageIds?.has(m.id)
            ? (options.ownLabel ?? "VOCÊ")
            : "VENDEDOR";
```

Os chamadores atuais (`runAuditor`, `runCopiloto`) continuam passando só `messages` e não mudam de comportamento.

- [ ] **Step 4: Criar `lib/ghl/ai-seller/prompt.ts`**

```ts
import {
  MANUAL_COMERCIAL_TEXT,
  MANUAL_VERSION,
} from "@/lib/ghl/sales-agent/manual";
import { LARGE_ORDER_PARES } from "./config";

export function buildSellerInstructions(opts: {
  persona: string;
  escalationName: string;
}): string {
  const { persona, escalationName } = opts;
  return `Você é ${persona}, consultora comercial da Hud Lab no WhatsApp. A Hud Lab vende Chinelo Slide personalizado. Você assume a conversa depois do atendimento automático (robô) e conduz o cliente até o fechamento.

Identidade: você é uma assistente de IA. Não se apresente como pessoa. Se o cliente perguntar se está falando com um robô ou uma IA, confirme com naturalidade e ofereça chamar alguém do time (${escalationName}).

Estilo:
- Mensagens curtas, como no WhatsApp: de 1 a 3 mensagens por vez, sem textão.
- Uma pergunta por vez. Tom caloroso, profissional e objetivo, em português do Brasil. Emoji com moderação.
- Use o nome do cliente quando souber.
- Conduza para o próximo passo, como o manual orienta, sem urgência artificial.

Regras comerciais:
- Use só as políticas do manual abaixo. Nunca invente preço, prazo, frete, desconto ou condição.
- Preço e frete só com a ferramenta atualizar_orcamento. Nunca faça conta de preço você mesma.
- Pedido mínimo de 12 pares. Frete grátis a partir de 36 pares.
- Desconto só o que o manual permite. Tema marcado como "pendente de decisão" no manual não é decidido por você.
- Nunca peça pagamento antes de a Amostra Digital estar aprovada.

Como ler o histórico:
- CLIENTE é o cliente. VOCÊ são as suas mensagens anteriores. VENDEDOR é uma pessoa do time. AUTOMAÇÃO são mensagens automáticas do sistema (robô de atendimento, campanhas de desconto): trate como contexto real e não repita o que uma automação acabou de enviar.
- O "valor no CRM" do contexto é só o orçamento automático da primeira interação; o sistema não atualiza esse valor quando a quantidade muda. Não trate a diferença como erro.
- Compare a data de hoje com datas que o cliente mencionou (evento, prazo). Se a data já passou, reconheça isso em vez de agir como se o prazo ainda valesse.
- Nunca atribua ao cliente algo que ele não disse.

Ferramentas:
- atualizar_orcamento: sempre que o cliente definir ou mudar a quantidade de pares, ou pedir o valor com frete (passe o CEP se ele informou). Cite os valores que ela devolver.
- solicitar_ajuste_arte: quando o cliente pedir mudança na arte. Antes, junte numa mensagem tudo o que ele quer mudar. Depois avise que o time de design entrega em até 24h úteis.
- mover_etapa: "Atendimento" na sua primeira resposta; "Negociação" quando o cliente começar a discutir condições (quantidade, prazo, pagamento, ajuste de arte); "Prioridade de Fechamento" quando ele disser que quer fechar.
- escalar_para_humano é obrigatório quando:
  - o pedido for de ${LARGE_ORDER_PARES} pares ou mais (pedido_grande);
  - o cliente pedir desconto ou condição fora do manual, ou tocar em tema marcado como "pendente de decisão" (desconto_ou_excecao);
  - houver reclamação, garantia, defeito ou problema com pedido anterior (reclamacao);
  - o cliente pedir para falar com uma pessoa (cliente_pediu_pessoa);
  - o cliente estiver pronto para pagar: arte aprovada, grade de numerações, CEP e forma de pagamento definidos (pronto_para_pagar).
  Em mensagem_cliente, avise de forma breve que ${escalationName} vai continuar o atendimento por aqui.
- nao_responder: quando nenhuma resposta cabe (despedida já encerrada, "ok" no fim da conversa, mensagem que não era para a Hud Lab, spam).
- enviar_mensagens: a sua resposta ao cliente.

Toda rodada termina com exatamente uma destas: enviar_mensagens, nao_responder ou escalar_para_humano. Antes dela você pode usar atualizar_orcamento, solicitar_ajuste_arte e mover_etapa.

===== MANUAL COMERCIAL HUD LAB (versão ${MANUAL_VERSION}) =====
${MANUAL_COMERCIAL_TEXT}
===== FIM DO MANUAL =====`;
}

export interface SellerContext {
  today: string;
  contactName: string | null;
  pipelineName: string | null;
  stageName: string | null;
  crmPares: number | null;
  crmValor: number | null;
}

export function buildContextText(ctx: SellerContext): string {
  const valor = ctx.crmValor != null ? `R$ ${ctx.crmValor.toFixed(2)}` : "não informado";
  return `Contexto:
- Data de hoje: ${ctx.today}
- Cliente: ${ctx.contactName ?? "nome não informado"}
- Pipeline / etapa atual: ${ctx.pipelineName ?? "desconhecido"} / ${ctx.stageName ?? "desconhecida"}
- Quantidade de pares no CRM: ${ctx.crmPares ?? "não informada"}
- Valor no CRM (orçamento automático inicial, não reflete ajustes feitos depois): ${valor}

Histórico completo da conversa no WhatsApp, do mais antigo para o mais recente. Responda às mensagens do cliente que ainda não foram respondidas:`;
}
```

- [ ] **Step 5: Rodar os testes e o tsc**

Run: `npm run test:ai-seller`
Expected: PASS, 40 testes.

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/ghl/ai-seller/prompt.ts lib/ghl/sales-agent/agent.ts tests/ai-seller-prompt.test.mjs package.json
git commit -m "feat: instruções da persona da IA vendedora e rótulo VOCÊ na transcrição"
```

---

### Task 6: Cotação de frete como biblioteca

Refatoração sem mudança de comportamento: o corpo da rota `/api/freight/quote` passa para `lib/freight/quote.ts`, para a IA cotar sem sessão de usuário.

**Files:**
- Create: `lib/freight/quote.ts`
- Modify: `app/api/freight/quote/route.ts` (arquivo inteiro)

**Interfaces:**
- Produces: `VolumeSel`, `FreightQuoteInput`, `FreightQuoteResultRow`, `FreightQuoteBody`, `FreightQuoteOutcome`, `quoteFreight(supabase: SupabaseClient, input: FreightQuoteInput): Promise<FreightQuoteOutcome>`. `body.results` sai ordenado do menor para o maior `quote.total`.

- [ ] **Step 1: Criar `lib/freight/quote.ts`**

Conteúdo = rota atual a partir de `const volIds`, com os `return NextResponse.json(...)` trocados por objetos:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { priceLane } from "@/lib/freight/pricing";
import {
  resolveDestination,
  matchCoverage,
  matchLanesByCity,
  matchNearestLane,
} from "@/lib/freight/resolve";
import { resolveCep, type CepResult } from "@/lib/freight/cep";
import { looksLikeCep, cepMatchKey } from "@/lib/freight/normalize";
import { quoteBraspress, isBraspressEnabled } from "@/lib/freight/carriers/braspress";
import type { FreightLane, FreightCoverage } from "@/lib/freight/types";

export interface VolumeSel {
  volume_id: string;
  count: number;
}

export interface FreightQuoteInput {
  destino: string;
  volumes: VolumeSel[];
  valor_nf: number;
}

export interface FreightQuoteResultRow {
  quote: { total: number };
  [key: string]: unknown;
}

export interface FreightQuoteBody {
  results: FreightQuoteResultRow[];
  matched_by: "cep" | "city" | "nearest" | "api" | "none";
  ambiguous_city: boolean;
  resolved?: Pick<CepResult, "cep" | "city" | "uf" | "source"> | null;
  shipment: Record<string, number>;
  warnings: string[];
}

export type FreightQuoteOutcome =
  | { ok: true; body: FreightQuoteBody }
  | { ok: false; status: 400; body: { error: string; warnings?: string[] } };

// Fixed shipping origin: Nova Hartz-RS (remetente)
const ORIGIN_CEP = "93890000";

function toLane(row: any): FreightLane {
  const brackets = (row.freight_weight_brackets ?? [])
    .map((b: any) => ({ max_weight_kg: Number(b.max_weight_kg), price: Number(b.price) }))
    .sort((a: { max_weight_kg: number }, b: { max_weight_kg: number }) => a.max_weight_kg - b.max_weight_kg);
  return {
    id: row.id,
    table_id: row.table_id,
    origin_city: row.origin_city,
    origin_cep_prefix: row.origin_cep_prefix,
    dest_city: row.dest_city,
    dest_cep_prefix: row.dest_cep_prefix ?? "",
    dest_uf: row.dest_uf,
    brackets,
    excess_per_ton: Number(row.excess_per_ton) || 0,
    advalorem_pct: Number(row.advalorem_pct) || 0,
    toll_per_100kg: Number(row.toll_per_100kg) || 0,
    fee_up_to_50: Number(row.fee_up_to_50) || 0,
    fee_above_50: Number(row.fee_above_50) || 0,
    gris_pct: Number(row.gris_pct) || 0,
    ta_value: Number(row.ta_value) || 0,
    min_price: row.min_price != null ? Number(row.min_price) : null,
    icms_rate: row.icms_rate != null ? Number(row.icms_rate) : null,
    notes: row.notes,
  };
}

export async function quoteFreight(
  supabase: SupabaseClient,
  input: FreightQuoteInput,
): Promise<FreightQuoteOutcome> {
  const { destino, volumes, valor_nf } = input;

  if (!destino)
    return { ok: false, status: 400, body: { error: "Informe o destino (CEP ou cidade)" } };
  if (!Array.isArray(volumes) || volumes.length === 0)
    return { ok: false, status: 400, body: { error: "Selecione ao menos um volume" } };

  // ── shipment weight/cube from the volumes registry ──────────────────────
  const volIds = volumes.map((v) => v.volume_id).filter(Boolean);
  const { data: volRows, error: volErr } = await supabase
    .from("freight_volumes")
    .select("*")
    .in("id", volIds);
  if (volErr) throw volErr;

  const warnings: string[] = [];
  let peso_real = 0;
  let volume_m3 = 0;
  let totalVolumes = 0;
  let missingWeight = false;
  const cubagem: { comprimento: number; largura: number; altura: number; volumes: number }[] = [];
  for (const sel of volumes) {
    const v = (volRows ?? []).find((x) => x.id === sel.volume_id);
    const count = Math.max(0, Number(sel.count) || 0);
    if (!v || count === 0) continue;
    totalVolumes += count;
    if (v.weight_kg == null) missingWeight = true;
    peso_real += (Number(v.weight_kg) || 0) * count;
    if (v.width_cm && v.height_cm && v.depth_cm) {
      volume_m3 += ((Number(v.width_cm) * Number(v.height_cm) * Number(v.depth_cm)) / 1_000_000) * count;
      // Braspress cubagem in meters (comprimento=profundidade, largura, altura)
      cubagem.push({
        comprimento: Number(v.depth_cm) / 100,
        largura: Number(v.width_cm) / 100,
        altura: Number(v.height_cm) / 100,
        volumes: count,
      });
    }
  }
  if (missingWeight)
    warnings.push("Alguns volumes não têm peso cadastrado — cadastre o peso para uma cotação precisa.");
  if (peso_real <= 0 && volume_m3 <= 0)
    return {
      ok: false,
      status: 400,
      body: { error: "Os volumes selecionados não têm peso/dimensões cadastrados", warnings },
    };
  if (valor_nf <= 0)
    warnings.push("Valor da NF não informado — advalorem, GRIS e ICMS não serão cobrados corretamente.");

  // ── active tables (+ active carriers) ───────────────────────────────────
  const { data: tables, error: tErr } = await supabase
    .from("freight_carrier_tables")
    .select("*, freight_carriers!inner(id, name, active)")
    .eq("active", true)
    .eq("freight_carriers.active", true);
  if (tErr) throw tErr;
  if (!tables || tables.length === 0)
    return {
      ok: true,
      body: {
        results: [],
        matched_by: "none",
        ambiguous_city: false,
        shipment: { peso_real, volume_m3, valor_nf },
        warnings: [...warnings, "Nenhuma tabela de frete ativa. Importe uma tabela primeiro."],
      },
    };

  const tableIds = tables.map((t) => t.id);
  const carrierIds = [...new Set(tables.map((t) => t.carrier_id))];

  const { data: laneRows, error: lErr } = await supabase
    .from("freight_lanes")
    .select("*, freight_weight_brackets(*)")
    .in("table_id", tableIds);
  if (lErr) throw lErr;

  const { data: covRows, error: cErr } = await supabase
    .from("freight_coverage")
    .select("*")
    .in("carrier_id", carrierIds);
  if (cErr) throw cErr;

  // ── resolve + price per table ───────────────────────────────────────────
  const lanesByTable = new Map<string, FreightLane[]>();
  for (const row of laneRows ?? []) {
    const lane = toLane(row);
    const arr = lanesByTable.get(lane.table_id) ?? [];
    arr.push(lane);
    lanesByTable.set(lane.table_id, arr);
  }

  // ── resolve the destination CEP → city/UF (for city + nearest matching) ──
  const isCep = looksLikeCep(destino);
  const resolved = isCep ? await resolveCep(destino) : null;
  const destCoords =
    resolved?.lat != null && resolved?.lng != null
      ? { lat: resolved.lat, lng: resolved.lng }
      : null;

  let matchedBy: "cep" | "city" | "nearest" | "api" | "none" = "none";
  let ambiguous = false;
  const rank = { cep: 3, city: 2, nearest: 1, api: 0, none: 0 } as const;
  const results: FreightQuoteResultRow[] = [];

  for (const table of tables) {
    const lanes = lanesByTable.get(table.id) ?? [];

    // layered matching: (1) exact CEP/city → (2) resolved city → (3) nearest praça
    let matches: FreightLane[] = [];
    let confidence: "cep" | "city" | "nearest" = "city";

    const res = resolveDestination(destino, lanes);
    if (res.laneMatches.length > 0) {
      matches = res.laneMatches;
      confidence = res.matchedBy === "cep" ? "cep" : "city";
      if (res.ambiguous) ambiguous = true;
    } else if (resolved?.city) {
      const byCity = matchLanesByCity(resolved.city, lanes);
      if (byCity.length > 0) {
        matches = byCity;
        confidence = "city";
        if (new Set(byCity.map((l) => l.dest_cep_prefix)).size > 1) ambiguous = true;
      }
    }
    if (matches.length === 0) {
      const near = matchNearestLane(destino, resolved?.uf ?? null, destCoords, lanes);
      if (near) {
        matches = [near.lane];
        confidence = "nearest";
      }
    }

    if (matches.length > 0 && rank[confidence] > rank[matchedBy]) matchedBy = confidence;

    const carrier = table.freight_carriers as { id: string; name: string };
    const carrierCoverage = (covRows ?? []).filter(
      (c) => c.carrier_id === table.carrier_id,
    ) as FreightCoverage[];
    const cov = matchCoverage(destino, carrierCoverage, resolved?.city ?? null);

    for (const lane of matches) {
      const quote = priceLane(
        lane,
        { peso_real_kg: peso_real, volume_m3, valor_nf },
        {
          cubageKgPerM3: Number(table.cubage_kg_per_m3) || 300,
          defaultIcmsRate: Number(table.icms_rate) || 0,
          tda: cov?.tda_value ?? null,
        },
      );
      if (confidence === "nearest")
        quote.avisos.unshift(
          "Praça estimada (mais próxima por CEP). Confirme o valor com a transportadora.",
        );
      results.push({
        carrier: { id: carrier.id, name: carrier.name },
        table: { id: table.id, name: table.name, origin_label: table.origin_label },
        destination: {
          city: lane.dest_city,
          cep_prefix: lane.dest_cep_prefix,
          uf: lane.dest_uf,
        },
        match_confidence: confidence,
        prazo_min: cov?.prazo_min ?? null,
        prazo_max: cov?.prazo_max ?? null,
        frequency: cov?.frequency ?? null,
        quote,
      });
    }
  }

  // ── Braspress (API) — independent carrier, only with a destination CEP ──
  if (isBraspressEnabled() && looksLikeCep(destino)) {
    if (cubagem.length === 0) {
      warnings.push("Braspress (API): cadastre as dimensões dos volumes para cotar.");
    } else {
      const bp = await quoteBraspress({
        cepOrigem: ORIGIN_CEP,
        cepDestino: destino,
        peso: peso_real,
        volumes: totalVolumes,
        vlrMercadoria: valor_nf,
        cubagem,
      });
      if (bp.ok && bp.total != null) {
        const peso_cubado = volume_m3 * 300;
        results.push({
          carrier: { id: "braspress", name: "Braspress" },
          table: { id: "braspress-api", name: "API", origin_label: "NOVA HARTZ-RS" },
          destination: {
            city: resolved?.city ?? "",
            cep_prefix: cepMatchKey(destino),
            uf: resolved?.uf ?? null,
          },
          match_confidence: "api",
          prazo_min: bp.prazo ?? null,
          prazo_max: bp.prazo ?? null,
          frequency: null,
          quote: {
            peso_taxavel_kg: Math.max(peso_real, peso_cubado),
            peso_cubado_kg: peso_cubado,
            peso_real_kg: peso_real,
            usou_cubagem: peso_cubado > peso_real,
            frete_peso: 0,
            advalorem: 0,
            gris: 0,
            pedagio: 0,
            taxa_fixa: 0,
            ta: 0,
            tda: 0,
            subtotal_sem_icms: bp.total,
            min_aplicado: false,
            icms_rate: 0,
            icms: 0,
            total: bp.total,
            lines: [{ key: "api", label: "Frete total (API Braspress)", value: bp.total }],
            avisos: ["Cotação em tempo real via API — impostos e taxas já inclusos no total retornado."],
          },
        });
        if (matchedBy === "none") matchedBy = "api";
      } else if (!bp.ok) {
        warnings.push(`Braspress (API): ${bp.error ?? "indisponível"}.`);
      }
    }
  }

  results.sort((a, b) => a.quote.total - b.quote.total);

  return {
    ok: true,
    body: {
      results,
      matched_by: matchedBy,
      ambiguous_city: ambiguous,
      resolved: resolved
        ? { cep: resolved.cep, city: resolved.city, uf: resolved.uf, source: resolved.source }
        : null,
      shipment: {
        peso_real,
        volume_m3,
        peso_cubado: volume_m3 * 300,
        valor_nf,
      },
      warnings,
    },
  };
}
```

- [ ] **Step 2: Reescrever `app/api/freight/quote/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, requireUser } from "@/lib/freight/server";
import { quoteFreight, type VolumeSel } from "@/lib/freight/quote";

// POST /api/freight/quote
// Body: { destino: string, volumes: {volume_id, count}[], valor_nf: number }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    if (!(await requireUser(supabase)))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const outcome = await quoteFreight(supabase, {
      destino: String(body.destino ?? "").trim(),
      volumes: (body.volumes ?? []) as VolumeSel[],
      valor_nf: Number(body.valor_nf) || 0,
    });
    return outcome.ok
      ? NextResponse.json(outcome.body)
      : NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("POST freight quote error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `git diff --stat`
Expected: `route.ts` perdeu ~290 linhas e `quote.ts` ganhou o equivalente; nenhuma outra mudança.

A cotação é exercitada de ponta a ponta na Task 9 (dry-run com CEP real).

- [ ] **Step 4: Commit**

```bash
git add lib/freight/quote.ts app/api/freight/quote/route.ts
git commit -m "refactor: cotação de frete sai da rota para lib/freight/quote.ts"
```

---

### Task 7: Registro das rodadas e exclusão das métricas

**Files:**
- Create: `scripts/run-sql.mjs`
- Create: `supabase/migrations/ai_seller_runs.sql`
- Create: `supabase/migrations/v_contatos_importados_source_exclui_ia_teste.sql`
- Create: `lib/ghl/ai-seller/runs-store.ts`

**Interfaces:**
- Consumes: `EscalationReason`, `RunDecision` (types.ts); `createSupabaseServerForSync()` (`lib/supabase/server.ts`, cliente service role sem tipos gerados).
- Produces: `AiHistory`, `loadAiHistory(contactId: string, nowMs: number): Promise<AiHistory>`, `AiSellerRunInsert`, `insertRun(row: AiSellerRunInsert): Promise<void>`

- [ ] **Step 1: Criar `supabase/migrations/ai_seller_runs.sql`**

```sql
-- ============================================================
-- Registro da IA vendedora: uma linha por acionamento do endpoint
-- /api/ai-seller/respond (spec 2026-09-29-ia-vendedora-nucleo-conversa).
-- sent_message_ids é o que prova quais falas da conversa são da IA — a
-- detecção de "humano assumiu" e de "já respondido" depende dele.
-- ============================================================

create table if not exists public.ai_seller_runs (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  opportunity_id text,
  triggered_at timestamptz not null default now(),
  decision text not null,
  escalation_reason text,
  tool_calls jsonb not null default '[]'::jsonb,
  sent_message_ids text[] not null default '{}',
  model text,
  usage jsonb,
  latency_ms integer,
  error text
);

create index if not exists ai_seller_runs_contact_triggered_idx
  on public.ai_seller_runs (contact_id, triggered_at desc);

alter table public.ai_seller_runs enable row level security;

drop policy if exists "read authenticated" on public.ai_seller_runs;
create policy "read authenticated" on public.ai_seller_runs
  for select to authenticated
  using (true);

drop policy if exists approved_user_gate on public.ai_seller_runs;
create policy approved_user_gate on public.ai_seller_runs
  as restrictive for all to authenticated
  using ((select private.is_approved_user()))
  with check ((select private.is_approved_user()));

revoke all on table public.ai_seller_runs from anon;
```

- [ ] **Step 2: Criar `supabase/migrations/v_contatos_importados_source_exclui_ia_teste.sql`**

Mesma view de `20260904145500_cache_imported_contacts.sql`, com um ramo novo em `candidatos`:

```sql
-- ============================================================
-- Testadores da IA vendedora (tag ia-teste, ou oportunidade com prefixo
-- "(TESTE IA)") saem das métricas de negócio pelo mesmo caminho dos contatos
-- importados. NÃO saem de ghl_opportunities: o Copiloto e o Auditor leem de
-- lá, e é por eles que se mede a qualidade da IA.
-- A view materializada mv_contatos_importados é atualizada pelo cron
-- refresh-contatos-importados-30min (minutos 7 e 37).
-- ============================================================

create or replace view public.v_contatos_importados_source
with (security_invoker = true) as
with dias_rajada as materialized (
  select (o.created_at at time zone 'America/Sao_Paulo')::date as dia
  from public.ghl_opportunities o
  group by 1
  having count(*) > 1000
),
candidatos as (
  select distinct t.contact_id
  from public.ghl_contact_tags t
  where t.tag ilike '%import%'

  union

  select e.contact_id
  from public.ghl_funnel_events e
  where exists (
    select 1 from unnest(e.tags) as tag where tag ilike '%import%'
  )

  union

  select o.contact_id
  from public.ghl_opportunities o
  join dias_rajada d
    on d.dia = (o.created_at at time zone 'America/Sao_Paulo')::date
  left join public.ghl_contacts c on c.id = o.contact_id
  where c.id is null

  union

  select o.contact_id
  from public.ghl_opportunities o
  where (o.raw ->> 'source') ilike '%activecampaign migration%'

  union

  -- ambiente de teste da IA vendedora
  select t.contact_id
  from public.ghl_contact_tags t
  where t.tag = 'ia-teste'

  union

  select e.contact_id
  from public.ghl_funnel_events e
  where 'ia-teste' = any (e.tags)

  union

  select o.contact_id
  from public.ghl_opportunities o
  where (o.raw -> 'contact' -> 'tags') ? 'ia-teste'
     or (o.raw ->> 'name') ilike '(TESTE IA)%'
),
venda_real_fora_da_rajada as (
  select distinct o.contact_id
  from public.ghl_opportunities o
  where o.status = 'won'
    and o.monetary_value > 0
    and not exists (
      select 1
      from dias_rajada d
      where d.dia = (o.won_at at time zone 'America/Sao_Paulo')::date
    )
)
select c.contact_id
from candidatos c
where not exists (
  select 1
  from venda_real_fora_da_rajada v
  where v.contact_id = c.contact_id
);

revoke all on public.v_contatos_importados_source
  from public, anon, authenticated;
```

- [ ] **Step 3: Criar `scripts/run-sql.mjs`**

```js
// Roda SQL no Postgres do Supabase pelo DATABASE_URL do .env.local.
//   node --env-file=.env.local scripts/run-sql.mjs --file caminho.sql
//   node --env-file=.env.local scripts/run-sql.mjs "select count(*) from public.ai_seller_runs"
// Com --file, o arquivo inteiro roda numa transação (tudo ou nada).
import { readFileSync } from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const sql = fileIndex >= 0 ? readFileSync(args[fileIndex + 1], "utf8") : args.join(" ");
if (!sql.trim()) {
  console.error("Informe o SQL ou --file <arquivo>.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não configurado (use --env-file=.env.local).");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  if (fileIndex >= 0) await client.query("begin");
  const result = await client.query(sql);
  if (fileIndex >= 0) await client.query("commit");
  const last = Array.isArray(result) ? result.at(-1) : result;
  if (last?.rows?.length) console.table(last.rows);
  else console.log("ok");
} catch (error) {
  if (fileIndex >= 0) await client.query("rollback");
  console.error("ERRO:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
```

- [ ] **Step 4: Aplicar as duas migrações**

Anotar o valor de antes:

Run: `node --env-file=.env.local scripts/run-sql.mjs "select count(*) as importados from public.v_contatos_importados_source"`

Aplicar, uma de cada vez:

Run: `node --env-file=.env.local scripts/run-sql.mjs --file supabase/migrations/ai_seller_runs.sql`
Expected: `ok`

Run: `node --env-file=.env.local scripts/run-sql.mjs --file supabase/migrations/v_contatos_importados_source_exclui_ia_teste.sql`
Expected: `ok`

Verificar:

Run: `node --env-file=.env.local scripts/run-sql.mjs "select count(*) as linhas from public.ai_seller_runs"`
Expected: `linhas = 0`.

Run: `node --env-file=.env.local scripts/run-sql.mjs "select count(*) as importados from public.v_contatos_importados_source"`
Expected: igual ao valor anotado antes — ainda não existe contato `ia-teste`.

- [ ] **Step 5: Criar `lib/ghl/ai-seller/runs-store.ts`**

```ts
import "server-only";

import { createSupabaseServerForSync } from "@/lib/supabase/server";
import type { EscalationReason, RunDecision } from "./types";

export interface AiHistory {
  sentMessageIds: Set<string>;
  sendsLastHour: number;
  firstRunAt: string | null;
}

export async function loadAiHistory(
  contactId: string,
  nowMs: number,
): Promise<AiHistory> {
  const supabase = await createSupabaseServerForSync();
  const { data, error } = await supabase
    .from("ai_seller_runs")
    .select("triggered_at, sent_message_ids")
    .eq("contact_id", contactId)
    .order("triggered_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`ai_seller_runs: ${error.message}`);

  const rows = (data ?? []) as Array<{
    triggered_at: string;
    sent_message_ids: string[] | null;
  }>;
  const hourAgo = nowMs - 60 * 60 * 1000;
  const sentMessageIds = new Set<string>();
  let sendsLastHour = 0;
  for (const row of rows) {
    const ids = row.sent_message_ids ?? [];
    for (const id of ids) sentMessageIds.add(id);
    if (Date.parse(row.triggered_at) >= hourAgo) sendsLastHour += ids.length;
  }
  return { sentMessageIds, sendsLastHour, firstRunAt: rows[0]?.triggered_at ?? null };
}

export interface AiSellerRunInsert {
  contact_id: string;
  opportunity_id: string | null;
  triggered_at: string;
  decision: RunDecision;
  escalation_reason: EscalationReason | null;
  tool_calls: unknown;
  sent_message_ids: string[];
  model: string | null;
  usage: unknown;
  latency_ms: number;
  error: string | null;
}

/**
 * Falhar aqui é grave: sem os ids enviados, a próxima rodada não sabe que a
 * IA já respondeu. Por isso lança — a rota devolve 500 e o erro aparece no
 * log do Vercel.
 */
export async function insertRun(row: AiSellerRunInsert): Promise<void> {
  const supabase = await createSupabaseServerForSync();
  const { error } = await supabase.from("ai_seller_runs").insert(row);
  if (error) throw new Error(`ai_seller_runs insert: ${error.message}`);
}
```

- [ ] **Step 6: Verificar e commitar**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add scripts/run-sql.mjs supabase/migrations/ai_seller_runs.sql supabase/migrations/v_contatos_importados_source_exclui_ia_teste.sql lib/ghl/ai-seller/runs-store.ts
git commit -m "feat: registro das rodadas da IA vendedora e testadores fora das métricas"
```

---

### Task 8: Ações no GHL

**Files:**
- Modify: `lib/ghl/api.ts` (interface `GhlContactDetail`)
- Create: `lib/ghl/ai-seller/ghl-actions.ts`
- Create: `scripts/ai-seller-verify-ghl.mjs`

**Interfaces:**
- Consumes: `fetchOpportunityById`, `fetchGhlPipelines`, `findStageIdByName`, `updateGhlOpportunity` (`lib/ghl/api.ts`); `GHL_MOCKUP_FACTORY_PIPELINE_ID` (`lib/ghl/pipelines.ts`); `ART_CHANGE_STAGE_NAME`, `GHL_ATENDIMENTO_PIPELINE_ID`, `type AiMovableStage` (config.ts); `roundMoney` (pricing.ts); `packPairsIntoVolumes` (packing.ts); `quoteFreight` (`lib/freight/quote.ts`); `createSupabaseServerForSync`.
- Produces: `sendWhatsAppMessage(contactId: string, message: string): Promise<string>`, `addContactTags(contactId: string, tags: string[]): Promise<void>`, `removeContactTags(contactId: string, tags: string[]): Promise<void>`, `assignContact(contactId: string, userId: string): Promise<void>`, `BUDGET_FIELDS`, `writeBudgetChain(input: { contactId: string; opportunityId: string; pares: number; unitario: number; subtotal: number; frete: number | null }): Promise<void>`, `moveOpportunityForward(opportunityId: string, etapa: AiMovableStage): Promise<"movido" | "sem_mudanca" | "fora_do_atendimento">`, `moveOpportunityToArtChange(opportunityId: string): Promise<"movido" | "ja_em_alteracao">`, `quoteFreightForPares(input: { cep: string; pares: number; valorNf: number }): Promise<number | null>`

- [ ] **Step 1: Acrescentar `tags` e `assignedTo` a `GhlContactDetail` em `lib/ghl/api.ts`**

De:

```ts
export interface GhlContactDetail extends GhlContactSummary {
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  customFields?: Array<{ id: string; value: unknown }>;
}
```

Para:

```ts
export interface GhlContactDetail extends GhlContactSummary {
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  customFields?: Array<{ id: string; value: unknown }>;
  tags?: string[];
  assignedTo?: string | null;
}
```

- [ ] **Step 2: Criar `lib/ghl/ai-seller/ghl-actions.ts`**

```ts
import "server-only";

import {
  fetchGhlPipelines,
  fetchOpportunityById,
  findStageIdByName,
  updateGhlOpportunity,
} from "@/lib/ghl/api";
import { GHL_MOCKUP_FACTORY_PIPELINE_ID } from "@/lib/ghl/pipelines";
import { packPairsIntoVolumes } from "@/lib/freight/packing";
import { quoteFreight } from "@/lib/freight/quote";
import { createSupabaseServerForSync } from "@/lib/supabase/server";
import {
  ART_CHANGE_STAGE_NAME,
  GHL_ATENDIMENTO_PIPELINE_ID,
  type AiMovableStage,
} from "./config";
import { roundMoney } from "./pricing";

const GHL_BASE_URL =
  process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const CONVERSATIONS_VERSION = "2021-04-15";
const CONTACTS_VERSION = "2021-07-28";

type Method = "GET" | "POST" | "PUT" | "DELETE";

async function ghlCall<T>(
  path: string,
  method: Method,
  version: string,
  body?: unknown,
): Promise<T> {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) throw new Error("GHL_PRIVATE_INTEGRATION_TOKEN não configurado");
  const url = new URL(path, GHL_BASE_URL);
  // POST não se repete: um envio de WhatsApp repetido vira mensagem duplicada.
  const attempts = method === "POST" ? 1 : 3;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: version,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
      continue;
    }
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GHL API ${response.status} em ${method} ${url.pathname}: ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
  throw new Error(`GHL API falhou em ${method} ${url.pathname}`);
}

export async function sendWhatsAppMessage(
  contactId: string,
  message: string,
): Promise<string> {
  const data = await ghlCall<{ messageId?: string }>(
    "/conversations/messages",
    "POST",
    CONVERSATIONS_VERSION,
    { type: "WhatsApp", contactId, message },
  );
  if (!data.messageId) throw new Error("GHL não devolveu messageId no envio");
  return data.messageId;
}

export async function addContactTags(contactId: string, tags: string[]): Promise<void> {
  await ghlCall(`/contacts/${contactId}/tags`, "POST", CONTACTS_VERSION, { tags });
}

export async function removeContactTags(contactId: string, tags: string[]): Promise<void> {
  await ghlCall(`/contacts/${contactId}/tags`, "DELETE", CONTACTS_VERSION, { tags });
}

export async function assignContact(contactId: string, userId: string): Promise<void> {
  await ghlCall(`/contacts/${contactId}`, "PUT", CONTACTS_VERSION, { assignedTo: userId });
}

/** Cadeia do orçamento: valores gravados, não fórmulas (memória ghl-escrita-via-api). */
export const BUDGET_FIELDS = {
  oppPares: "TFp4L5VxK9mHBaAMXyo7",
  oppUnitario: "Tw2UZe2XgRIBhRXEwg4k",
  contactPares: "APXFcsShy3vQ3YX6lvyd",
  contactUnitario: "TRBawWiHzT2ABAG3kcam",
  contactSubtotal: "Kt2npElalasCf4ltKFSQ",
  contactFrete: "RFntWWslwNzkGGVJExCC",
  contactTotal: "b1wqJVGzZSqBv4dITtqn",
} as const;

export async function writeBudgetChain(input: {
  contactId: string;
  opportunityId: string;
  pares: number;
  unitario: number;
  subtotal: number;
  frete: number | null;
}): Promise<void> {
  await updateGhlOpportunity(input.opportunityId, {
    monetaryValue: input.subtotal,
    customFields: [
      { id: BUDGET_FIELDS.oppPares, fieldValue: input.pares },
      { id: BUDGET_FIELDS.oppUnitario, fieldValue: input.unitario },
    ],
  });

  const contactFields: Array<{ id: string; value: number }> = [
    { id: BUDGET_FIELDS.contactPares, value: input.pares },
    { id: BUDGET_FIELDS.contactUnitario, value: input.unitario },
    { id: BUDGET_FIELDS.contactSubtotal, value: input.subtotal },
  ];
  if (input.frete != null) {
    contactFields.push(
      { id: BUDGET_FIELDS.contactFrete, value: input.frete },
      { id: BUDGET_FIELDS.contactTotal, value: roundMoney(input.subtotal + input.frete) },
    );
  }
  // Contato usa snake_case (field_value); oportunidade usa camelCase.
  await ghlCall(`/contacts/${input.contactId}`, "PUT", CONTACTS_VERSION, {
    customFields: contactFields.map((f) => ({ id: f.id, field_value: f.value })),
  });
}

export async function moveOpportunityForward(
  opportunityId: string,
  etapa: AiMovableStage,
): Promise<"movido" | "sem_mudanca" | "fora_do_atendimento"> {
  const opportunity = await fetchOpportunityById(opportunityId);
  // Na Fábrica de Mockups a arte está sendo feita: tirar de lá quebraria o
  // fluxo do design.
  if (opportunity.pipelineId !== GHL_ATENDIMENTO_PIPELINE_ID) return "fora_do_atendimento";

  const pipelines = await fetchGhlPipelines();
  const stages =
    pipelines.find((p) => p.id === GHL_ATENDIMENTO_PIPELINE_ID)?.stages ?? [];
  const currentIndex = stages.findIndex((s) => s.id === opportunity.pipelineStageId);
  const targetIndex = stages.findIndex(
    (s) => s.name.trim().toLowerCase() === etapa.toLowerCase(),
  );
  if (targetIndex < 0) throw new Error(`Etapa "${etapa}" não existe no pipeline Atendimento`);
  if (currentIndex >= targetIndex) return "sem_mudanca";

  await updateGhlOpportunity(opportunityId, { pipelineStageId: stages[targetIndex].id });
  return "movido";
}

export async function moveOpportunityToArtChange(
  opportunityId: string,
): Promise<"movido" | "ja_em_alteracao"> {
  const stageId = await findStageIdByName(
    GHL_MOCKUP_FACTORY_PIPELINE_ID,
    ART_CHANGE_STAGE_NAME,
  );
  if (!stageId) throw new Error(`Etapa "${ART_CHANGE_STAGE_NAME}" não encontrada na Fábrica de Mockups`);
  const opportunity = await fetchOpportunityById(opportunityId);
  if (opportunity.pipelineStageId === stageId) return "ja_em_alteracao";

  await updateGhlOpportunity(opportunityId, {
    pipelineId: GHL_MOCKUP_FACTORY_PIPELINE_ID,
    pipelineStageId: stageId,
  });
  return "movido";
}

/** Menor frete entre as tabelas ativas e a API; null se não houver cotação. */
export async function quoteFreightForPares(input: {
  cep: string;
  pares: number;
  valorNf: number;
}): Promise<number | null> {
  const supabase = await createSupabaseServerForSync();
  const { data: volumes, error } = await supabase
    .from("freight_volumes")
    .select("id, pairs_capacity")
    .eq("active", true);
  if (error) throw new Error(`freight_volumes: ${error.message}`);

  const selection = packPairsIntoVolumes(
    input.pares,
    (volumes ?? []) as Array<{ id: string; pairs_capacity: number }>,
  );
  if (selection.length === 0) return null;

  const outcome = await quoteFreight(supabase, {
    destino: input.cep.replace(/\D/g, ""),
    volumes: selection,
    valor_nf: input.valorNf,
  });
  if (!outcome.ok || outcome.body.results.length === 0) return null;
  return roundMoney(outcome.body.results[0].quote.total);
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Criar `scripts/ai-seller-verify-ghl.mjs`**

Confere ao vivo os contratos da API que o spec deixou "a confirmar", num contato de teste da equipe. Usa `fetch` direto porque `ghl-actions.ts` importa `server-only`, que não carrega fora do Next.

```js
// Uso (só com autorização do Greco, num contato de teste da equipe):
//   node --env-file=.env.local scripts/ai-seller-verify-ghl.mjs <contactId> [--enviar]
// Sem --enviar, não manda WhatsApp.
const BASE = "https://services.leadconnectorhq.com";
const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
const [contactId, flag] = process.argv.slice(2);
if (!contactId) {
  console.error("Informe o contactId de teste.");
  process.exit(1);
}

async function call(path, method, version, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: version,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}

const TAG = "ia-verificacao";

const add = await call(`/contacts/${contactId}/tags`, "POST", "2021-07-28", { tags: [TAG] });
let contact = await call(`/contacts/${contactId}`, "GET", "2021-07-28");
console.log("adicionar tag:", add.status, "| tag presente:", contact.json.contact?.tags?.includes(TAG));

const del = await call(`/contacts/${contactId}/tags`, "DELETE", "2021-07-28", { tags: [TAG] });
contact = await call(`/contacts/${contactId}`, "GET", "2021-07-28");
console.log("remover tag:", del.status, "| tag presente:", contact.json.contact?.tags?.includes(TAG));

console.log("assignedTo atual:", contact.json.contact?.assignedTo ?? null);

if (flag === "--enviar") {
  const sent = await call("/conversations/messages", "POST", "2021-04-15", {
    type: "WhatsApp",
    contactId,
    message: "Teste de integração da IA vendedora — pode ignorar.",
  });
  console.log("envio:", sent.status, JSON.stringify(sent.json));
  const messageId = sent.json.messageId;
  const conversationId = sent.json.conversationId;
  if (messageId && conversationId) {
    await new Promise((r) => setTimeout(r, 5000));
    const list = await call(
      `/conversations/${conversationId}/messages?limit=20`,
      "GET",
      "2021-04-15",
    );
    const found = (list.json.messages?.messages ?? []).find((m) => m.id === messageId);
    console.log("mensagem aparece na conversa com o mesmo id:", Boolean(found), "| source:", found?.source);
  }
}
```

- [ ] **Step 5: Rodar a verificação com o Greco**

Pedir ao Greco o `contactId` de um contato de teste da equipe (o WhatsApp dele, por exemplo) e a autorização para enviar uma mensagem de teste.

Run: `node --env-file=.env.local scripts/ai-seller-verify-ghl.mjs <contactId> --enviar`

Expected:
- `adicionar tag: 200 | tag presente: true`; `remover tag: 200 | tag presente: false` (201 também serve).
- `envio: 201` (ou 200) com `messageId` e `conversationId`.
- `mensagem aparece na conversa com o mesmo id: true`.
- Anotar o `source` devolvido (esperado algo diferente de `"workflow"`).

Se `messageId` não aparecer na conversa com o mesmo id, parar: a detecção de "já respondido" em `decide.ts` depende disso. Voltar ao Greco antes de seguir para a Task 9.

- [ ] **Step 6: Commit**

```bash
git add lib/ghl/api.ts lib/ghl/ai-seller/ghl-actions.ts scripts/ai-seller-verify-ghl.mjs
git commit -m "feat: ações da IA vendedora no GHL — envio, tags, orçamento, etapas, frete"
```

---

### Task 9: Orquestração e endpoint

**Files:**
- Create: `lib/ghl/ai-seller/run.ts`
- Create: `app/api/ai-seller/respond/route.ts`
- Modify: `vercel.json` (bloco `functions`)
- Modify: `.env.local` (variáveis novas; o arquivo não vai para o git)

**Interfaces:**
- Consumes: tudo das Tasks 1–8; `fetchGhlContactById`, `fetchGhlPipelines`, `searchGhlOpportunitiesByContact` (`lib/ghl/api.ts`); `getNegotiationTranscript`, `getQtyParesForOpportunity` (`lib/ghl/negotiation-conversations.ts`); `buildTranscriptParts`, `todayBRDateString` (`lib/ghl/sales-agent/agent.ts`); `createContactNote` (`lib/ghl/mockup-instructions/ghl-client.ts`); `requireBearerSecret` (`lib/security/route-guards.ts`).
- Produces: `RespondResult`, `respondToContact(contactId: string, options?: { dryRun?: boolean }): Promise<RespondResult>`; `POST /api/ai-seller/respond` com corpo `{ "contactId": "..." }`, `Authorization: Bearer <AI_SELLER_WEBHOOK_SECRET>`, `?dryRun=1` opcional.

- [ ] **Step 1: Criar `lib/ghl/ai-seller/run.ts`**

```ts
import "server-only";

import OpenAI from "openai";
import type {
  ResponseFunctionToolCall,
  ResponseInput,
} from "openai/resources/responses/responses";
import {
  fetchGhlContactById,
  fetchGhlPipelines,
  searchGhlOpportunitiesByContact,
  type GhlOpportunity,
} from "@/lib/ghl/api";
import {
  getNegotiationTranscript,
  getQtyParesForOpportunity,
} from "@/lib/ghl/negotiation-conversations";
import { createContactNote } from "@/lib/ghl/mockup-instructions/ghl-client";
import {
  buildTranscriptParts,
  todayBRDateString,
} from "@/lib/ghl/sales-agent/agent";
import {
  AI_ESCALATED_TAG,
  AI_SELLER_MODEL,
  AI_TAG,
  escalationUserId,
  escalationUserName,
  MAX_AGENT_STEPS,
  personaName,
} from "./config";
import { decideRun } from "./decide";
import {
  addContactTags,
  assignContact,
  moveOpportunityForward,
  moveOpportunityToArtChange,
  quoteFreightForPares,
  removeContactTags,
  sendWhatsAppMessage,
  writeBudgetChain,
} from "./ghl-actions";
import { runAgentLoop, type CallModel, type LoopResult } from "./loop";
import { buildContextText, buildSellerInstructions } from "./prompt";
import { insertRun, loadAiHistory, type AiSellerRunInsert } from "./runs-store";
import { executeTool, TOOL_DEFINITIONS } from "./tools";
import type { EscalationReason, RunDecision, SellerActions } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export interface RespondResult {
  decision: RunDecision;
  dryRun: boolean;
  sentMessageIds: string[];
  toolCalls?: LoopResult["toolCalls"];
  error?: string | null;
}

function handoffMessage(): string {
  return `Vou pedir pra ${escalationUserName()} continuar seu atendimento por aqui, tá bom? 😊`;
}

async function findCurrentOpportunity(contactId: string): Promise<GhlOpportunity | null> {
  const opportunities = await searchGhlOpportunitiesByContact(contactId);
  const open = opportunities.filter((o) => (o.status ?? "open") === "open");
  open.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  return open[0] ?? null;
}

function realActions(contactId: string, opportunityId: string): SellerActions {
  const persona = personaName();
  return {
    async sendMessages(messages) {
      const ids: string[] = [];
      for (const [index, message] of messages.entries()) {
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
        ids.push(await sendWhatsAppMessage(contactId, message));
      }
      return ids;
    },
    async escalate({ motivo, resumo, mensagemCliente }) {
      const ids: string[] = [];
      const text = mensagemCliente.trim() || handoffMessage();
      try {
        ids.push(await sendWhatsAppMessage(contactId, text));
      } catch (err) {
        console.error("IA vendedora: falha ao avisar o cliente na passagem", err);
      }
      await removeContactTags(contactId, [AI_TAG]);
      await addContactTags(contactId, [AI_ESCALATED_TAG]);
      await assignContact(contactId, escalationUserId());
      await createContactNote({
        contactId,
        title: `IA ${persona} passou o atendimento — ${motivo}`,
        body: `Motivo: ${motivo}\n\n${resumo}`,
      });
      return ids;
    },
    quoteFreight: (input) => quoteFreightForPares(input),
    writeBudget: (input) => writeBudgetChain({ contactId, opportunityId, ...input }),
    async requestArtChange(resumo) {
      const status = await moveOpportunityToArtChange(opportunityId);
      await createContactNote({
        contactId,
        title: `Pedido de ajuste de arte (IA ${persona})`,
        body: resumo,
      });
      return status;
    },
    moveStage: (etapa) => moveOpportunityForward(opportunityId, etapa),
  };
}

/** Sem efeito colateral: só a cotação de frete (leitura) é real. */
function dryRunActions(): SellerActions {
  let counter = 0;
  const fakeId = () => `dry-${++counter}`;
  return {
    async sendMessages(messages) {
      return messages.map(() => fakeId());
    },
    async escalate() {
      return [fakeId()];
    },
    quoteFreight: (input) => quoteFreightForPares(input),
    async writeBudget() {},
    async requestArtChange() {
      return "movido";
    },
    async moveStage() {
      return "movido";
    },
  };
}

function makeCallModel(instructions: string): CallModel {
  return async (input) => {
    const response = await openai.responses.create({
      model: AI_SELLER_MODEL,
      instructions,
      input: input as ResponseInput,
      tools: TOOL_DEFINITIONS,
      tool_choice: "required",
      parallel_tool_calls: false,
      reasoning: { effort: "medium" },
      store: false,
      include: ["reasoning.encrypted_content"],
      max_output_tokens: 6000,
    });
    const functionCalls = response.output
      .filter((item): item is ResponseFunctionToolCall => item.type === "function_call")
      .map((item) => ({ call_id: item.call_id, name: item.name, arguments: item.arguments }));
    return {
      outputItems: response.output,
      functionCalls,
      usage: response.usage
        ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
        : null,
    };
  };
}

export async function respondToContact(
  contactId: string,
  options: { dryRun?: boolean } = {},
): Promise<RespondResult> {
  const dryRun = options.dryRun === true;
  const startedAt = Date.now();

  const [contact, transcript, history, opportunity] = await Promise.all([
    fetchGhlContactById(contactId),
    getNegotiationTranscript(contactId),
    loadAiHistory(contactId, startedAt),
    findCurrentOpportunity(contactId),
  ]);

  const base: Omit<AiSellerRunInsert, "decision"> = {
    contact_id: contactId,
    opportunity_id: opportunity?.id ?? null,
    triggered_at: new Date(startedAt).toISOString(),
    escalation_reason: null,
    tool_calls: [],
    sent_message_ids: [],
    model: null,
    usage: null,
    latency_ms: 0,
    error: null,
  };
  const record = async (row: Partial<AiSellerRunInsert> & { decision: RunDecision }) => {
    if (dryRun) return;
    await insertRun({ ...base, ...row, latency_ms: Date.now() - startedAt });
  };

  if (!dryRun) {
    const decision = decideRun({
      now: startedAt,
      hasAiTag: (contact.tags ?? []).includes(AI_TAG),
      messages: transcript.messages,
      aiSentMessageIds: history.sentMessageIds,
      aiSendsLastHour: history.sendsLastHour,
      aiFirstRunAt: history.firstRunAt,
    });

    if (decision.kind === "skip") {
      await record({ decision: decision.decision });
      return { decision: decision.decision, dryRun, sentMessageIds: [] };
    }

    if (decision.kind === "human_took_over") {
      await removeContactTags(contactId, [AI_TAG]);
      await createContactNote({
        contactId,
        title: `IA ${personaName()} saiu da conversa`,
        body: "Uma pessoa do time respondeu o cliente depois que a IA assumiu; a IA não responde mais este contato.",
      });
      await record({ decision: "humano_assumiu" });
      return { decision: "humano_assumiu", dryRun, sentMessageIds: [] };
    }

    if (decision.kind === "limit" || !opportunity) {
      const motivo: EscalationReason = decision.kind === "limit" ? "limite_mensagens" : "falha_tecnica";
      const resumo =
        decision.kind === "limit"
          ? "A IA atingiu o limite de mensagens por hora com este contato (proteção contra loop)."
          : "Nenhuma oportunidade aberta encontrada para o contato.";
      const actions = realActions(contactId, opportunity?.id ?? "");
      const sent = await actions.escalate({ motivo, resumo, mensagemCliente: handoffMessage() });
      await record({
        decision: decision.kind === "limit" ? "pulou:limite" : "erro",
        escalation_reason: motivo,
        sent_message_ids: sent,
        error: decision.kind === "limit" ? null : resumo,
      });
      return { decision: decision.kind === "limit" ? "pulou:limite" : "erro", dryRun, sentMessageIds: sent };
    }
  }

  if (!opportunity) {
    return { decision: "erro", dryRun, sentMessageIds: [], error: "sem oportunidade aberta" };
  }

  const persona = personaName();
  const pipelines = await fetchGhlPipelines();
  const pipeline = pipelines.find((p) => p.id === opportunity.pipelineId) ?? null;
  const stage = pipeline?.stages?.find((s) => s.id === opportunity.pipelineStageId) ?? null;

  const transcriptParts = await buildTranscriptParts(transcript.messages, {
    ownMessageIds: history.sentMessageIds,
    ownLabel: `VOCÊ (${persona})`,
  });
  const contextText = buildContextText({
    today: todayBRDateString(),
    contactName: contact.firstName ?? contact.contactName ?? null,
    pipelineName: pipeline?.name ?? null,
    stageName: stage?.name ?? null,
    crmPares: await getQtyParesForOpportunity(opportunity),
    crmValor: opportunity.monetaryValue,
  });

  const actions = dryRun ? dryRunActions() : realActions(contactId, opportunity.id);
  const result = await runAgentLoop({
    initialInput: [
      { role: "user", content: [{ type: "input_text", text: contextText }, ...transcriptParts] },
    ],
    callModel: makeCallModel(
      buildSellerInstructions({ persona, escalationName: escalationUserName() }),
    ),
    executeTool: (call) => executeTool(call, actions),
    maxSteps: MAX_AGENT_STEPS,
  });

  let decision: RunDecision = result.decision;
  let escalationReason: EscalationReason | null = result.escalationReason;
  const sentMessageIds = [...result.sentMessageIds];

  if (result.decision === "erro") {
    escalationReason = "falha_tecnica";
    try {
      sentMessageIds.push(
        ...(await actions.escalate({
          motivo: "falha_tecnica",
          resumo: result.error ?? "falha técnica sem detalhe",
          mensagemCliente: handoffMessage(),
        })),
      );
    } catch (err) {
      console.error("IA vendedora: falha também ao escalar", err);
    }
    decision = "erro";
  }

  await record({
    decision,
    escalation_reason: escalationReason,
    tool_calls: result.toolCalls,
    sent_message_ids: sentMessageIds,
    model: AI_SELLER_MODEL,
    usage: result.usage,
    error: result.error,
  });

  return { decision, dryRun, sentMessageIds, toolCalls: result.toolCalls, error: result.error };
}
```

- [ ] **Step 2: Criar `app/api/ai-seller/respond/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireBearerSecret } from "@/lib/security/route-guards";
import { respondToContact } from "@/lib/ghl/ai-seller/run";

// Chamado pelo workflow "IA Vendedora | Responder" do GHL, ~90s depois de cada
// mensagem do cliente. ?dryRun=1 roda o cérebro sem enviar nem gravar nada.
export async function POST(request: NextRequest) {
  const authError = requireBearerSecret(
    request,
    process.env.AI_SELLER_WEBHOOK_SECRET,
    "AI_SELLER_WEBHOOK_SECRET",
  );
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as { contactId?: unknown } | null;
  const contactId = typeof body?.contactId === "string" ? body.contactId.trim() : "";
  if (!contactId) {
    return NextResponse.json({ error: "contactId é obrigatório" }, { status: 400 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const result = await respondToContact(contactId, { dryRun });
    return NextResponse.json(result);
  } catch (error) {
    console.error("ai-seller respond error:", { contactId, dryRun, error });
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Configurar `vercel.json` e `.env.local`**

Em `vercel.json`, dentro de `"functions"`, acrescentar:

```json
"app/api/ai-seller/respond/route.ts": {
  "maxDuration": 120
},
```

Em `.env.local`, acrescentar (gerar o segredo com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`):

```
AI_SELLER_WEBHOOK_SECRET=<segredo gerado>
AI_SELLER_ESCALATION_USER_ID=XdbufXkZKhQ5YeleSeCw
AI_SELLER_ESCALATION_NAME=Schay
AI_SELLER_PERSONA_NAME=Lia
```

Validar JSON: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('ok')"` → `ok`.

- [ ] **Step 4: Tipos e testes**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run test:ai-seller`
Expected: PASS, 40 testes.

- [ ] **Step 5: Dry-run em conversas reais**

Subir o dev server numa porta própria (memória `dev-server-porta-3000`: evitar conflito com outra sessão), por exemplo com `.claude/launch.json` apontando para `node node_modules/next/dist/bin/next dev --turbopack -p 3093`.

Rodar o cérebro, sem enviar nada, em três conversas já conhecidas:

```bash
curl -s -X POST "http://localhost:3093/api/ai-seller/respond?dryRun=1" -H "Authorization: Bearer $AI_SELLER_WEBHOOK_SECRET" -H "Content-Type: application/json" -d '{"contactId":"z5XaWTFmT47S3APgxGwp"}'
```

Repetir com `j5hzO3HMlOeOJPIBBfQl` (Arthur, casamento em 04/09 que já passou) e `7tRyD1jYwPwwrHZh2Qrh` (conversa com áudio e imagens).

Expected, para cada um:
- JSON com `dryRun: true`, `decision` em `respondeu`, `nao_respondeu` ou `escalou`, e `toolCalls` legíveis.
- Arthur: a resposta reconhece que a data do casamento passou; não trata o prazo como vigente.
- Eduardo (12 pares, CEP 03911-040 na conversa): se a IA chamar `atualizar_orcamento` com CEP, o `output` traz `frete` com número e `total` = subtotal + frete — isso exercita a cotação extraída na Task 6.
- Nenhuma mensagem aparece no WhatsApp desses contatos e nenhuma linha nova em `ai_seller_runs`.

Colar as três saídas para o Greco avaliar o tom e as decisões antes do piloto. Ajustes de texto vão em `prompt.ts`, com novo commit.

- [ ] **Step 6: Commit**

```bash
git add lib/ghl/ai-seller/run.ts app/api/ai-seller/respond/route.ts vercel.json
git commit -m "feat: endpoint da IA vendedora com modo dry-run"
```

---

### Task 10: Configuração no GHL, deploy e piloto

Passos manuais no GHL e no Vercel, feitos pelo Greco (ou com ele), e o roteiro do piloto. Nenhum cliente real é atendido pela IA nesta task.

**Files:** nenhum arquivo de código.

- [ ] **Step 1: Variáveis no Vercel e deploy**

Cadastrar no projeto do Vercel (Production) as quatro variáveis da Task 9 com os mesmos valores. Fazer push de `main` para disparar o deploy.

Verificar que o endpoint responde e exige segredo:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://dashboard.hudlab.com.br/api/ai-seller/respond -H "Content-Type: application/json" -d '{"contactId":"x"}'
```

Expected: `401`.

- [ ] **Step 2: Workflow da palavra-chave (GHL)**

Criar o workflow "IA Vendedora | Palavra-chave de teste":
- Gatilho: Customer Replied, com filtro "Message body contains" `LIA TESTE`.
- Ação: Add Contact Tag `ia-teste`.
- Ação: Wait 2 minutes.
- Ação: Create/Update Opportunity no pipeline Atendimento, nome `(TESTE IA) {{contact.name}}`. Se a ação não permitir mudar o nome, remover o passo e renomear a oportunidade à mão assim que ela aparecer (poucos testadores).

- [ ] **Step 3: Entrada na IA no fim do robô (GHL)**

No workflow em que o robô termina e hoje o vendedor assume, acrescentar no fim um If/Else:
- Se o contato tem a tag `ia-teste`: Add Contact Tag `ia-atendimento` e, se o campo Vendedor da oportunidade aceitar texto ou tiver a opção, preencher com "Lia (IA)".
- Senão: nada muda.

O sorteio para clientes reais (split) fica para a abertura do rollout, fora desta task.

- [ ] **Step 4: Workflow que chama a IA (GHL)**

Criar "IA Vendedora | Responder":
- Gatilho: Customer Replied, canal WhatsApp, filtro Contact Tag inclui `ia-atendimento`.
- Configuração: permitir reentrada (dispara a cada mensagem).
- Ação: Wait 90 seconds.
- Ação: Custom Webhook, POST `https://dashboard.hudlab.com.br/api/ai-seller/respond`, cabeçalhos `Authorization: Bearer <AI_SELLER_WEBHOOK_SECRET>` e `Content-Type: application/json`, corpo `{"contactId": "{{contact.id}}"}`.

Botão de pânico: pausar este workflow.

- [ ] **Step 5: Piloto com a equipe**

Um membro da equipe manda "LIA TESTE, tenho interesse em chinelos" e segue o robô até o fim. Conferir, em ordem:
1. Contato recebe `ia-teste` em segundos e `ia-atendimento` no fim do robô.
2. Oportunidade com `(TESTE IA)` no nome (Fábrica de Mockups e Atendimento).
3. Primeira mensagem livre depois do robô: resposta da Lia em ~2 minutos; linha `respondeu` em `ai_seller_runs`; oportunidade movida para "Atendimento".
4. Três mensagens seguidas do testador geram uma resposta só (as outras linhas ficam `pulou:agrupando`).

Depois, entre os testadores, cobrir o roteiro do spec: dúvida de preço e prazo; mudança de quantidade (valor no card atualiza); pedido de ajuste de arte (card vai para "Alteração" e o briefing aparece); áudio; desconto acima do manual (escala); 600 pares (escala); "quero falar com uma pessoa" (escala); pronto para pagar (escala para a Schay, que encerra como **perdido**, motivo "teste"); vendedor humano entrando no meio (`humano_assumiu`, IA para).

Consulta de acompanhamento:

```bash
node --env-file=.env.local scripts/run-sql.mjs "select triggered_at, contact_id, decision, escalation_reason, error from public.ai_seller_runs order by triggered_at desc limit 50"
```

Depois do refresh das :07/:37, o contato do testador aparece em `v_contatos_importados` e some do funil e dos KPIs.

- [ ] **Step 6: Registrar o resultado**

Anotar no spec, numa seção "Resultado do piloto", o que funcionou, o que foi ajustado em `prompt.ts` e o que fica para a abertura do split. A abertura para clientes reais (10%) é decisão do Greco depois dessa leitura.
