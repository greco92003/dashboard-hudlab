"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, Loader2, Plus, RotateCcw, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { brl } from "@/lib/ghl/orcamento-black/calc";
import type { OpcaoDeFrete } from "@/lib/ghl/ficha-pedido/frete";
import {
  ESTADOS,
  FORMAS,
  GRADE_ADULTO,
  GRADE_INFANTIL,
  PEDIDO_MINIMO,
  freteDaAba,
  freteExato,
  lerValor,
  mensagemArteAprovada,
  mensagemConfirmacao,
  mensagemOrcamentoFinal,
  precoDaForma,
  hudFridayNoAr,
  precosDoPedido,
  totalDaGrade,
  totalDoModelo,
  type FormaDePagamento,
  type ModeloDaGrade,
  type OrigemDoFrete,
} from "@/lib/fechamento/mensagens";

const FRETE_GRATIS_A_PARTIR = 36;

/** Os passos na ordem da conversa: orçamento, arte aprovada e pedido confirmado. */
export type Passo = "orcamento" | "arte" | "confirmacao";
const PASSOS: { id: Passo; rotulo: string }[] = [
  { id: "orcamento", rotulo: "Orçamento" },
  { id: "arte", rotulo: "Arte aprovada" },
  { id: "confirmacao", rotulo: "Pedido confirmado" },
];

export interface Rascunho {
  pares: string;
  uf: string;
  cep: string;
  freteCombinado: string;
  /** Transportadora escolhida na cotação pelo CEP; null = a mais barata. */
  transportadora: string | null;
  forma: FormaDePagamento;
  /** Hud Friday ligada para esse cliente (só vale na sexta, 27/11). */
  hudFriday: boolean;
  evento: string;
  obs: string;
  modelos: ModeloDaGrade[];
  passo: Passo;
  /** Texto copiado em cada passo: o ✓ some quando a mensagem muda depois de copiada. */
  copiados: Partial<Record<Passo, string>>;
}

const modeloVazio = (): ModeloDaGrade => ({ nome: "", adulto: {}, infantil: {} });
const rascunhoVazio = (): Rascunho => ({
  pares: "",
  uf: "",
  cep: "",
  freteCombinado: "",
  transportadora: null,
  forma: "pix",
  hudFriday: false,
  evento: "",
  obs: "",
  modelos: [modeloVazio()],
  passo: "orcamento",
  copiados: {},
});
const formatarCep = (digitos: string) => (digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos);

export interface ClienteDasMensagens {
  oportunidadeId: string;
  nome: string;
  /** Lendo CEP e estado do cadastro no GHL. */
  buscando: boolean;
}

const LIVRE = "livre";

/**
 * Rascunhos das mensagens, um por cliente (e um livre), guardados no painel:
 * o diálogo e a janela flutuante mostram o mesmo, e trocar de cliente não
 * mistura a grade de um com a do outro.
 */
export function useMensagensDoFechamento() {
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [cliente, setCliente] = useState<ClienteDasMensagens | null>(null);
  // O que o card e o cadastro trouxeram: o "Novo atendimento" volta para isso.
  const bases = useRef<Record<string, Partial<Rascunho>>>({});

  const chave = cliente?.oportunidadeId ?? LIVRE;
  const rascunho = rascunhos[chave] ?? rascunhoVazio();

  const mudarDe = useCallback((alvo: string, mudanca: (r: Rascunho) => Partial<Rascunho>) => {
    setRascunhos((todos) => {
      const atual = todos[alvo] ?? rascunhoVazio();
      return { ...todos, [alvo]: { ...atual, ...mudanca(atual) } };
    });
  }, []);
  const mudar = useCallback(
    (mudanca: Partial<Rascunho> | ((r: Rascunho) => Partial<Rascunho>)) =>
      mudarDe(chave, typeof mudanca === "function" ? mudanca : () => mudanca),
    [chave, mudarDe],
  );

  const abrirCliente = useCallback(
    (card: { oportunidadeId: string; nome: string; pares: number | null; hudFriday?: string | null }) => {
      const id = card.oportunidadeId;
      if (rascunhos[id]) {
        setCliente({ oportunidadeId: id, nome: card.nome, buscando: false });
        return;
      }
      // Quem recebeu o disparo da Hud Friday já abre com a chave ligada.
      const base: Partial<Rascunho> = { pares: card.pares ? String(card.pares) : "", hudFriday: Boolean(card.hudFriday) };
      bases.current[id] = base;
      setRascunhos((todos) => ({ ...todos, [id]: { ...rascunhoVazio(), ...base } }));
      setCliente({ oportunidadeId: id, nome: card.nome, buscando: true });
      void (async () => {
        try {
          const resposta = await fetch(`/api/fechamento/${id}/cliente`, { cache: "no-store" });
          const dados = (await resposta.json()) as { cep?: string | null; uf?: string | null; pares?: number | null };
          if (!resposta.ok) return;
          const doCadastro: Partial<Rascunho> = {
            ...base,
            pares: base.pares || (dados.pares ? String(dados.pares) : ""),
            cep: dados.cep ? formatarCep(dados.cep) : "",
            uf: dados.uf ?? "",
          };
          bases.current[id] = doCadastro;
          // Só preenche o que a Schay ainda não digitou.
          mudarDe(id, (r) => ({
            pares: r.pares || doCadastro.pares || "",
            cep: r.cep || doCadastro.cep || "",
            uf: r.uf || doCadastro.uf || "",
          }));
        } catch {
          // Sem o cadastro, a aba segue em branco para digitar.
        } finally {
          setCliente((atual) => (atual?.oportunidadeId === id ? { ...atual, buscando: false } : atual));
        }
      })();
    },
    [rascunhos, mudarDe],
  );

  const novoAtendimento = useCallback(() => {
    setRascunhos((todos) => ({ ...todos, [chave]: { ...rascunhoVazio(), ...(bases.current[chave] ?? {}) } }));
  }, [chave]);

  const sairDoCliente = useCallback(() => setCliente(null), []);

  return { chave, cliente, rascunho, mudar, abrirCliente, novoAtendimento, sairDoCliente };
}

export type EstadoDasMensagens = ReturnType<typeof useMensagensDoFechamento>;

/** Cotações já feitas nesta página (CEP e pares): voltar a um cliente não recota nem pisca a estimativa. */
const COTACOES_DA_SESSAO = new Map<string, { opcoes: OpcaoDeFrete[]; uf: string | null }>();

type Cotacao =
  | { status: "vazia" }
  | { status: "cotando" }
  | { status: "cotada"; opcoes: OpcaoDeFrete[] }
  | { status: "erro"; mensagem: string };

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

const SELO_OK = "tone-green hud-tone-chip";
const SELO_ALERTA = "bg-amber-500/15 text-amber-800 dark:text-amber-300";

function Selo({ tom, children }: { tom: "ok" | "alerta"; children: React.ReactNode }) {
  return (
    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide", tom === "ok" ? SELO_OK : SELO_ALERTA)}>
      {children}
    </span>
  );
}

/** Qual frete está valendo e de onde ele veio: a prioridade entre estado, CEP e valor combinado fica à vista. */
function FreteUsado({
  origem,
  valor,
  uf,
  transportadora,
}: {
  origem: OrigemDoFrete | null;
  valor: number | null;
  uf: string;
  transportadora: string | null;
}) {
  const linha = "flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs";
  if (origem === "gratis")
    return (
      <div className={linha}>
        <Selo tom="ok">GRÁTIS</Selo>
        <span>36 pares ou mais: frete por conta da Hud.</span>
      </div>
    );
  if (origem === null || valor === null)
    return (
      <div className={cn(linha, "text-muted-foreground")}>
        <span>Falta o frete: escolha o estado (estimativa) ou informe o CEP (valor exato).</span>
      </div>
    );
  if (origem === "estado")
    return (
      <div className={linha}>
        <Selo tom="alerta">ESTIMADO</Selo>
        <span>
          <b className="tabular-nums">{brl(valor)}</b> pela tabela do robô para {uf}. Para fechar o pedido, informe o CEP.
        </span>
      </div>
    );
  return (
    <div className={linha}>
      <Selo tom="ok">{origem === "cep" ? "EXATO" : "COMBINADO"}</Selo>
      <span>
        <b className="tabular-nums">{brl(valor)}</b> {origem === "cep" ? `· ${transportadora ?? "transportadora"}, pelo CEP` : "· valor digitado"}
      </span>
    </div>
  );
}

/**
 * Auxiliar do vendedor no chat, em três passos na ordem da conversa:
 * 1. Orçamento (atendimento: pode sair com frete estimado pelo estado);
 * 2. Arte aprovada (a grade de cada modelo, que define os pares);
 * 3. Pedido confirmado (fechamento: só com frete exato). É a condição final
 *    que a Cami lê para montar a ficha do pedido.
 */
export function MensagensDoFechamento({ estado }: { estado: EstadoDasMensagens }) {
  const { chave, cliente, rascunho: r, mudar, novoAtendimento, sairDoCliente } = estado;
  const [cotacao, setCotacao] = useState<Cotacao>({ status: "vazia" });
  const [copiadoAgora, setCopiadoAgora] = useState(false);

  const grade = totalDaGrade(r.modelos);
  const paresDigitados = r.pares.trim() ? Math.trunc(Number(r.pares) || 0) : null;
  // Sem pares digitados, o pedido segue a soma da grade.
  const nPares = paresDigitados ?? grade;
  const divergente = paresDigitados !== null && grade > 0 && grade !== paresDigitados;
  const freteGratis = nPares >= FRETE_GRATIS_A_PARTIR;
  const digitosDoCep = r.cep.replace(/\D/g, "");

  // Com CEP completo e até 35 pares, cota o frete real (mesma cotação da ficha e da Cami).
  useEffect(() => {
    if (digitosDoCep.length !== 8 || nPares < PEDIDO_MINIMO || nPares >= FRETE_GRATIS_A_PARTIR) {
      setCotacao({ status: "vazia" });
      return;
    }
    const chaveDaCotacao = `${digitosDoCep}:${nPares}`;
    const guardada = COTACOES_DA_SESSAO.get(chaveDaCotacao);
    if (guardada) {
      setCotacao({ status: "cotada", opcoes: guardada.opcoes });
      if (guardada.uf) mudar({ uf: guardada.uf });
      return;
    }
    const controle = new AbortController();
    const espera = window.setTimeout(async () => {
      setCotacao({ status: "cotando" });
      const valorNf = Math.round(precosDoPedido({ pares: nPares, frete: 0 }, Date.now(), { hudFriday: r.hudFriday })?.subtotalCartao ?? 0);
      try {
        const resposta = await fetch(`/api/fechamento/frete?cep=${digitosDoCep}&pares=${nPares}&valor=${valorNf}`, {
          signal: controle.signal,
          cache: "no-store",
        });
        const dados = (await resposta.json()) as { opcoes?: OpcaoDeFrete[]; avisos?: string[]; uf?: string | null; error?: string };
        if (!resposta.ok) throw new Error(dados.error ?? "falha na cotação");
        const opcoes = dados.opcoes ?? [];
        const ufDoCep = dados.uf?.toUpperCase() ?? null;
        if (opcoes.length > 0) COTACOES_DA_SESSAO.set(chaveDaCotacao, { opcoes, uf: ufDoCep && ESTADOS[ufDoCep] ? ufDoCep : null });
        setCotacao(
          opcoes.length > 0 ? { status: "cotada", opcoes } : { status: "erro", mensagem: dados.avisos?.[0] ?? "Sem cotação para esse CEP." },
        );
        // O CEP diz o estado com certeza: corrige a UF escolhida.
        if (ufDoCep && ESTADOS[ufDoCep]) mudar({ uf: ufDoCep });
      } catch (erro) {
        if (controle.signal.aborted) return;
        setCotacao({ status: "erro", mensagem: erro instanceof Error ? erro.message : "falha na cotação" });
      }
    }, 500);
    return () => {
      controle.abort();
      window.clearTimeout(espera);
    };
    // `mudar` só muda quando muda o cliente: a correção da UF vai para o rascunho certo.
  }, [digitosDoCep, nPares, mudar, r.hudFriday]);

  const opcaoCotada =
    cotacao.status === "cotada" ? (cotacao.opcoes.find((o) => o.transportadora === r.transportadora) ?? cotacao.opcoes[0]) : null;
  // Prioridade: frete combinado (digitado), depois a cotação pelo CEP, depois a estimativa pelo estado.
  const frete = freteDaAba({ pares: nPares, digitado: lerValor(r.freteCombinado), cotadoCep: opcaoCotada?.total ?? null, uf: r.uf });
  const sextaHudFriday = hudFridayNoAr(Date.now());
  const precos = precosDoPedido({ pares: nPares, frete: frete.valor }, Date.now(), { hudFriday: r.hudFriday });
  const exato = freteExato(frete.origem);

  const orcamento =
    precos && frete.valor !== null ? mensagemOrcamentoFinal(precos, { estimativaUf: frete.origem === "estado" ? r.uf : null }) : null;
  const arte = mensagemArteAprovada({ evento: r.evento, obs: r.obs }, r.modelos);
  const confirmacao = precos && exato && !divergente ? mensagemConfirmacao(precos, r.forma) : null;
  const textos: Record<Passo, string | null> = { orcamento, arte, confirmacao: confirmacao?.texto ?? null };

  const situacao = (p: Passo): "nada" | "ok" | "mudou" => {
    const copiado = r.copiados[p];
    if (!copiado) return "nada";
    return copiado === textos[p] ? "ok" : "mudou";
  };

  const irPara = (passo: Passo) => {
    setCopiadoAgora(false);
    mudar({ passo });
  };
  const mudarModelo = (i: number, mudanca: (m: ModeloDaGrade) => ModeloDaGrade) =>
    mudar((atual) => ({ modelos: atual.modelos.map((m, j) => (j === i ? mudanca(m) : m)) }));

  const passo = r.passo;
  const texto = textos[passo];
  const indice = PASSOS.findIndex((p) => p.id === passo);
  const proximo = PASSOS[indice + 1] ?? null;
  const usarGrade = (
    <button type="button" className="font-semibold underline" onClick={() => mudar({ pares: "" })}>
      Usar {grade} pares
    </button>
  );

  const minimo = nPares === 0 ? "Informe os pares do pedido." : `Pedido mínimo de ${PEDIDO_MINIMO} pares.`;
  let bloqueio: React.ReactNode = null;
  if (!texto) {
    if (passo === "arte") bloqueio = "Preencha a grade de pelo menos um modelo.";
    else if (nPares < PEDIDO_MINIMO) bloqueio = minimo;
    else if (passo === "confirmacao" && divergente)
      bloqueio = (
        <>
          A grade soma {grade} pares e o pedido está com {paresDigitados}. Acerte antes de confirmar: {usarGrade}
        </>
      );
    else if (passo === "confirmacao" && frete.origem === "estado")
      bloqueio = (
        <>
          O frete ainda é estimado pelo estado. Para confirmar o pedido, informe o CEP do cliente ou o frete combinado.{" "}
          <button type="button" className="font-semibold underline" onClick={() => irPara("orcamento")}>
            Ir para o orçamento
          </button>
        </>
      );
    else if (passo === "confirmacao") bloqueio = "Falta o frete: informe o CEP ou o frete combinado no passo 1.";
    else bloqueio = "Falta o frete: escolha o estado ou informe o CEP.";
  }

  const resumoDoFrete =
    frete.origem === "gratis"
      ? "frete grátis"
      : frete.valor !== null
        ? `frete ${brl(frete.valor)} ${frete.origem === "estado" ? "(estimado)" : "(exato)"}`
        : "sem frete";

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        {cliente ? (
          <div className="flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate font-medium">{cliente.nome}</span>
            {cliente.buscando && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-label="Lendo o cadastro" />}
            <button
              type="button"
              className="shrink-0 rounded text-muted-foreground hover:text-foreground"
              title="Sair deste cliente (o que foi preenchido fica guardado)"
              aria-label="Sair deste cliente"
              onClick={sairDoCliente}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="truncate text-xs text-muted-foreground" title="Abra pelo botão Mensagens de um card para preencher pares, CEP e estado sozinho">
            Sem cliente · preenchimento livre
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
          title="Apaga o que foi preenchido e começa de novo"
          onClick={() => {
            setCopiadoAgora(false);
            novoAtendimento();
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Novo atendimento
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Passos do fechamento">
        {PASSOS.map((p, i) => {
          const s = situacao(p.id);
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={passo === p.id}
              onClick={() => irPara(p.id)}
              title={s === "ok" ? "Copiada" : s === "mudou" ? "Mudou depois de copiar: copie de novo" : undefined}
              className={cn(
                "flex items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-xs font-medium leading-tight transition-colors",
                passo === p.id ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="tabular-nums">{i + 1}.</span>
              <span>{p.rotulo}</span>
              {s === "ok" && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
              {s === "mudou" && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
            </button>
          );
        })}
      </div>

      {passo !== "orcamento" && nPares > 0 && (
        <p className="-mt-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{nPares}</span> pares · {resumoDoFrete}
          {precos ? (
            <>
              {" "}
              · Pix <span className="tabular-nums">{brl(precos.parPix)}</span> · Cartão{" "}
              <span className="tabular-nums">{brl(precos.parCartao)}</span>
            </>
          ) : null}
        </p>
      )}

      {sextaHudFriday && (
        <button
          type="button"
          role="switch"
          aria-checked={r.hudFriday}
          onClick={() => mudar({ hudFriday: !r.hudFriday })}
          className={cn(
            "flex items-center justify-between rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
            r.hudFriday ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <span>⚡ Hud Friday: 20% no Pix e 15% no cartão</span>
          <span>{r.hudFriday ? "ligada" : "desligada"}</span>
        </button>
      )}

      {passo === "orcamento" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Pares</span>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                className="h-8 tabular-nums"
                placeholder={grade > 0 ? `${grade} (grade)` : "ex.: 30"}
                value={r.pares}
                onChange={(e) => mudar({ pares: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Estado</span>
              {/*
                select nativo: o da biblioteca abre no documento principal, fora da janela flutuante.
                A lista é desenhada pelo navegador: sem color-scheme escuro e cores explícitas nas
                opções, ela abria clara com o texto claro do tema e as siglas sumiam.
              */}
              <select
                aria-label="Estado de entrega"
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50 dark:[color-scheme:dark]"
                disabled={freteGratis}
                value={r.uf}
                onChange={(e) => mudar({ uf: e.target.value })}
              >
                <option value="" className="bg-background text-muted-foreground">
                  UF
                </option>
                {Object.keys(ESTADOS).map((sigla) => (
                  <option key={sigla} value={sigla} className="bg-background text-foreground">
                    {sigla}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">CEP</span>
              <Input
                inputMode="numeric"
                className="h-8 tabular-nums"
                placeholder={freteGratis ? "grátis" : "opcional"}
                disabled={freteGratis}
                value={freteGratis ? "" : r.cep}
                onChange={(e) => mudar({ cep: e.target.value.replace(/[^\d-]/g, "").slice(0, 9) })}
              />
            </label>
          </div>
          {divergente && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-amber-500/15 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
              A grade soma {grade} pares. {usarGrade}
            </p>
          )}

          {cotacao.status === "cotando" && <p className="text-xs text-muted-foreground">Cotando o frete pelo CEP…</p>}
          {cotacao.status === "cotada" && cotacao.opcoes.length > 1 && (
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Transportadora">
              {cotacao.opcoes.slice(0, 4).map((o, i) => (
                <button
                  key={`${o.transportadora}-${i}`}
                  type="button"
                  role="radio"
                  aria-checked={opcaoCotada === o}
                  onClick={() => mudar({ transportadora: o.transportadora })}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    opcaoCotada === o ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {o.transportadora} · <span className="tabular-nums">{brl(o.total)}</span>
                </button>
              ))}
            </div>
          )}
          {cotacao.status === "erro" && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {cotacao.mensagem}
              {frete.origem === "estado" ? " Segue a estimativa pelo estado." : ""}
            </p>
          )}

          {nPares >= PEDIDO_MINIMO && frete.origem !== null && (
            <FreteUsado origem={frete.origem} valor={frete.valor} uf={r.uf} transportadora={opcaoCotada?.transportadora ?? null} />
          )}

          {!freteGratis && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Outro frete combinado (R$)</span>
              <Input
                inputMode="decimal"
                className="h-7 w-24 tabular-nums"
                placeholder="se houver"
                value={r.freteCombinado}
                onChange={(e) => mudar({ freteCombinado: e.target.value })}
              />
            </label>
          )}
          {frete.origem === "digitado" && opcaoCotada && (
            <p className="-mt-1 text-xs text-muted-foreground">Vale o frete combinado; apague o valor para usar a cotação do CEP.</p>
          )}
        </div>
      )}

      {passo === "arte" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Grade de cada modelo (na ordem das artes)</span>
            <span className="text-xs tabular-nums text-muted-foreground">{grade} pares</span>
          </div>
          {r.modelos.map((m, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-md border p-2">
              <div className="flex items-center gap-1.5">
                <Input
                  className="h-8"
                  aria-label={`Nome do modelo ${i + 1}`}
                  placeholder={r.modelos.length > 1 ? "ex.: MODELO PRETO (logo centralizado)" : `Modelo ${i + 1} (nome só com mais de um)`}
                  value={m.nome}
                  onChange={(e) => mudarModelo(i, (atual) => ({ ...atual, nome: e.target.value }))}
                />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{totalDoModelo(m)}</span>
                {r.modelos.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    title={`Remover o modelo ${i + 1}`}
                    onClick={() => mudar((atual) => ({ modelos: atual.modelos.filter((_, j) => j !== i) }))}
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
          <Button
            size="sm"
            variant="outline"
            className="h-8 self-start"
            onClick={() => mudar((atual) => ({ modelos: [...atual.modelos, modeloVazio()] }))}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar modelo
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Evento (dd/mm)</span>
              <Input className="h-8" placeholder="se houver" value={r.evento} onChange={(e) => mudar({ evento: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Obs.</span>
              <Input className="h-8" placeholder="brinde, caixa…" value={r.obs} onChange={(e) => mudar({ obs: e.target.value })} />
            </label>
          </div>
          {divergente && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-amber-500/15 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
              A grade soma {grade} pares e o orçamento foi de {paresDigitados}. {usarGrade}
            </p>
          )}
        </div>
      )}

      {passo === "confirmacao" && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Forma que o cliente escolheu</span>
          <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Forma que o cliente escolheu">
            {(Object.keys(FORMAS) as FormaDePagamento[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={r.forma === f}
                onClick={() => mudar({ forma: f })}
                className={cn(
                  "flex flex-col items-center rounded-md border px-1 py-1.5 text-xs font-medium transition-colors",
                  r.forma === f ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {FORMAS[f].curto}
                <span className="tabular-nums text-[11px] font-normal">{precos ? brl(precoDaForma(precos, f)) : " "}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t pt-3">
        {texto ? (
          <>
            <Balao texto={texto} />
            <Button
              className={cn("hud-btn-accent h-9", copiadoAgora && situacao(passo) === "ok" && "tone-green hud-tone-chip")}
              onClick={(e) => {
                void copiarTexto(e, texto).then((ok) => {
                  if (!ok) return;
                  mudar((atual) => ({ copiados: { ...atual.copiados, [passo]: texto } }));
                  setCopiadoAgora(true);
                  window.setTimeout(() => setCopiadoAgora(false), 1800);
                });
              }}
            >
              {copiadoAgora && situacao(passo) === "ok" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiadoAgora && situacao(passo) === "ok"
                ? "Copiado"
                : passo === "orcamento"
                  ? "Copiar orçamento"
                  : passo === "arte"
                    ? "Copiar arte aprovada"
                    : "Copiar confirmação"}
            </Button>
            {passo === "orcamento" && frete.origem === "estado" && (
              <p className="text-xs text-muted-foreground">
                Pode mandar como estimativa. A confirmação do pedido só sai com o frete exato (CEP ou combinado).
              </p>
            )}
            {passo === "arte" && <p className="text-xs text-muted-foreground">Mande logo depois das imagens das artes aprovadas.</p>}
            {passo === "confirmacao" && confirmacao && (
              <p className="text-xs text-muted-foreground">
                Na ficha: preço do par <b className="tabular-nums text-foreground">{brl(confirmacao.precoDoPar)}</b> · valor do
                negócio no GHL <b className="tabular-nums text-foreground">{brl(confirmacao.valorDosPares)}</b> (sem frete)
              </p>
            )}
            {situacao(passo) === "mudou" && (
              <p className="text-xs text-amber-800 dark:text-amber-300">A mensagem mudou depois de copiada: copie de novo.</p>
            )}
            {situacao(passo) === "ok" &&
              (proximo ? (
                <Button size="sm" variant="ghost" className="h-8 self-end text-xs" onClick={() => irPara(proximo.id)}>
                  Próximo: {indice + 2}. {proximo.rotulo}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Pronto. Quando o comprovante chegar, toque em Fechou no card.
                </p>
              ))}
          </>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{bloqueio}</p>
        )}
      </div>
    </div>
  );
}
