"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { GestorView as GestorData } from "@/lib/sellers-v2/team";
import { cn } from "@/lib/utils";

const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const tone = (pct: number | null) =>
  pct == null ? "text-muted-foreground" : pct >= 80 ? "text-primary" : pct >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
const bar = (pct: number | null) => (pct == null ? "bg-muted" : pct >= 80 ? "bg-primary" : pct >= 70 ? "bg-amber-500" : "bg-red-500");

/** Visão do gestor (owner): quem treinou na semana, evolução e pontos fracos do time. */
export function GestorView() {
  const [data, setData] = useState<GestorData | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/sellers-v2/gestor", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Falha ao carregar");
        setData(json);
      })
      .catch((err) => toast.error((err as Error).message));
  }, []);

  const remind = async (userId: string) => {
    setSending(userId);
    try {
      const res = await fetch("/api/sellers-v2/gestor/lembrete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível enviar");
      toast.success(json.push ? "Lembrete enviado no celular e no sininho" : "Lembrete no sininho (a pessoa não ativou o push)");
      setSent((s) => new Set(s).add(userId));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(null);
    }
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const kpis = [
    ["Treinaram na semana", `${data.time.treinaramSemana} de ${data.time.total}`],
    ["Treinos na semana", String(data.time.treinosSemana)],
    ["Média do time (temporada)", data.time.media == null ? "—" : String(data.time.media)],
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map(([label, value]) => (
          <Card key={label} className="py-4">
            <CardContent className="px-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-extrabold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quem treinou</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Pessoa</th>
                <th className="py-2 pr-3 font-semibold">Seg a Sex</th>
                <th className="py-2 pr-3 font-semibold">XP da temporada</th>
                <th className="py-2 pr-3 font-semibold">Média</th>
                <th className="py-2 pr-3 font-semibold">Evolução</th>
                <th className="py-2 pr-3 font-semibold">Ponto fraco</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {data.pessoas.map((p) => (
                <tr key={p.userId} className="border-t">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.nome} />}
                        <AvatarFallback className="text-xs font-bold">{p.nome.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">{p.nome}</p>
                        <p className="text-xs text-muted-foreground">{p.nivel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex gap-1">
                      {WEEK.map((d, i) => (
                        <span
                          key={d}
                          title={d}
                          className={cn("h-4 w-4 rounded", p.diasDaSemana.includes(i + 1) ? "bg-primary" : "border bg-muted")}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 font-semibold tabular-nums">{p.seasonXp.toLocaleString("pt-BR")}</td>
                  <td className={cn("py-2.5 pr-3 font-bold", tone(p.media))}>{p.media ?? "—"}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex h-7 items-end gap-0.5" aria-label={`Últimas notas: ${p.evolucao.join(", ") || "nenhuma"}`}>
                      {p.evolucao.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        p.evolucao.map((n, i) => (
                          <span key={i} className={cn("w-2 rounded-sm", bar(n))} style={{ height: `${Math.max(10, n * 0.28)}px` }} />
                        ))
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{p.pontoFraco ?? "—"}</td>
                  <td className="py-2.5 text-right">
                    {!p.treinouHoje && (
                      <Button
                        size="sm"
                        variant={sent.has(p.userId) ? "ghost" : "outline"}
                        disabled={sending === p.userId || sent.has(p.userId)}
                        onClick={() => remind(p.userId)}
                      >
                        {sending === p.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                        {sent.has(p.userId) ? "Lembrete enviado" : "Mandar lembrete"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pontos fortes e fracos do time</CardTitle>
            <p className="text-sm text-muted-foreground">Média de cada critério na temporada, em % do máximo.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.criterios.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{c.nome}</span>
                  <strong className={tone(c.pct)}>{c.pct == null ? "—" : `${c.pct}%`}</strong>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", bar(c.pct))} style={{ width: `${c.pct ?? 0}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Missões mais difíceis</CardTitle>
            <p className="text-sm text-muted-foreground">Menor média do time: bons temas para a reunião.</p>
          </CardHeader>
          <CardContent>
            {data.missoesDificeis.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém treinou uma missão nesta temporada ainda.</p>
            ) : (
              <ul className="space-y-2">
                {data.missoesDificeis.map((m) => (
                  <li key={m.titulo} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                    <span className="w-12 text-amber-500">{"★".repeat(m.dificuldade)}</span>
                    <span className="flex-1 font-medium">{m.titulo}</span>
                    <span className="text-xs text-muted-foreground">{m.treinos} treinos</span>
                    <strong className={tone(m.media)}>{m.media}</strong>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
