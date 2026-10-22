"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Coluna presa à esquerda ao rolar a tabela para o lado. A sombra de 1px
 * marca onde ela termina (borda some no sticky). Quem usa soma o fundo da
 * superfície onde a tabela está (bg-background na página, bg-card em card),
 * senão o conteúdo rolado aparece por baixo.
 */
export const STICKY_COLUMN_CLASS =
  "sticky left-0 z-10 shadow-[1px_0_0_0_var(--border)]";

/**
 * Área com rolagem lateral e barra também em cima, sincronizada com a de
 * baixo: em tabela longa a de baixo só aparecia depois de descer tudo. A
 * barra de cima só aparece quando o conteúdo transborda.
 */
export function HorizontalScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      setScrollWidth(body.scrollWidth);
      setOverflowing(body.scrollWidth > body.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const top = topRef.current;
    const body = bodyRef.current;
    if (!top || !body) return;
    const fromTop = () => {
      if (body.scrollLeft !== top.scrollLeft) body.scrollLeft = top.scrollLeft;
    };
    const fromBody = () => {
      if (top.scrollLeft !== body.scrollLeft) top.scrollLeft = body.scrollLeft;
    };
    top.addEventListener("scroll", fromTop, { passive: true });
    body.addEventListener("scroll", fromBody, { passive: true });
    return () => {
      top.removeEventListener("scroll", fromTop);
      body.removeEventListener("scroll", fromBody);
    };
  }, [overflowing]);

  return (
    <>
      {overflowing ? (
        <div ref={topRef} className="overflow-x-auto border-b" aria-hidden="true">
          <div style={{ width: scrollWidth, height: 1 }} />
        </div>
      ) : null}
      <div ref={bodyRef} className={cn("overflow-x-auto", className)}>
        {children}
      </div>
    </>
  );
}
