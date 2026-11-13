"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, ChevronRight, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderDocumentButtons } from "@/components/erp/order-document-buttons";
import { TipoPedidoBadge } from "@/components/programacao/tipo-pedido-badge";
import { isEtapaConcluivel } from "@/lib/ghl/programacao-stages";
import { formatDate } from "@/lib/programacao/board-dates";
import type { BoardDeal, BoardGroup } from "@/lib/programacao/board-types";
import { rotuloDoDia, somaDePares, statusCurto, tomDoGrupo } from "@/lib/producao/dias";
import { cn } from "@/lib/utils";

/**
 * Peças do Painel Produção (chão de fábrica). Um pedido é uma linha: tipo, nome,
 * pares, etapa e o status do embarque; tocar abre os detalhes e os botões.
 * - Celular: lista por dia, a linha abre ali mesmo.
 * - Tablet deitado: lista à esquerda, o pedido tocado abre no painel à direita.
 * - Computador e TV: as mesmas linhas, em colunas por dia.
 * O visual está em app/hud-dashboard.css (classes prod-*).
 */

/** Media query reativa, sem piscar na hidratação (no servidor vale false). */
export function useMidia(query: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Talão, Romaneio e Concluir (este pede o PIN no diálogo). */
export function AcoesPedido({
  deal,
  onConcluir,
  grande = false,
}: {
  deal: BoardDeal;
  onConcluir: (deal: BoardDeal) => void;
  grande?: boolean;
}) {
  return (
    <div className="grid gap-2" onClick={(e) => e.stopPropagation()}>
      <OrderDocumentButtons
        baseHref={`/api/producao/documentos/${encodeURIComponent(deal.id)}`}
        talaoLabel="Talão"
        size="default"
        rotulos="sempre"
        className="grid grid-cols-2"
        buttonClassName={cn("w-full", grande ? "h-12 text-base" : "h-11 text-sm")}
      />
      <Button
        className={cn("hud-btn-accent w-full font-semibold", grande ? "h-14 text-lg" : "h-12 text-base")}
        onClick={() => onConcluir(deal)}
      >
        <PackageCheck className="h-5 w-5" />
        Concluir
      </Button>
    </div>
  );
}

function DadosDoPedido({ deal }: { deal: BoardDeal }) {
  return (
    <dl className="prod-kv">
      <dt>Embarque</dt>
      <dd>{deal.dataEmbarque ? formatDate(deal.dataEmbarque) : "Sem data"}</dd>
      {deal.vendedor && (
        <>
          <dt>Vendedor</dt>
          <dd>{deal.vendedor}</dd>
        </>
      )}
      {deal.designer && (
        <>
          <dt>Designer</dt>
          <dd>{deal.designer}</dd>
        </>
      )}
    </dl>
  );
}

/** Linha do pedido. Com children, tocar abre os detalhes logo abaixo. */
export function PedidoLinha({
  deal,
  concluido = false,
  aberto = false,
  selecionado = false,
  seta = "expandir",
  onToque,
  children,
}: {
  deal: BoardDeal;
  concluido?: boolean;
  aberto?: boolean;
  selecionado?: boolean;
  /** "abrir": o detalhe abre noutro lugar (painel do tablet). */
  seta?: "expandir" | "abrir";
  onToque?: () => void;
  children?: ReactNode;
}) {
  const status = statusCurto(deal.dataEmbarque, concluido);
  const naMaquina = isEtapaConcluivel(deal.stageTitle);
  const Seta = seta === "abrir" ? ChevronRight : ChevronDown;
  return (
    <div
      className={cn("prod-linha", status.tom)}
      data-aberto={aberto || undefined}
      data-selecionado={selecionado || undefined}
    >
      <button
        type="button"
        className="prod-linha-topo"
        onClick={onToque}
        aria-expanded={seta === "expandir" ? aberto : undefined}
      >
        <span className="prod-linha-nome">
          <TipoPedidoBadge tipo={deal.tipoPedido} />
          <span className="truncate">{deal.title}</span>
        </span>
        <span className="prod-linha-meta">
          {deal.quantidadePares && <span>{deal.quantidadePares} pares</span>}
          {deal.stageTitle && (
            <span className={cn("prod-etapa hud-tone-chip", naMaquina ? "tone-green" : "tone-sky")}>
              {deal.stageTitle}
            </span>
          )}
        </span>
        <span className="prod-linha-status hud-tone-text">
          {status.texto}
          {deal.dataEmbarque && !concluido ? ` · ${formatDate(deal.dataEmbarque).slice(0, 5)}` : ""}
        </span>
        <Seta className="prod-linha-seta" aria-hidden />
      </button>
      {aberto && children && <div className="prod-linha-detalhe">{children}</div>}
    </div>
  );
}

/** Cabeçalho de um dia (ou etapa): nome, quantos pedidos e quantos pares. */
export function CabecalhoDoDia({
  grupo,
  aberto = true,
  onAlternar,
}: {
  grupo: BoardGroup;
  aberto?: boolean;
  /** Sem ele o cabeçalho não recolhe (colunas). */
  onAlternar?: () => void;
}) {
  const n = grupo.deals.length;
  const pares = somaDePares(grupo.deals);
  const conteudo = (
    <>
      <span className="hud-tone-dot h-2 w-2 shrink-0 rounded-full" />
      <span className="truncate font-bold">{rotuloDoDia(grupo.title)}</span>
      <span className="ml-auto shrink-0 text-[0.8em] font-medium text-muted-foreground">
        {n} {n === 1 ? "pedido" : "pedidos"}
        {pares > 0 ? ` · ${pares.toLocaleString("pt-BR")} pares` : ""}
      </span>
      {onAlternar && (
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !aberto && "-rotate-90")} />
      )}
    </>
  );
  const tom = tomDoGrupo(grupo);
  return onAlternar ? (
    <button type="button" className={cn("prod-dia", tom)} aria-expanded={aberto} onClick={onAlternar}>
      {conteudo}
    </button>
  ) : (
    <div className={cn("prod-dia", tom)}>{conteudo}</div>
  );
}

/** Painel do pedido aberto, à direita da lista no tablet deitado. */
function PainelDoPedido({ deal, concluido, acoes }: { deal: BoardDeal; concluido: boolean; acoes?: ReactNode }) {
  const status = statusCurto(deal.dataEmbarque, concluido);
  return (
    <div className="grid gap-4">
      <div className={cn("grid gap-1", status.tom)}>
        <TipoPedidoBadge tipo={deal.tipoPedido} className="justify-self-start" />
        <h2 className="text-xl font-bold tracking-tight">{deal.title}</h2>
        <p className="hud-tone-text text-sm font-semibold">
          {status.texto}
          {deal.dataEmbarque && !concluido ? ` · embarque ${formatDate(deal.dataEmbarque)}` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
        <div className="prod-dado">
          <small>Pares</small>
          <b>{deal.quantidadePares || "—"}</b>
        </div>
        <div className="prod-dado">
          <small>Etapa</small>
          <b>{deal.stageTitle || "—"}</b>
        </div>
        <div className="prod-dado col-span-2 xl:col-span-1">
          <small>Vendedor · Designer</small>
          <b>{[deal.vendedor, deal.designer].filter(Boolean).join(" · ") || "—"}</b>
        </div>
      </div>
      {acoes}
    </div>
  );
}

type RenderAcoes = (deal: BoardDeal, grande: boolean) => ReactNode;

/**
 * Lista por dia (celular e tablet). Abre de cara só os dias de `abertosIniciais`;
 * os demais mostram a contagem e abrem no toque. Para reiniciar o que está aberto
 * (troca de aba ou de filtro), a página muda a `key`.
 */
export function ListaPorDia({
  grupos,
  grupoConcluidoId,
  abertosIniciais,
  renderAcoes,
}: {
  grupos: BoardGroup[];
  grupoConcluidoId?: string;
  abertosIniciais: string[];
  renderAcoes: RenderAcoes;
}) {
  const dividido = useMidia("(min-width: 1024px)");
  const [abertos, setAbertos] = useState(() => new Set(abertosIniciais));
  const [expandido, setExpandido] = useState<string | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const alternarDia = (id: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  let selecionado: { deal: BoardDeal; concluido: boolean } | null = null;
  if (dividido && selecionadoId) {
    for (const g of grupos) {
      const d = g.deals.find((x) => x.id === selecionadoId);
      if (d) {
        selecionado = { deal: d, concluido: g.id === grupoConcluidoId };
        break;
      }
    }
  }

  const lista = (
    <div className="flex min-w-0 flex-col gap-2">
      {grupos.map((g) => {
        const aberto = abertos.has(g.id);
        return (
          <section key={g.id} className="grid gap-1.5">
            <CabecalhoDoDia grupo={g} aberto={aberto} onAlternar={() => alternarDia(g.id)} />
            {aberto &&
              (g.deals.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">Nada aqui.</p>
              ) : (
                g.deals.map((d) => {
                  const concluido = g.id === grupoConcluidoId;
                  return (
                    <PedidoLinha
                      key={d.id}
                      deal={d}
                      concluido={concluido}
                      seta={dividido ? "abrir" : "expandir"}
                      aberto={!dividido && expandido === d.id}
                      selecionado={dividido && selecionadoId === d.id}
                      onToque={() =>
                        dividido
                          ? setSelecionadoId(d.id)
                          : setExpandido((atual) => (atual === d.id ? null : d.id))
                      }
                    >
                      <DadosDoPedido deal={d} />
                      {renderAcoes(d, false)}
                    </PedidoLinha>
                  );
                })
              ))}
          </section>
        );
      })}
    </div>
  );

  if (!dividido) return lista;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
      {lista}
      <aside className="hud-panel sticky top-[calc(var(--prod-topo,7.5rem)+0.75rem)] p-5">
        {selecionado ? (
          <PainelDoPedido
            deal={selecionado.deal}
            concluido={selecionado.concluido}
            acoes={renderAcoes(selecionado.deal, true)}
          />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Toque num pedido para ver os detalhes e os botões.
          </p>
        )}
      </aside>
    </div>
  );
}

/** As mesmas linhas, em colunas por dia (computador e TV). */
export function ColunasPorDia({
  grupos,
  grupoConcluidoId,
  renderAcoes,
}: {
  grupos: BoardGroup[];
  grupoConcluidoId?: string;
  renderAcoes: RenderAcoes;
}) {
  const [expandido, setExpandido] = useState<string | null>(null);
  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto pb-1">
      {grupos.map((g) => (
        <section key={g.id} className="prod-coluna">
          <CabecalhoDoDia grupo={g} />
          <div className="prod-coluna-corpo">
            {g.deals.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nada aqui.</p>
            ) : (
              g.deals.map((d) => (
                <PedidoLinha
                  key={d.id}
                  deal={d}
                  concluido={g.id === grupoConcluidoId}
                  aberto={expandido === d.id}
                  onToque={() => setExpandido((atual) => (atual === d.id ? null : d.id))}
                >
                  <DadosDoPedido deal={d} />
                  {renderAcoes(d, false)}
                </PedidoLinha>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
