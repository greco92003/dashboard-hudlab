import { Children, Fragment, isValidElement, type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Peças do layout v2 (aprovado em 13/11/2026), para toda tela seguir a mesma
 * organização. O visual está em app/hud-dashboard.css.
 *
 *   <CabecalhoDaPagina icone={Clock} titulo="Programação" descricao="..."
 *     acoes={<GrupoDeAcoes>...botões...</GrupoDeAcoes>} />
 *   <BarraDeFiltros>
 *     <Campo rotulo="Período"><SeletorPeriodo /></Campo>
 *   </BarraDeFiltros>
 */

/** Ícone no quadrado verde, título, descrição e a caixa de ações à direita. */
export function CabecalhoDaPagina({
  icone: Icone,
  titulo,
  descricao,
  acoes,
  className,
}: {
  icone?: ComponentType<{ className?: string }>;
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("hud-v2-head", className)}>
      <div className="hud-v2-title">
        {Icone && (
          <div className="hud-v2-tile">
            <Icone />
          </div>
        )}
        <div className="min-w-0">
          <h1>{titulo}</h1>
          {descricao && <p className="hud-v2-sub">{descricao}</p>}
        </div>
      </div>
      {acoes}
    </div>
  );
}

/**
 * Caixa única de botões, com fio entre eles. Os filhos diretos (button, a ou
 * role="button", inclusive gatilhos de diálogo e popover com asChild) ganham o
 * estilo da caixa; o que vier nulo some sem deixar fio sobrando. Botão que
 * alterna estado usa aria-pressed.
 */
export function GrupoDeAcoes({
  children,
  rotulo,
  separar = true,
  className,
}: {
  children: ReactNode;
  /** Nome do grupo para leitor de tela. */
  rotulo?: string;
  /** false para alternâncias (Todos | Ativos), que ficam sem fio entre si. */
  separar?: boolean;
  className?: string;
}) {
  const itens = Children.toArray(children).filter((c) => isValidElement(c) || typeof c === "string");
  return (
    <div className={cn("hud-group", className)} role="group" aria-label={rotulo}>
      {itens.map((item, i) => (
        <Fragment key={isValidElement(item) && item.key != null ? item.key : i}>
          {separar && i > 0 && <span className="hud-group-sep" aria-hidden />}
          {item}
        </Fragment>
      ))}
    </div>
  );
}

/** Painel único dos filtros da tela; cada grupo vai num Campo. */
export function BarraDeFiltros({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("hud-panel hud-bar", className)}>{children}</div>;
}

/** Rótulo pequeno em cima do controle, alinhado com os outros campos da barra. */
export function Campo({
  rotulo,
  children,
  className,
}: {
  rotulo: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("hud-field", className)}>
      <span className="hud-field-label">{rotulo}</span>
      {children}
    </div>
  );
}

/** Painel de vidro com cabeçalho opcional (título à esquerda, extras à direita). */
export function Painel({
  titulo,
  extra,
  children,
  className,
  corpoClassName,
}: {
  titulo?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  corpoClassName?: string;
}) {
  return (
    <section className={cn("hud-panel overflow-hidden", className)}>
      {(titulo || extra) && (
        <div className="hud-panel-head">
          {titulo && <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>}
          {extra && <div className="ml-auto flex flex-wrap items-center gap-2">{extra}</div>}
        </div>
      )}
      <div className={corpoClassName}>{children}</div>
    </section>
  );
}
