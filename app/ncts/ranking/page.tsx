"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/contexts/OptimizedAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Medal, Zap, Trophy } from "lucide-react";
import { SETORES, getSetor, calcularNivel } from "@/lib/ncts";

type RankEntry = {
  usuario_id: string;
  xp: number;
  nome: string;
  nivel: number;
  posicao: number;
};

function PodiumRow({ entry, isMe }: { entry: RankEntry; isMe: boolean }) {
  const medal =
    entry.posicao === 1
      ? "🥇"
      : entry.posicao === 2
        ? "🥈"
        : entry.posicao === 3
          ? "🥉"
          : null;
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${isMe ? "bg-primary/10 border-primary/30" : "hover:bg-muted/50"}`}
    >
      <span
        className={`w-8 text-center font-bold text-lg ${entry.posicao <= 3 ? "" : "text-muted-foreground text-sm"}`}
      >
        {medal ?? `${entry.posicao}°`}
      </span>
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
        {entry.nome?.[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${isMe ? "text-primary" : ""}`}
        >
          {entry.nome}
          {isMe ? " (você)" : ""}
        </p>
        <p className="text-xs text-muted-foreground">Nível {entry.nivel}</p>
      </div>
      <div className="flex items-center gap-1 text-amber-500 font-bold text-sm shrink-0">
        <Zap className="h-4 w-4" />
        {entry.xp.toLocaleString()}
      </div>
    </div>
  );
}

export default function NctsRankingPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [rankingGeral, setRankingGeral] = useState<RankEntry[]>([]);
  const [rankingSetor, setRankingSetor] = useState<RankEntry[]>([]);
  const [setorSel, setSetorSel] = useState("design");
  const [loading, setLoading] = useState(true);

  const buildRanking = useCallback(
    (logs: any[], profiles: any[]): RankEntry[] => {
      const map: Record<string, number> = {};
      logs.forEach((l) => {
        map[l.usuario_id] = (map[l.usuario_id] ?? 0) + l.xp_ganho;
      });
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([uid, xp], i) => {
          const prof = profiles.find((p) => p.id === uid);
          const nome = prof
            ? `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() ||
              prof.email
            : uid.slice(0, 8);
          return {
            usuario_id: uid,
            xp,
            nome,
            nivel: calcularNivel(xp).nivel,
            posicao: i + 1,
          };
        });
    },
    [],
  );

  const fetchGeral = useCallback(async () => {
    const [logsRes, profRes] = await Promise.all([
      supabase.from("nct_xp_log").select("usuario_id, xp_ganho"),
      supabase.from("user_profiles").select("id, first_name, last_name, email"),
    ]);
    setRankingGeral(buildRanking(logsRes.data ?? [], profRes.data ?? []));
    setLoading(false);
  }, [supabase, buildRanking]);

  const fetchSetor = useCallback(
    async (setor: string) => {
      const [profRes, logsRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("id, first_name, last_name, email")
          .eq("sector", setor),
        supabase.from("nct_xp_log").select("usuario_id, xp_ganho"),
      ]);
      const profIds = new Set((profRes.data ?? []).map((p: any) => p.id));
      const filteredLogs = (logsRes.data ?? []).filter((l: any) =>
        profIds.has(l.usuario_id),
      );
      setRankingSetor(buildRanking(filteredLogs, profRes.data ?? []));
    },
    [supabase, buildRanking],
  );

  useEffect(() => {
    fetchGeral();
  }, [fetchGeral]);
  useEffect(() => {
    fetchSetor(setorSel);
  }, [setorSel, fetchSetor]);

  const setor = getSetor(setorSel);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Medal className="h-7 w-7 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">Ranking NCT</h1>
          <p className="text-sm text-muted-foreground">
            Os maiores contribuidores da plataforma.
          </p>
        </div>
      </div>

      <Tabs defaultValue="geral">
        <TabsList className="grid grid-cols-2 w-full max-w-xs">
          <TabsTrigger value="geral">🌐 Geral</TabsTrigger>
          <TabsTrigger value="setor">🏢 Por Setor</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Top 20 — Ranking Geral
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : rankingGeral.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum XP registrado ainda.
                </p>
              ) : (
                rankingGeral.map((entry) => (
                  <PodiumRow
                    key={entry.usuario_id}
                    entry={entry}
                    isMe={entry.usuario_id === user?.id}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setor" className="pt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={setorSel} onValueChange={setSetorSel}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SETORES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: s.cor }}
                      />
                      {s.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {setor && (
              <Badge
                className="text-white border-0"
                style={{ backgroundColor: setor.cor }}
              >
                {setor.nome}
              </Badge>
            )}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Top 20 — {setor?.nome ?? "Setor"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : rankingSetor.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum membro com XP neste setor ainda.
                </p>
              ) : (
                rankingSetor.map((entry) => (
                  <PodiumRow
                    key={entry.usuario_id}
                    entry={entry}
                    isMe={entry.usuario_id === user?.id}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
