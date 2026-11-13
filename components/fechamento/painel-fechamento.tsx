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
import { Card, CardContent } from "@/components/ui/card";
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

const COR: Record<Cor, { faixa: string; texto: string; chip: string; nome: string }> = {
  vermelho: {
    faixa: "bg-red-500",
    texto: "text-red-700 dark:text-red-300",
    chip: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    nome: "esperando resposta",
  },
  laranja: {
    faixa: "bg-orange-500",
    texto: "text-orange-700 dark:text-orange-300",
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
    nome: "hoje, grátis",
  },
  amarelo: {
    faixa: "bg-amber-400",
    texto: "text-amber-700 dark:text-amber-300",
    chip: "bg-amber-400/20 text-amber-800 dark:text-amber-200 border-amber-500/30",
    nome: "hoje, por modelo",
  },
  verde: {
    faixa: "bg-emerald-500",
    texto: "text-emerald-700 dark:text-emerald-300",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    nome: "em dia",
  },
  cinza: {
    faixa: "bg-zinc-400",
    texto: "text-zinc-600 dark:text-zinc-400",
    chip: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30",
    nome: "parados",
  },
  cami: {
    faixa: "bg-sky-400",
    texto: "text-sky-700 dark:text-sky-300",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    nome: "com a Cami",
  },
};
const ORDEM_CORES: Cor[] = ["vermelho", "laranja", "amarelo", "verde", "cinza", "cami"];
const SINAL: Record<string, string> = { quente: "Quente", esfriando: "Esfriando", perdendo: "Perdendo" };

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
    w.document.body.className = "bg-background text-foreground antialiased";
    w.document.title = "Fechamento";
    w.addEventListener("pagehide", () => setPip(null));
    setPip(w);
  };

  const cards = painel?.cards ?? [];

  return (
    <div className="flex flex-1 flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl md:text-2xl">
            <Flame className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            Fechamento
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Quero aproveitar, Prioridade de Fechamento e Finalizando Venda · atualizado às {hora(painel?.atualizadoEm ?? null)}
            {painel ? ` · ${brl(painel.valorEmFechamento)} em fechamento` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={alternarSom} aria-pressed={som}>
            {som ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {som ? "Som ligado" : "Ligar som"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void abrirJanela()}>
            <PictureInPicture2 className="h-4 w-4" />
            Janela flutuante
          </Button>
          <Button variant="outline" size="sm" onClick={() => void atualizar()} disabled={atualizando}>
            {atualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      {painel && <Contagem contagem={painel.contagem} />}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : cards.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum card nas etapas do painel. Toque em Atualizar para ler o GHL.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map((card) => (
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
        className={cn("h-7 w-7", copiado && "border-emerald-500 text-emerald-600 dark:text-emerald-400")}
        title={copiado ? "Link copiado" : "Copiar o link da conversa"}
        onClick={(e) => void copiar(e)}
      >
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="default" onClick={(e) => void copiar(e)}>
      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copiado ? "Link copiado" : "Copiar link da conversa"}
    </Button>
  );
}

function Contagem({ contagem }: { contagem: Record<Cor, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ORDEM_CORES.filter((c) => contagem[c] > 0 || c === "vermelho").map((c) => (
        <Badge key={c} variant="outline" className={cn("gap-1.5 px-2.5 py-1 text-sm font-medium", COR[c].chip)}>
          <span className={cn("h-2 w-2 rounded-full", COR[c].faixa, c === "vermelho" && contagem[c] > 0 && "animate-pulse")} />
          {contagem[c]} {COR[c].nome}
        </Badge>
      ))}
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
  return (
    <Card className={cn("relative overflow-hidden py-0", alerta && "ring-2 ring-red-500/40")}>
      <div className={cn("absolute inset-y-0 left-0 w-1.5", COR[card.cor].faixa, alerta && "animate-pulse")} />
      <CardContent className="flex flex-col gap-2 py-3 pl-5 pr-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{card.nome}</span>
          <Badge variant="secondary" className="font-normal">
            {card.etapa}
          </Badge>
          {card.pares ? <span className="text-sm text-muted-foreground">{card.pares} pares</span> : null}
          {card.valor ? <span className="text-sm text-muted-foreground">· {brl(card.valor)}</span> : null}
          {card.sinal && SINAL[card.sinal] ? (
            <Badge
              variant="outline"
              className={cn(
                "font-normal",
                card.sinal === "quente" ? COR.laranja.chip : card.sinal === "perdendo" ? COR.vermelho.chip : COR.cinza.chip,
              )}
            >
              {SINAL[card.sinal]}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className={cn("font-medium", COR[card.cor].texto, card.ultimaChance && "animate-pulse")}>{card.rotulo}</span>
          {card.janelaTexto && <span className="text-xs text-muted-foreground">· {card.janelaTexto}</span>}
        </div>
        {card.ultimaMensagemCliente && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            <MessageCircle className="mr-1 inline h-3 w-3" />
            {card.ultimaMensagemCliente}
          </p>
        )}
        {(card.combinado || card.pendencia) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
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
        <div className="flex flex-wrap gap-1.5 pt-1">
          {card.linkConversa && <CopiarLink link={card.linkConversa} />}
          {card.cor !== "cami" && (
            <>
              <Button size="sm" variant="outline" onClick={onContato} disabled={ocupado}>
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Fiz contato
              </Button>
              {!card.janelaAberta && (
                <Button size="sm" variant="outline" onClick={onModelo} disabled={ocupado}>
                  <Send className="h-4 w-4" />
                  Mandar modelo
                </Button>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" disabled={ocupado}>
                    <CalendarClock className="h-4 w-4" />
                    Adiar
                  </Button>
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
            </>
          )}
          <Button size="sm" variant="ghost" onClick={onPerdido} disabled={ocupado} className="text-red-700 dark:text-red-300">
            <ThumbsDown className="h-4 w-4" />
            Perdido
          </Button>
          <Button size="sm" variant="ghost" onClick={onFechou} disabled={ocupado} className="text-emerald-700 dark:text-emerald-300">
            <BellRing className="h-4 w-4" />
            Fechou
          </Button>
        </div>
      </CardContent>
    </Card>
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
    <div className={cn("relative rounded-md border py-2 pl-3 pr-2", alerta && "ring-2 ring-red-500/40")}>
      <div className={cn("absolute inset-y-0 left-0 w-1 rounded-l-md", COR[c.cor].faixa, alerta && "animate-pulse")} />
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={alternar} title="Mostrar as ações">
          <p className="truncate text-sm font-medium">{c.nome}</p>
          <p className={cn("text-xs", COR[c.cor].texto, c.ultimaChance && "animate-pulse")}>{c.rotulo}</p>
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
                className={cn(botao, "text-red-700 dark:text-red-300")}
                disabled={ocupado}
                onClick={() => setEtapa("perdido")}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                Perdido
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn(botao, "text-emerald-700 dark:text-emerald-300")}
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

          {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
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
