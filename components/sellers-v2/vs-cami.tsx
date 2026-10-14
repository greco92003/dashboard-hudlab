"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Comparacao {
  cliente?: string;
  vendedor?: string;
  cami?: { decisao: string; mensagens: string[]; motivo: string | null };
  porque?: string | null;
  erro?: string;
}

/**
 * "Você × Cami": no momento em que o vendedor perdeu mais pontos, o que a
 * Cami responderia. Calculado uma vez no servidor e guardado na sessão.
 */
export function VsCami({ sessionId, initial }: { sessionId: string; initial: unknown }) {
  const [data, setData] = useState<Comparacao | null>((initial as Comparacao) ?? null);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/sellers-v2/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "compare", sessionId }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        setData(res.ok ? json.comparacao : { erro: json.error || "Não foi possível comparar agora." });
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setData({ erro: "Não foi possível comparar agora." });
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [sessionId, initial]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Você × Cami</CardTitle>
        <p className="text-sm text-muted-foreground">No momento em que você perdeu mais pontos, a Cami responderia assim.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> A Cami está lendo a conversa…
          </p>
        ) : !data || data.erro || !data.cami ? (
          <p className="text-sm text-muted-foreground">{data?.erro ?? "Sem comparação para este treino."}</p>
        ) : (
          <>
            <div className="max-w-2xl rounded-2xl rounded-bl-md border bg-muted/40 px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">Cliente</p>
              <p className="text-sm">{data.cliente}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-red-500/40 p-4 space-y-2">
                <p className="text-xs font-extrabold uppercase tracking-widest text-red-600 dark:text-red-400">Você respondeu</p>
                <p className="text-sm whitespace-pre-line">{data.vendedor}</p>
              </div>
              <div className="rounded-xl border border-primary/50 bg-primary/5 p-4 space-y-2">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-primary">
                  <Bot className="h-4 w-4" /> A Cami responderia
                </p>
                {data.cami.mensagens.length > 0 ? (
                  data.cami.mensagens.map((m, i) => (
                    <p key={i} className="text-sm whitespace-pre-line">
                      {m}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Não responderia nada aqui.</p>
                )}
                {data.cami.decisao === "escalou" && (
                  <p className="text-xs text-muted-foreground">E passaria o cliente para uma pessoa do time.</p>
                )}
              </div>
            </div>
            {data.porque && <p className="text-xs text-muted-foreground">Por que este momento: {data.porque}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
