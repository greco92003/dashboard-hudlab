"use client";

// Aba Atendimentos Reais da arena: não lidas de WhatsApp ranqueadas por
// chance de fechamento (quente, morno, frio) e pós-venda, com insight e
// sugestão de resposta sob demanda. Lógica de fila em lib/ghl/unread-inbox.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnreadInboxItem } from "@/lib/ghl/unread-inbox/load";
import type { TriageCategory } from "@/lib/ghl/unread-inbox/triage";

const GHL_LOCATION_ID = "dhz2q752HHI3xw2jHkrv";

interface CopilotoReport {
  situacaoAtual: string;
  proximaAcao: string;
  mensagemSugerida: string;
  evitar: string;
}

const CATEGORY_META: Record<TriageCategory, { label: string; emoji: string; className: string }> = {
  quente: { label: "Quente", emoji: "🔥", className: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30" },
  morno: { label: "Morno", emoji: "🌤️", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  frio: { label: "Frio", emoji: "❄️", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" },
  pos_venda: { label: "Pós-venda", emoji: "📦", className: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30" },
};

const FILTERS: Array<{ value: "todas" | TriageCategory; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "quente", label: "🔥 Quente" },
  { value: "morno", label: "🌤️ Morno" },
  { value: "frio", label: "❄️ Frio" },
  { value: "pos_venda", label: "📦 Pós-venda" },
];

const ALL_SELLERS = "__todos__";

function formatWaiting(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 dia" : `${days} dias`;
}

function formatMoney(value: number | null): string | null {
  if (value == null || value <= 0) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function UnreadInbox() {
  const [items, setItems] = useState<UnreadInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todas" | TriageCategory>("todas");
  const [seller, setSeller] = useState<string>(ALL_SELLERS);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sellers-v2/unread?_t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar as não lidas");
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar as não lidas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/sellers-v2/unread/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível atualizar");
      setItems(data.items ?? []);
      if (data.errors > 0) {
        toast.warning(`${data.errors} conversa(s) não foram classificadas; tente atualizar de novo.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar");
    } finally {
      setRefreshing(false);
    }
  };

  const generateInsight = async (conversationId: string) => {
    setGeneratingFor(conversationId);
    setError(null);
    try {
      const res = await fetch("/api/sellers-v2/unread/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível gerar o insight");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o insight");
    } finally {
      setGeneratingFor(null);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const sellers = useMemo(
    () => [...new Set(items.map((i) => i.vendedor).filter((v): v is string => !!v))].sort(),
    [items],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: items.length };
    for (const i of items) if (i.category) c[i.category] = (c[i.category] ?? 0) + 1;
    return c;
  }, [items]);
  const visible = items.filter(
    (i) =>
      (filter === "todas" || i.category === filter) &&
      (seller === ALL_SELLERS || i.vendedor === seller),
  );
  const lastRefresh = items.reduce<string | null>(
    (latest, i) => (!latest || i.refreshedAt > latest ? i.refreshedAt : latest),
    null,
  );

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Inbox className="h-5 w-5 text-emerald-600" />
              Não lidas no WhatsApp
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {lastRefresh
                ? `Atualizado em ${new Date(lastRefresh).toLocaleString("pt-BR")}`
                : "Ainda não atualizado"}
              {" · "}ordem: mais perto de fechar primeiro; dentro de cada grupo, quem espera há mais tempo
            </p>
          </div>
          <Button onClick={refresh} disabled={refreshing} size="sm">
            {refreshing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Atualizando (até 1 min)…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Atualizar não lidas
              </>
            )}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              <span className="ml-1 text-xs opacity-70">{counts[f.value] ?? 0}</span>
            </Button>
          ))}
          <Select value={seller} onValueChange={setSeller}>
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SELLERS}>Todos os vendedores</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              ✕
            </Button>
          </div>
        )}

        {loading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhuma não lida na fila. Clique em &quot;Atualizar não lidas&quot; para buscar no GHL.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nada neste filtro.</p>
        ) : (
          visible.map((item) => {
            const meta = item.category ? CATEGORY_META[item.category] : null;
            const insight = item.insight as CopilotoReport | null;
            const money = formatMoney(item.monetaryValue);
            return (
              <div key={item.conversationId} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.contactName || item.phone || "Contato sem nome"}</p>
                      {meta ? (
                        <Badge variant="outline" className={cn("font-medium", meta.className)}>
                          {meta.emoji} {meta.label}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Sem classificação</Badge>
                      )}
                      {item.windowOpen ? (
                        <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-500/40">
                          Janela aberta
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Janela fechada: use template
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Esperando há {formatWaiting(item.lastInboundAt)}
                      {item.unreadCount > 1 && ` · ${item.unreadCount} não lidas`}
                      {item.stageName && ` · ${item.stageName}`}
                      {item.vendedor && ` · ${item.vendedor}`}
                      {item.qtyPares != null && ` · ${item.qtyPares} pares`}
                      {money && ` · ${money}`}
                    </p>
                    {item.subject && <p className="text-sm font-medium">{item.subject}</p>}
                    {item.reason && <p className="text-sm text-muted-foreground">{item.reason}</p>}
                    {item.classifyError && !item.category && (
                      <p className="text-xs text-destructive">Não classificada: {item.classifyError}</p>
                    )}
                    {item.lastMessageBody && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Última mensagem: “{item.lastMessageBody}”
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button asChild size="sm" variant="ghost">
                      <a
                        href={`https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/conversations/conversations/${item.conversationId}?category=team-inbox&tab=unread`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        GHL
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => generateInsight(item.conversationId)}
                      disabled={generatingFor === item.conversationId}
                    >
                      {generatingFor === item.conversationId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {insight ? (item.insightOutdated ? "Atualizar insight" : "Gerar de novo") : "Insight e resposta"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {insight && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm space-y-2">
                    {item.insightOutdated && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        O cliente mandou mensagem depois deste insight.
                      </p>
                    )}
                    <p>
                      <span className="font-medium">Próxima ação:</span> {insight.proximaAcao}
                    </p>
                    <div className="rounded-md border bg-background p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">Sugestão de resposta</span>
                        <Button size="sm" variant="outline" onClick={() => copy(insight.mensagemSugerida)}>
                          <Copy className="h-4 w-4" />
                          Copiar
                        </Button>
                      </div>
                      <p className="whitespace-pre-wrap">{insight.mensagemSugerida}</p>
                      {!item.windowOpen && (
                        <p className="text-xs text-muted-foreground">
                          A janela de 24h está fechada: no WhatsApp, só dá para mandar um template aprovado.
                        </p>
                      )}
                    </div>
                    {insight.evitar && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">Evitar:</span> {insight.evitar}
                      </p>
                    )}
                    {item.insightAt && (
                      <p className="text-xs text-muted-foreground">
                        Gerado em {new Date(item.insightAt).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
