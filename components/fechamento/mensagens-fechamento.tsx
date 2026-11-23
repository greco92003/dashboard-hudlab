"use client";

import { Fragment, useState } from "react";
import { Check, Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { brl } from "@/lib/ghl/orcamento-black/calc";
import {
  ESTADOS,
  FORMAS,
  GRADE_ADULTO,
  GRADE_INFANTIL,
  PEDIDO_MINIMO,
  freteEstimadoPorEstado,
  lerValor,
  mensagemArteAprovada,
  mensagemConfirmacao,
  mensagemOrcamentoFinal,
  precoDaForma,
  precosDoPedido,
  totalDaGrade,
  totalDoModelo,
  type FormaDePagamento,
  type ModeloDaGrade,
} from "@/lib/fechamento/mensagens";

type Aba = "arte" | "orcamento" | "confirmacao";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "arte", rotulo: "Arte aprovada" },
  { id: "orcamento", rotulo: "Orçamento" },
  { id: "confirmacao", rotulo: "Confirmação" },
];
const modeloVazio = (): ModeloDaGrade => ({ nome: "", adulto: {}, infantil: {} });

/**
 * Copia pelo documento do clique: na janela flutuante, a aba de trás não está
 * em foco e o navegador recusaria a área de transferência dela.
 */
async function copiarTexto(evento: React.MouseEvent<HTMLButtonElement>, texto: string): Promise<boolean> {
  const doc = evento.currentTarget.ownerDocument;
  const janela = doc.defaultView ?? window;
  try {
    await janela.navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const campo = doc.createElement("textarea");
    campo.value = texto;
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    doc.body.appendChild(campo);
    campo.select();
    const ok = doc.execCommand("copy");
    campo.remove();
    return ok;
  }
}

/** Prévia como no WhatsApp: *negrito* aparece em negrito; o texto copiado mantém os asteriscos. */
function Balao({ texto }: { texto: string }) {
  return (
    <div className="flex justify-end rounded-lg bg-[#efeae2] p-3 dark:bg-[#0b141a]">
      <div className="max-w-full whitespace-pre-wrap break-words rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13.5px] leading-snug text-[#111b21] shadow-sm tabular-nums dark:bg-[#005c4b] dark:text-[#e9edef]">
        {texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
          parte.startsWith("*") && parte.endsWith("*") && parte.length > 2 ? (
            <strong key={i}>{parte.slice(1, -1)}</strong>
          ) : (
            <Fragment key={i}>{parte}</Fragment>
          ),
        )}
      </div>
    </div>
  );
}

function CampoGrade({
  tamanho,
  valor,
  rotulo,
  onChange,
}: {
  tamanho: string;
  valor: number | undefined;
  rotulo: string;
  onChange: (q: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col items-center gap-0.5">
      <span className="text-[10.5px] tabular-nums text-muted-foreground">{tamanho}</span>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={rotulo}
        className="h-8 px-1 text-center tabular-nums"
        value={valor && valor > 0 ? String(valor) : ""}
        onChange={(e) => onChange(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
      />
    </label>
  );
}

/**
 * Gerador das mensagens do fechamento (arte aprovada, orçamento final e
 * confirmação), no formato que a Schay já usava e que a Cami lê para montar a
 * ficha do pedido. Fica na janela flutuante do Fechamento, por cima do GHL.
 */
export function MensagensDoFechamento() {
  const [pares, setPares] = useState("");
  const [frete, setFrete] = useState("");
  const [uf, setUf] = useState("");
  const [forma, setForma] = useState<FormaDePagamento>("pix");
  const [evento, setEvento] = useState("");
  const [obs, setObs] = useState("");
  const [modelos, setModelos] = useState<ModeloDaGrade[]>([modeloVazio()]);
  const [aba, setAba] = useState<Aba>("arte");
  const [copiado, setCopiado] = useState<Aba | null>(null);

  const grade = totalDaGrade(modelos);
  // Sem pares digitados, o pedido segue a soma da grade.
  const nPares = pares.trim() ? Math.trunc(Number(pares) || 0) : grade;
  const freteGratis = nPares >= 36;
  const freteDigitado = lerValor(frete);
  // Sem cotação digitada, o estado dá a mesma estimativa do robô de orçamento.
  const freteDoEstado = uf ? freteEstimadoPorEstado(uf) : null;
  const usaEstimativa = !freteGratis && freteDigitado === null && freteDoEstado !== null;
  const valorFrete = freteDigitado ?? freteDoEstado;
  const precos = precosDoPedido({ pares: nPares, frete: valorFrete });
  const faltaFrete = Boolean(precos) && !freteGratis && valorFrete === null;

  const arte = mensagemArteAprovada({ evento, obs }, modelos);
  const orcamento =
    precos && !faltaFrete ? mensagemOrcamentoFinal(precos, { estimativaUf: usaEstimativa ? uf : null }) : null;
  const confirmacao = precos && !faltaFrete ? mensagemConfirmacao(precos, forma) : null;
  const textos: Record<Aba, string | null> = { arte, orcamento, confirmacao: confirmacao?.texto ?? null };

  const semFrete = "Informe o estado ou o frete da cotação: até 35 pares o frete é do cliente.";
  const motivoVazio: Record<Aba, string> = {
    arte: "Preencha a grade de pelo menos um modelo.",
    orcamento: nPares < PEDIDO_MINIMO ? `Pedido mínimo de ${PEDIDO_MINIMO} pares.` : semFrete,
    confirmacao: nPares < PEDIDO_MINIMO ? `Pedido mínimo de ${PEDIDO_MINIMO} pares.` : semFrete,
  };

  const mudarModelo = (i: number, mudar: (m: ModeloDaGrade) => ModeloDaGrade) =>
    setModelos((lista) => lista.map((m, j) => (j === i ? mudar(m) : m)));

  const limpar = () => {
    setPares("");
    setFrete("");
    setUf("");
    setForma("pix");
    setEvento("");
    setObs("");
    setModelos([modeloVazio()]);
    setAba("arte");
  };

  const texto = textos[aba];

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Pares</span>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            className="h-8 tabular-nums"
            placeholder={grade > 0 ? `${grade} (da grade)` : "ex.: 28"}
            value={pares}
            onChange={(e) => setPares(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Estado</span>
          {/* select nativo: o da biblioteca abre no documento principal, fora da janela flutuante */}
          <select
            aria-label="Estado de entrega"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={uf}
            onChange={(e) => setUf(e.target.value)}
          >
            <option value="">UF</option>
            {Object.keys(ESTADOS).map((sigla) => (
              <option key={sigla} value={sigla}>
                {sigla}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Frete (R$)</span>
          <Input
            inputMode="decimal"
            className="h-8 tabular-nums"
            placeholder={freteGratis ? "grátis" : freteDoEstado !== null ? brl(freteDoEstado) : "cotação"}
            disabled={freteGratis}
            value={freteGratis ? "" : frete}
            onChange={(e) => setFrete(e.target.value)}
          />
        </label>
      </div>
      {usaEstimativa && (
        <p className="-mt-1 text-xs text-muted-foreground">
          Frete estimado pelo estado, a mesma tabela do robô (RS R$ 59, SC e PR R$ 89, demais R$ 119). Com a cotação
          pelo CEP, digite o valor no campo.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Forma de pagamento escolhida</span>
        <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Forma de pagamento escolhida">
          {(Object.keys(FORMAS) as FormaDePagamento[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={forma === f}
              onClick={() => setForma(f)}
              className={cn(
                "flex flex-col items-center rounded-md border px-1 py-1.5 text-xs font-medium transition-colors",
                forma === f ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {FORMAS[f].curto}
              <span className="tabular-nums text-[11px] font-normal">{precos ? brl(precoDaForma(precos, f)) : " "}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Evento (dd/mm)</span>
          <Input className="h-8" placeholder="se houver" value={evento} onChange={(e) => setEvento(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Obs.</span>
          <Input className="h-8" placeholder="brinde, caixa…" value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Grade de cada modelo (na ordem das artes)</span>
          <span className="text-xs tabular-nums text-muted-foreground">{grade} pares</span>
        </div>
        {modelos.map((m, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-md border p-2">
            <div className="flex items-center gap-1.5">
              <Input
                className="h-8"
                aria-label={`Nome do modelo ${i + 1}`}
                placeholder={modelos.length > 1 ? `ex.: MODELO PRETO (logo centralizado)` : `Modelo ${i + 1} (nome só com mais de um)`}
                value={m.nome}
                onChange={(e) => mudarModelo(i, (atual) => ({ ...atual, nome: e.target.value }))}
              />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{totalDoModelo(m)}</span>
              {modelos.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  title={`Remover o modelo ${i + 1}`}
                  onClick={() => setModelos((lista) => lista.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1">
              {GRADE_ADULTO.map((t) => (
                <CampoGrade
                  key={t}
                  tamanho={t}
                  rotulo={`Modelo ${i + 1}, adulto ${t}`}
                  valor={m.adulto[t]}
                  onChange={(q) => mudarModelo(i, (atual) => ({ ...atual, adulto: { ...atual.adulto, [t]: q } }))}
                />
              ))}
            </div>
            <div className="grid grid-cols-6 items-end gap-1">
              <span className="col-span-3 pb-2 text-[11px] text-muted-foreground">Infantil</span>
              {GRADE_INFANTIL.map((t) => (
                <CampoGrade
                  key={t}
                  tamanho={t}
                  rotulo={`Modelo ${i + 1}, infantil ${t}`}
                  valor={m.infantil[t]}
                  onChange={(q) => mudarModelo(i, (atual) => ({ ...atual, infantil: { ...atual.infantil, [t]: q } }))}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={() => setModelos((lista) => [...lista, modeloVazio()])}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar modelo
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={limpar}>
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar
          </Button>
        </div>
      </div>

      {pares.trim() && grade > 0 && grade !== nPares && (
        <p className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/15 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          A grade soma {grade} pares e o pedido está com {nPares}.
          <button type="button" className="font-semibold underline" onClick={() => setPares("")}>
            Usar {grade}
          </button>
        </p>
      )}

      <div className="flex flex-col gap-2 border-t pt-3">
        <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Mensagem">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                "rounded-md border px-1 py-1.5 text-xs font-medium transition-colors",
                aba === a.id ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        {texto ? (
          <>
            <Balao texto={texto} />
            <Button
              className={cn("hud-btn-accent h-9", copiado === aba && "tone-green hud-tone-chip")}
              onClick={(e) => {
                void copiarTexto(e, texto).then((ok) => {
                  if (!ok) return;
                  setCopiado(aba);
                  window.setTimeout(() => setCopiado(null), 1800);
                });
              }}
            >
              {copiado === aba ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado === aba ? "Copiado" : "Copiar mensagem"}
            </Button>
            {aba === "confirmacao" && confirmacao && (
              <p className="text-xs text-muted-foreground">
                Na ficha: preço do par <b className="tabular-nums text-foreground">{brl(confirmacao.precoDoPar)}</b> · valor do
                negócio no GHL <b className="tabular-nums text-foreground">{brl(confirmacao.valorDosPares)}</b> (sem frete)
              </p>
            )}
            {aba === "arte" && <p className="text-xs text-muted-foreground">Mande logo depois das imagens das artes aprovadas.</p>}
          </>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{motivoVazio[aba]}</p>
        )}
      </div>
    </div>
  );
}
