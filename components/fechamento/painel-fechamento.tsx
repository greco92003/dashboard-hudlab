"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Check,
  Copy,
  Flame,
  Loader2,
  MessageCircle,
  PictureInPicture2,
  RefreshCw,
  Send,
  ThumbsDown,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Cor = "vermelho" | "laranja" | "amarelo" | "verde" | "cinza" | "cami";

interface CardDoPainel {
  oportunidadeId: string;
  contatoId: string;
  nome: string;
  etapa: string;
  pares: number | null;
  valor: number | null;
  cor: Cor;
  ultimaChance: boolean;
  rotulo: string;
  prazoEm: string | null;
  janelaAberta: boolean;
  janelaTexto: string | null;
  ultimaMensagemCliente: string | null;
  combinado: string | null;
  pendencia: string | null;
  sinal: string | null;
  linkConversa: string | null;
}

interface Painel {
  cards: CardDoPainel[];
  contagem: Record<Cor, number>;
  valorEmFechamento: number;
  atualizadoEm: string | null;
}

const MOTIVOS = ["Preço", "Frete", "Prazo", "Sumiu", "Comprou de outro", "Só pesquisando"] as const;
const POLL_MS = 60_000;

/**
 * Tons translúcidos do tema (app/hud-dashboard.css), de quente para frio:
 * rosa, magenta, violeta, verde da marca, ardósia; azul-céu para a Cami.
 */
const COR: Record<Cor, { tom: string; faixa: string; texto: string; chip: string; card: string; nome: string }> = {
  vermelho: {
    tom: "tone-rose",
    faixa: "tone-rose hud-tone-bar",
    texto: "tone-rose hud-tone-text",
    chip: "tone-rose hud-tone-chip",
    card: "tone-rose hud-tone-card",
    nome: "esperando resposta",
  },
  laranja: {
    tom: "tone-pink",
    faixa: "tone-pink hud-tone-bar",
    texto: "tone-pink hud-tone-text",
    chip: "tone-pink hud-tone-chip",
    card: "tone-pink hud-tone-card",
    nome: "hoje, grátis",
  },
  amarelo: {
    tom: "tone-violet",
    faixa: "tone-violet hud-tone-bar",
    texto: "tone-violet hud-tone-text",
    chip: "tone-violet hud-tone-chip",
    card: "tone-violet hud-tone-card",
    nome: "hoje, por modelo",
  },
  verde: {
    tom: "tone-green",
    faixa: "tone-green hud-tone-bar",
    texto: "tone-green hud-tone-text",
    chip: "tone-green hud-tone-chip",
    card: "tone-green hud-tone-card",
    nome: "em dia",
  },
  cinza: {
    tom: "tone-slate",
    faixa: "tone-slate hud-tone-bar",
    texto: "tone-slate hud-tone-text",
    chip: "tone-slate hud-tone-chip",
    card: "tone-slate hud-tone-card",
    nome: "parados",
  },
  cami: {
    tom: "tone-sky",
    faixa: "tone-sky hud-tone-bar",
    texto: "tone-sky hud-tone-text",
    chip: "tone-sky hud-tone-chip",
    card: "tone-sky hud-tone-card",
    nome: "com a Cami",
  },
};
const ORDEM_CORES: Cor[] = ["vermelho", "laranja", "amarelo", "verde", "cinza", "cami"];
const SINAL: Record<string, { nome: string; tom: string }> = {
  quente: { nome: "Quente", tom: "tone-green" },
  esfriando: { nome: "Esfriando", tom: "tone-sky" },
  perdendo: { nome: "Perdendo", tom: "tone-rose" },
};

/** Temperatura lida pela Cami, para o filtro. "sem": a Cami ainda não leu a conversa. */
type Temperatura = "quente" | "neutro" | "esfriando" | "perdendo" | "sem";
const TEMPERATURAS: { chave: Temperatura; nome: string; tom: string }[] = [
  { chave: "quente", nome: "Quente", tom: "tone-green" },
  { chave: "neutro", nome: "Neutro", tom: "tone-slate" },
  { chave: "esfriando", nome: "Esfriando", tom: "tone-sky" },
  { chave: "perdendo", nome: "Perdendo", tom: "tone-rose" },
  { chave: "sem", nome: "Sem leitura", tom: "tone-slate" },
];
const temperaturaDe = (c: CardDoPainel): Temperatura =>
  c.sinal === "quente" || c.sinal === "neutro" || c.sinal === "esfriando" || c.sinal === "perdendo" ? c.sinal : "sem";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "-";
const amanha = () => {
  const d = new Date(Date.now() + 86_400_000 - 3 * 3_600_000);
  return d.toISOString().slice(0, 10);
};

function lerPreferencia(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarPreferencia(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento local: a preferência vale só nesta visita
  }
}

/** Bipe curto (dois tons) para cliente esperando ou última chance. */
function tocarBipe(ctx: AudioContext | null) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [880, 660].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, t0 + i * 0.18);
    ganho.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.16);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(t0 + i * 0.18);
    osc.stop(t0 + i * 0.18 + 0.17);
  });
}

type DocumentPiP = { requestWindow: (o: { width: number; height: number }) => Promise<Window> };

export function PainelDeFechamento() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [som, setSom] = useState(false);
  const [pip, setPip] = useState<Window | null>(null);
  const [confirmar, setConfirmar] = useState<{ card: CardDoPainel; acao: "modelo" | "fechou" } | null>(null);
  const [perder, setPerder] = useState<CardDoPainel | null>(null);
  const [filtroCor, setFiltroCor] = useState<Cor | null>(null);
  const [filtroTemp, setFiltroTemp] = useState<Temperatura | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const alertasAntes = useRef<number | null>(null);

  useEffect(() => {
    setSom(lerPreferencia("fechamento-som") === "1");
  }, []);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/fechamento", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao carregar o painel");
      setPainel(json as Painel);
    } catch (err) {
      console.error("Painel de fechamento:", err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => void carregar(), POLL_MS);
    return () => window.clearInterval(id);
  }, [carregar]);

  // Bipe quando aumenta o número de clientes esperando ou de últimas chances.
  useEffect(() => {
    if (!painel) return;
    const alertas = painel.contagem.vermelho + painel.cards.filter((c) => c.ultimaChance).length;
    if (som && alertasAntes.current != null && alertas > alertasAntes.current) tocarBipe(audio.current);
    alertasAntes.current = alertas;
  }, [painel, som]);

  const alternarSom = () => {
    const novo = !som;
    setSom(novo);
    gravarPreferencia("fechamento-som", novo ? "1" : "0");
    if (novo) {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      tocarBipe(audio.current);
    }
  };

  const atualizar = async () => {
    setAtualizando(true);
    try {
      const res = await fetch("/api/fechamento/atualizar", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao atualizar");
      toast.success(`Painel atualizado: ${json.cards} cards${json.erros ? `, ${json.erros} com erro` : ""}`);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
    } finally {
      setAtualizando(false);
    }
  };

  /** Devolve null se deu certo, ou a mensagem de erro (a janela flutuante mostra no próprio card). */
  const agir = async (card: CardDoPainel, acao: string, extra: Record<string, string> = {}): Promise<string | null> => {
    setOcupado(card.oportunidadeId);
    try {
      const res = await fetch(`/api/fechamento/${card.oportunidadeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não deu certo");
      const msg: Record<string, string> = {
        contato: "Contato registrado",
        adiar: "Follow-up adiado",
        modelo: "Modelo de follow-up enviado",
        perdido: "Marcado como perdido",
        fechou: "Movido para Pagamento Confirmado",
      };
      toast.success(`${card.nome}: ${msg[acao] ?? "feito"}`);
      await carregar();
      return null;
    } catch (err) {
      const erro = err instanceof Error ? err.message : "Não deu certo";
      toast.error(erro);
      return erro;
    } finally {
      setOcupado(null);
    }
  };

  const abrirJanela = async () => {
    const dpip = (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture;
    if (!dpip) {
      toast.error("A janela flutuante funciona no Chrome do computador.");
      return;
    }
    if (pip) {
      pip.focus();
      return;
    }
    const w = await dpip.requestWindow({ width: 400, height: 640 });
    for (const folha of Array.from(document.styleSheets)) {
      try {
        const estilo = w.document.createElement("style");
        estilo.textContent = Array.from(folha.cssRules).map((r) => r.cssText).join("\n");
        w.document.head.appendChild(estilo);
      } catch {
        if (folha.href) {
          const link = w.document.createElement("link");
          link.rel = "stylesheet";
          link.href = folha.href;
          w.document.head.appendChild(link);
        }
      }
    }
    w.document.documentElement.className = document.documentElement.className;
    // hud-v2 leva as cores do piloto (paleta B) para a janela.
    w.document.body.className = "hud-v2 bg-background text-foreground antialiased";
    w.document.title = "Fechamento";
    w.addEventListener("pagehide", () => setPip(null));
    setPip(w);
  };

  const cards = painel?.cards ?? [];
  // Filtro cruzado: os números de cada filtro já respeitam o outro.
  const porTemperatura = filtroTemp ? cards.filter((c) => temperaturaDe(c) === filtroTemp) : cards;
  const porSituacao = filtroCor ? cards.filter((c) => c.cor === filtroCor) : cards;
  const visiveis = filtroCor ? porTemperatura.filter((c) => c.cor === filtroCor) : porTemperatura;
  const contagemCor: Record<Cor, number> = { vermelho: 0, laranja: 0, amarelo: 0, verde: 0, cinza: 0, cami: 0 };
  let valorFiltrado = 0;
  for (const c of porTemperatura) {
    contagemCor[c.cor]++;
    valorFiltrado += c.valor ?? 0;
  }
  const contagemTemp: Record<Temperatura, number> = { quente: 0, neutro: 0, esfriando: 0, perdendo: 0, sem: 0 };
  for (const c of porSituacao) contagemTemp[temperaturaDe(c)]++;
  const filtrando = filtroCor !== null || filtroTemp !== null;
  const limparFiltros = () => {
    setFiltroCor(null);
    setFiltroTemp(null);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 sm:gap-5">
      <div className="hud-v2-head">
        <div className="hud-v2-title">
          <div className="hud-v2-tile">
            <Flame />
          </div>
          <div>
            <h1>Fechamento</h1>
            <p className="hud-v2-sub">
              Quero aproveitar, Prioridade de Fechamento e Finalizando Venda · atualizado às {hora(painel?.atualizadoEm ?? null)}
            </p>
          </div>
        </div>
        <div className="hud-group" role="group" aria-label="Ações do painel">
          <button type="button" onClick={alternarSom} aria-pressed={som}>
            {som ? <Volume2 /> : <VolumeX />}
            {som ? "Som ligado" : "Ligar som"}
          </button>
          <span className="hud-group-sep" aria-hidden />
          <button type="button" onClick={() => void abrirJanela()}>
            <PictureInPicture2 />
            Janela flutuante
          </button>
          <span className="hud-group-sep" aria-hidden />
          <button type="button" onClick={() => void atualizar()} disabled={atualizando}>
            {atualizando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Atualizar
          </button>
        </div>
      </div>

      {painel && (
        <>
          <FaixaDeIndicadores
            contagem={contagemCor}
            valor={valorFiltrado}
            total={porTemperatura.length}
            filtro={filtroCor}
            onFiltro={setFiltroCor}
          />
          <BarraDeTemperatura
            contagem={contagemTemp}
            filtro={filtroTemp}
            onFiltro={setFiltroTemp}
            mostrando={visiveis.length}
            total={cards.length}
            onLimpar={filtrando ? limparFiltros : null}
          />
        </>
      )}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : cards.length === 0 ? (
        <div className="hud-panel py-10 text-center text-sm text-muted-foreground">
          Nenhum card nas etapas do painel. Toque em Atualizar para ler o GHL.
        </div>
      ) : visiveis.length === 0 ? (
        <div className="hud-panel flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
          Nenhum card com esses filtros.
          <Button variant="outline" size="sm" onClick={limparFiltros}>
            Limpar filtros
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 min-[1400px]:grid-cols-2">
          {visiveis.map((card) => (
            <CardDeFechamento
              key={card.oportunidadeId}
              card={card}
              ocupado={ocupado === card.oportunidadeId}
              onContato={() => void agir(card, "contato")}
              onAdiar={(ate) => void agir(card, "adiar", { ate })}
              onModelo={() => setConfirmar({ card, acao: "modelo" })}
              onFechou={() => setConfirmar({ card, acao: "fechou" })}
              onPerdido={() => setPerder(card)}
            />
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmar} onOpenChange={(aberto) => !aberto && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar?.acao === "modelo" ? "Mandar o modelo de follow-up?" : "Marcar como fechado?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.acao === "modelo"
                ? `${confirmar.card.nome} vai receber no WhatsApp o modelo aprovado de follow-up da Black (follow_negociacao_black_m1). A janela de 24h está fechada, então a mensagem tem custo de modelo.`
                : `O card de ${confirmar?.card.nome} vai para Pagamento Confirmado/Completar Dados e sai do painel.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmar) void agir(confirmar.card, confirmar.acao);
                setConfirmar(null);
              }}
            >
              {confirmar?.acao === "modelo" ? "Mandar modelo" : "Fechou"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!perder} onOpenChange={(aberto) => !aberto && setPerder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Por que perdemos {perder?.nome}?</DialogTitle>
            <DialogDescription>O card é marcado como perdido no GHL, com o motivo numa nota do contato.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {MOTIVOS.map((motivo) => (
              <Button
                key={motivo}
                variant="outline"
                onClick={() => {
                  if (perder) void agir(perder, "perdido", { motivo });
                  setPerder(null);
                }}
              >
                {motivo}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {pip &&
        createPortal(
          <JanelaFlutuante painel={painel} ocupado={ocupado} onAgir={agir} />,
          pip.document.body,
        )}
    </div>
  );
}

/**
 * A Schay usa usuários diferentes no dashboard e no GHL: abrir o link caía no
 * navegador sem login. O botão copia o link da conversa para ela colar onde o
 * GHL está aberto. Usa a área de transferência do documento do clique: na
 * janela flutuante, a aba de trás não está em foco e o navegador recusaria.
 */
function CopiarLink({ link, compacto = false }: { link: string; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async (evento: React.MouseEvent<HTMLButtonElement>) => {
    const doc = evento.currentTarget.ownerDocument;
    const janela = doc.defaultView ?? window;
    try {
      await janela.navigator.clipboard.writeText(link);
    } catch {
      const campo = doc.createElement("textarea");
      campo.value = link;
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      doc.body.appendChild(campo);
      campo.select();
      doc.execCommand("copy");
      campo.remove();
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  };
  if (compacto) {
    return (
      <Button
        size="icon"
        variant="outline"
        className={cn("h-7 w-7", copiado && "tone-green hud-tone-chip")}
        title={copiado ? "Link copiado" : "Copiar o link da conversa"}
        onClick={(e) => void copiar(e)}
      >
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    );
  }
  return (
    <Button size="sm" className="hud-btn-accent h-8" title="Copiar o link da conversa" onClick={(e) => void copiar(e)}>
      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copiado ? "Link copiado" : "Copiar link"}
    </Button>
  );
}

function Contagem({ contagem }: { contagem: Record<Cor, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ORDEM_CORES.filter((c) => contagem[c] > 0 || c === "vermelho").map((c) => (
        <Badge key={c} variant="outline" className={cn("gap-1.5 px-2.5 py-1 text-sm font-medium", COR[c].chip)}>
          <span className={cn("h-2 w-2 rounded-full hud-tone-dot", COR[c].tom, c === "vermelho" && contagem[c] > 0 && "hud-tone-blink")} />
          {contagem[c]} {COR[c].nome}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Faixa de indicadores do topo, que também filtra por situação: cada célula é
 * um botão (de novo para soltar) e a primeira mostra todos. Os números já
 * respeitam o filtro de temperatura, então dá para ver, por exemplo, quantos
 * quentes há em cada situação. Sempre todas as células (zero fica apagado),
 * para a posição de cada número não mudar.
 */
function FaixaDeIndicadores({
  contagem,
  valor,
  total,
  filtro,
  onFiltro,
}: {
  contagem: Record<Cor, number>;
  valor: number;
  total: number;
  filtro: Cor | null;
  onFiltro: (cor: Cor | null) => void;
}) {
  return (
    <div
      className="hud-panel hud-strip grid-cols-2 sm:grid-cols-3 xl:grid-cols-[1.4fr_repeat(6,minmax(0,1fr))]"
      role="group"
      aria-label="Filtrar por situação"
      data-filtrando={filtro ? "" : undefined}
    >
      <button
        type="button"
        className="col-span-2 sm:col-span-3 xl:col-span-1"
        aria-pressed={filtro === null}
        onClick={() => onFiltro(null)}
      >
        <span className="hud-strip-label">Em fechamento · {total} {total === 1 ? "card" : "cards"}</span>
        <span className="hud-strip-value" style={{ color: "var(--hud-accent-text)" }}>
          {brl(valor)}
        </span>
      </button>
      {ORDEM_CORES.map((c) => {
        const n = contagem[c];
        const alerta = c === "vermelho" && n > 0;
        return (
          <button
            key={c}
            type="button"
            className={COR[c].tom}
            aria-pressed={filtro === c}
            onClick={() => onFiltro(filtro === c ? null : c)}
          >
            <span className="hud-strip-label">
              <span className={cn("h-2 w-2 shrink-0 rounded-full hud-tone-dot", alerta && "hud-tone-blink")} />
              <span className="truncate" title={COR[c].nome}>{COR[c].nome.charAt(0).toUpperCase() + COR[c].nome.slice(1)}</span>
            </span>
            <span className={cn("hud-strip-value", alerta && "hud-tone-text", n === 0 && "text-muted-foreground")}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Filtro de temperatura (a leitura da Cami) e o resumo do que está na tela. */
function BarraDeTemperatura({
  contagem,
  filtro,
  onFiltro,
  mostrando,
  total,
  onLimpar,
}: {
  contagem: Record<Temperatura, number>;
  filtro: Temperatura | null;
  onFiltro: (t: Temperatura | null) => void;
  mostrando: number;
  total: number;
  onLimpar: (() => void) | null;
}) {
  const opcoes = TEMPERATURAS.filter((t) => t.chave !== "sem" || contagem.sem > 0);
  return (
    <div className="hud-panel hud-bar">
      <div className="hud-field">
        <span className="hud-field-label">Temperatura</span>
        <div className="hud-group" role="group" aria-label="Filtrar por temperatura">
          {opcoes.map((t) => (
            <button
              key={t.chave}
              type="button"
              aria-pressed={filtro === t.chave}
              className={filtro === t.chave ? undefined : cn(t.tom, "hud-tone-text")}
              onClick={() => onFiltro(filtro === t.chave ? null : t.chave)}
            >
              {t.nome}
              <span className="hud-n">{contagem[t.chave]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ml-auto flex h-9 items-center gap-2 text-sm text-muted-foreground">
        {onLimpar ? (
          <>
            <span>
              Mostrando {mostrando} de {total}
            </span>
            <Button variant="ghost" size="sm" className="h-8" onClick={onLimpar}>
              Limpar filtros
            </Button>
          </>
        ) : (
          <span>Ordem: situação, depois temperatura, depois o prazo mais antigo</span>
        )}
      </div>
    </div>
  );
}

function CardDeFechamento({
  card,
  ocupado,
  onContato,
  onAdiar,
  onModelo,
  onFechou,
  onPerdido,
}: {
  card: CardDoPainel;
  ocupado: boolean;
  onContato: () => void;
  onAdiar: (ate: string) => void;
  onModelo: () => void;
  onFechou: () => void;
  onPerdido: () => void;
}) {
  const [data, setData] = useState(amanha());
  const alerta = card.cor === "vermelho" || card.ultimaChance;
  const detalhes = [
    card.pares ? `${card.pares} pares` : null,
    card.valor ? brl(card.valor) : null,
    card.janelaTexto,
  ].filter(Boolean);
  return (
    <div className={cn("hud-fcard", COR[card.cor].tom, alerta && "hud-tone-pulse")}>
      <div className={cn("absolute inset-y-0 left-0 w-1", COR[card.cor].faixa, alerta && "hud-tone-blink")} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{card.nome}</span>
        <span className="hud-chip">{card.etapa}</span>
        {card.sinal && SINAL[card.sinal] ? (
          <span className={cn("hud-chip hud-tone-chip", SINAL[card.sinal].tom)}>{SINAL[card.sinal].nome}</span>
        ) : null}
        {card.linkConversa && (
          <span className="ml-auto">
            <CopiarLink link={card.linkConversa} />
          </span>
        )}
      </div>
      <p className={cn("text-sm font-semibold", COR[card.cor].texto, card.ultimaChance && "hud-tone-blink")}>{card.rotulo}</p>
      {detalhes.length > 0 && <p className="-mt-1 text-xs text-muted-foreground">{detalhes.join(" · ")}</p>}
      {card.ultimaMensagemCliente && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          <MessageCircle className="mr-1 inline h-3 w-3" />
          {card.ultimaMensagemCliente}
        </p>
      )}
      {(card.combinado || card.pendencia) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {card.combinado && (
            <span>
              <span className="text-muted-foreground">Combinado:</span> {card.combinado}
            </span>
          )}
          {card.pendencia && (
            <span>
              <span className="text-muted-foreground">Falta:</span> {card.pendencia}
            </span>
          )}
        </div>
      )}
      <div className="hud-fcard-actions">
        {card.cor !== "cami" && (
          <div className="hud-group" role="group" aria-label={`Ações de ${card.nome}`}>
            <button type="button" onClick={onContato} disabled={ocupado}>
              {ocupado ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Fiz contato
            </button>
            {!card.janelaAberta && (
              <>
                <span className="hud-group-sep" aria-hidden />
                <button type="button" onClick={onModelo} disabled={ocupado}>
                  <Send />
                  Mandar modelo
                </button>
              </>
            )}
            <span className="hud-group-sep" aria-hidden />
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" disabled={ocupado}>
                  <CalendarClock />
                  Adiar
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor={`adiar-${card.oportunidadeId}`}>
                    Retomar o contato em
                  </label>
                  <input
                    id={`adiar-${card.oportunidadeId}`}
                    type="date"
                    value={data}
                    min={amanha()}
                    onChange={(e) => setData(e.target.value)}
                    className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                  <Button size="sm" onClick={() => onAdiar(data)} disabled={!data}>
                    Adiar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
        <div className="hud-fcard-end">
          <Button size="sm" variant="ghost" onClick={onPerdido} disabled={ocupado} className="tone-rose hud-tone-text h-8 px-2.5">
            <ThumbsDown className="h-4 w-4" />
            Perdido
          </Button>
          <Button size="sm" variant="ghost" onClick={onFechou} disabled={ocupado} className="tone-green hud-tone-text h-8 px-2.5">
            <BellRing className="h-4 w-4" />
            Fechou
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Versão compacta para a janela flutuante (sempre por cima do GHL). Tudo é
 * feito dentro da própria janela: diálogo e popover abririam na aba de trás.
 */
function JanelaFlutuante({
  painel,
  ocupado,
  onAgir,
}: {
  painel: Painel | null;
  ocupado: string | null;
  onAgir: (c: CardDoPainel, acao: string, extra?: Record<string, string>) => Promise<string | null>;
}) {
  const [verTodos, setVerTodos] = useState(false);
  if (!painel) return <p className="p-3 text-sm text-muted-foreground">Carregando…</p>;
  const urgentes = painel.cards.filter((c) => c.cor === "vermelho" || c.cor === "laranja" || c.cor === "amarelo");
  const demais = painel.cards.filter((c) => c.cor === "verde" || c.cor === "cinza");
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Flame className="h-4 w-4 text-primary" />
          Fechamento
        </span>
        <span className="text-xs text-muted-foreground">atualizado às {hora(painel.atualizadoEm)}</span>
      </div>
      <Contagem contagem={painel.contagem} />
      <div className="flex flex-col gap-1.5 overflow-y-auto pb-2">
        {urgentes.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nada pedindo ação agora.</p>}
        {urgentes.map((c) => (
          <CardCompacto key={c.oportunidadeId} card={c} ocupado={ocupado === c.oportunidadeId} onAgir={onAgir} />
        ))}
        {demais.length > 0 && (
          <button
            type="button"
            className="mt-1 rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => setVerTodos((v) => !v)}
          >
            {verTodos ? "Esconder" : "Mostrar"} em dia e parados ({demais.length})
          </button>
        )}
        {verTodos &&
          demais.map((c) => (
            <CardCompacto key={c.oportunidadeId} card={c} ocupado={ocupado === c.oportunidadeId} onAgir={onAgir} />
          ))}
      </div>
    </div>
  );
}

type Etapa = "fechado" | "aberto" | "modelo" | "adiar" | "perdido" | "fechou";

function CardCompacto({
  card: c,
  ocupado,
  onAgir,
}: {
  card: CardDoPainel;
  ocupado: boolean;
  onAgir: (c: CardDoPainel, acao: string, extra?: Record<string, string>) => Promise<string | null>;
}) {
  const [etapa, setEtapa] = useState<Etapa>("fechado");
  const [data, setData] = useState(amanha());
  const [erro, setErro] = useState<string | null>(null);
  const alerta = c.cor === "vermelho" || c.ultimaChance;
  const alternar = () => setEtapa((e) => (e === "fechado" ? "aberto" : "fechado"));

  const fazer = async (acao: string, extra?: Record<string, string>) => {
    setErro(null);
    const falha = await onAgir(c, acao, extra);
    if (falha) setErro(falha);
    else setEtapa("fechado");
  };

  const botao = "h-7 px-2 text-xs";
  return (
    <div className={cn("relative overflow-hidden rounded-lg border py-2 pl-3 pr-2", COR[c.cor].card, alerta && "hud-tone-pulse")}>
      <div className={cn("absolute inset-y-0 left-0 w-1", COR[c.cor].faixa, alerta && "hud-tone-blink")} />
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={alternar} title="Mostrar as ações">
          <p className="truncate text-sm font-medium">{c.nome}</p>
          <p className={cn("text-xs", COR[c.cor].texto, c.ultimaChance && "hud-tone-blink")}>{c.rotulo}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {c.etapa}
            {c.pares ? ` · ${c.pares} pares` : ""}
            {c.janelaTexto ? ` · ${c.janelaTexto}` : ""}
          </p>
        </button>
        <div className="flex shrink-0 gap-1">
          {c.linkConversa && <CopiarLink link={c.linkConversa} compacto />}
          <Button size="sm" variant={etapa === "fechado" ? "outline" : "secondary"} className={botao} onClick={alternar}>
            Ações
          </Button>
        </div>
      </div>

      {etapa !== "fechado" && (
        <div className="mt-2 flex flex-col gap-2 border-t pt-2">
          {(c.combinado || c.pendencia || c.ultimaMensagemCliente) && (
            <div className="flex flex-col gap-0.5 text-[11px]">
              {c.ultimaMensagemCliente && (
                <p className="line-clamp-2 text-muted-foreground">
                  <MessageCircle className="mr-1 inline h-3 w-3" />
                  {c.ultimaMensagemCliente}
                </p>
              )}
              {c.combinado && (
                <p>
                  <span className="text-muted-foreground">Combinado:</span> {c.combinado}
                </p>
              )}
              {c.pendencia && (
                <p>
                  <span className="text-muted-foreground">Falta:</span> {c.pendencia}
                </p>
              )}
            </div>
          )}

          {etapa === "aberto" && (
            <div className="flex flex-wrap gap-1">
              {c.cor !== "vermelho" && (
                <Button size="sm" variant="outline" className={botao} disabled={ocupado} onClick={() => void fazer("contato")}>
                  {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Fiz contato
                </Button>
              )}
              {!c.janelaAberta && (
                <Button size="sm" variant="outline" className={botao} disabled={ocupado} onClick={() => setEtapa("modelo")}>
                  <Send className="h-3.5 w-3.5" />
                  Mandar modelo
                </Button>
              )}
              <Button size="sm" variant="outline" className={botao} disabled={ocupado} onClick={() => setEtapa("adiar")}>
                <CalendarClock className="h-3.5 w-3.5" />
                Adiar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn(botao, "tone-rose hud-tone-text")}
                disabled={ocupado}
                onClick={() => setEtapa("perdido")}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                Perdido
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn(botao, "tone-green hud-tone-text")}
                disabled={ocupado}
                onClick={() => setEtapa("fechou")}
              >
                <BellRing className="h-3.5 w-3.5" />
                Fechou
              </Button>
            </div>
          )}

          {etapa === "modelo" && (
            <Confirmacao
              texto={`Mandar para ${c.nome} o modelo de follow-up da Black? A janela está fechada, então tem custo de modelo.`}
              acao="Mandar modelo"
              ocupado={ocupado}
              onSim={() => void fazer("modelo")}
              onNao={() => setEtapa("aberto")}
            />
          )}

          {etapa === "fechou" && (
            <Confirmacao
              texto={`Mover ${c.nome} para Pagamento Confirmado/Completar Dados? O card sai do painel.`}
              acao="Fechou"
              ocupado={ocupado}
              onSim={() => void fazer("fechou")}
              onNao={() => setEtapa("aberto")}
            />
          )}

          {etapa === "adiar" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs">Retomar em</span>
              <input
                type="date"
                value={data}
                min={amanha()}
                onChange={(e) => setData(e.target.value)}
                className="h-7 rounded-md border bg-background px-1.5 text-xs"
              />
              <Button size="sm" className={botao} disabled={ocupado || !data} onClick={() => void fazer("adiar", { ate: data })}>
                Adiar
              </Button>
              <Button size="sm" variant="ghost" className={botao} onClick={() => setEtapa("aberto")}>
                Voltar
              </Button>
            </div>
          )}

          {etapa === "perdido" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs">Por que perdemos?</span>
              <div className="grid grid-cols-2 gap-1">
                {MOTIVOS.map((motivo) => (
                  <Button
                    key={motivo}
                    size="sm"
                    variant="outline"
                    className={botao}
                    disabled={ocupado}
                    onClick={() => void fazer("perdido", { motivo })}
                  >
                    {motivo}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="ghost" className={cn(botao, "self-start")} onClick={() => setEtapa("aberto")}>
                Voltar
              </Button>
            </div>
          )}

          {erro && <p className="tone-rose hud-tone-text text-xs">{erro}</p>}
        </div>
      )}
    </div>
  );
}

function Confirmacao({
  texto,
  acao,
  ocupado,
  onSim,
  onNao,
}: {
  texto: string;
  acao: string;
  ocupado: boolean;
  onSim: () => void;
  onNao: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs">{texto}</p>
      <div className="flex gap-1">
        <Button size="sm" className="h-7 px-2 text-xs" disabled={ocupado} onClick={onSim}>
          {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {acao}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onNao}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
