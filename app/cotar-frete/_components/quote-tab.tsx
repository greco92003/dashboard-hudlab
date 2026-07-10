"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Calculator,
  Package,
  Plus,
  Trash2,
  MapPin,
  Clock,
  Truck,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import {
  FreightVolume,
  QuoteResult,
  QuoteResponse,
  formatCurrency,
} from "./types";

interface Line {
  volume_id: string;
  count: string;
}

const STORAGE_KEY = "cotar-frete:quote-form";

export default function QuoteTab({ volumes }: { volumes: FreightVolume[] }) {
  const activeVolumes = useMemo(() => volumes.filter((v) => v.active), [volumes]);

  const [destino, setDestino] = useState("");
  const [valorNf, setValorNf] = useState("");
  const [lines, setLines] = useState<Line[]>([{ volume_id: "", count: "1" }]);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<QuoteResponse | null>(null);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [cepInfo, setCepInfo] = useState<{ city: string; uf: string } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);

  // ── persist the form across tab switches (sessionStorage) ───────────────────
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.destino === "string") setDestino(d.destino);
        if (typeof d.valorNf === "string") setValorNf(d.valorNf);
        if (Array.isArray(d.lines) && d.lines.length) setLines(d.lines);
        if (d.cepInfo?.city && d.cepInfo?.uf) setCepInfo(d.cepInfo);
      }
    } catch {
      /* ignore */
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ destino, valorNf, lines, cepInfo }),
      );
    } catch {
      /* ignore */
    }
  }, [restored, destino, valorNf, lines, cepInfo]);

  const lookupCep = async () => {
    const d = destino.replace(/\D/g, "");
    if (d.length !== 8) {
      setCepInfo(null);
      return;
    }
    setCepLoading(true);
    try {
      const res = await fetch(`/api/freight/cep?cep=${d}`);
      setCepInfo(res.ok ? await res.json() : null);
    } catch {
      setCepInfo(null);
    } finally {
      setCepLoading(false);
    }
  };

  // ── live shipment preview from selected volumes ─────────────────────────────
  const preview = useMemo(() => {
    let peso = 0;
    let m3 = 0;
    let missing = false;
    for (const ln of lines) {
      const v = activeVolumes.find((x) => x.id === ln.volume_id);
      const n = parseInt(ln.count) || 0;
      if (!v || n <= 0) continue;
      if (v.weight_kg == null) missing = true;
      peso += (v.weight_kg || 0) * n;
      if (v.width_cm && v.height_cm && v.depth_cm)
        m3 += ((v.width_cm * v.height_cm * v.depth_cm) / 1_000_000) * n;
    }
    const cubado = m3 * 300;
    return { peso, m3, cubado, taxavel: Math.max(peso, cubado), missing };
  }, [lines, activeVolumes]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { volume_id: "", count: "1" }]);
  const removeLine = (i: number) =>
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));

  const runQuote = async () => {
    if (!destino.trim()) return toast.error("Informe o destino (CEP ou cidade)");
    const selected = lines
      .filter((l) => l.volume_id && (parseInt(l.count) || 0) > 0)
      .map((l) => ({ volume_id: l.volume_id, count: parseInt(l.count) }));
    if (selected.length === 0) return toast.error("Selecione ao menos um volume");

    setLoading(true);
    setResp(null);
    try {
      const res = await fetch("/api/freight/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destino: destino.trim(),
          volumes: selected,
          valor_nf: parseFloat(valorNf.replace(",", ".")) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Erro ao cotar");
        return;
      }
      setResp(json);
      setExpanded(0);
      if (json.results.length === 0) toast.info("Nenhuma tarifa encontrada para o destino");
    } catch {
      toast.error("Erro ao comunicar com o servidor");
    } finally {
      setLoading(false);
    }
  };

  if (activeVolumes.length === 0) {
    return (
      <Card className="flex items-center justify-center min-h-[220px] border-dashed">
        <div className="text-center text-muted-foreground space-y-2 p-6">
          <Package className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm">
            Cadastre volumes com <strong>peso</strong> (aba Volumes) para poder cotar.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* ── Form ── */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Parâmetros da Cotação
          </CardTitle>
          <CardDescription>
            Origem fixa: <strong>Nova Hartz-RS</strong>. Informe destino, volumes e valor da NF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Destino (CEP ou cidade)</Label>
            <Input
              placeholder="Ex: 05092-000 ou SÃO PAULO"
              value={destino}
              onChange={(e) => {
                setDestino(e.target.value);
                if (e.target.value.replace(/\D/g, "").length !== 8) setCepInfo(null);
              }}
              onBlur={lookupCep}
            />
            {cepLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando CEP...
              </p>
            ) : cepInfo ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {cepInfo.city}/{cepInfo.uf}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                O CEP é mais preciso — a mesma cidade pode ter faixas de preço diferentes.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Valor da Mercadoria / NF (R$)</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 2000,00"
              value={valorNf}
              onChange={(e) => setValorNf(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Volumes</Label>
            {lines.map((ln, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Select value={ln.volume_id} onValueChange={(v) => setLine(i, { volume_id: v })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione o volume" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVolumes.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        {v.weight_kg ? ` · ${v.weight_kg}kg` : " · sem peso"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  className="w-16"
                  value={ln.count}
                  onChange={(e) => setLine(i, { count: e.target.value })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeLine(i)}
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addLine} className="w-full">
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar volume
            </Button>
          </div>

          {/* live weight preview */}
          {preview.taxavel > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Peso real</span>
                <span>{preview.peso.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Peso cubado (1m³=300kg)</span>
                <span>{preview.cubado.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</span>
              </div>
              <div className="flex justify-between font-medium border-t pt-1">
                <span className="flex items-center gap-1">
                  <Scale className="h-3.5 w-3.5" /> Peso taxável
                </span>
                <span>{preview.taxavel.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</span>
              </div>
              {preview.missing && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 pt-1">
                  <AlertCircle className="h-3 w-3" /> Há volume sem peso cadastrado.
                </p>
              )}
            </div>
          )}

          <Button className="w-full" onClick={runQuote} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Calculando...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" /> Calcular Frete
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── Results ── */}
      <div className="space-y-4">
        {!resp && (
          <Card className="flex items-center justify-center min-h-[220px] border-dashed">
            <div className="text-center text-muted-foreground space-y-2">
              <Truck className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-sm">
                Preencha os parâmetros e clique em <strong>Calcular Frete</strong>
              </p>
            </div>
          </Card>
        )}

        {resp && (
          <>
            {resp.resolved && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                CEP <strong>{resp.resolved.cep}</strong> → {resp.resolved.city}/{resp.resolved.uf}
                <span className="text-muted-foreground">· via {resp.resolved.source}</span>
              </div>
            )}

            {resp.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                {resp.warnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            {resp.ambiguous_city && (
              <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Esta cidade tem mais de uma faixa de CEP com preços diferentes. Confira o
                <strong> CEP</strong> do destinatário para escolher a tarifa correta.
              </div>
            )}

            {resp.results.length === 0 && (
              <Card className="flex items-center justify-center min-h-[160px] border-dashed">
                <div className="text-center text-muted-foreground space-y-2 p-4">
                  <MapPin className="h-8 w-8 mx-auto opacity-40" />
                  <p className="text-sm">
                    Nenhuma tarifa encontrada para <strong>{destino}</strong>
                  </p>
                  <p className="text-xs">
                    Verifique se a tabela da transportadora cobre esse destino, ou tente pelo CEP.
                  </p>
                </div>
              </Card>
            )}

            {resp.results.map((r, i) => (
              <ResultCard
                key={`${r.table.id}-${r.destination.cep_prefix}-${i}`}
                r={r}
                best={i === 0}
                open={expanded === i}
                onToggle={() => setExpanded(expanded === i ? null : i)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  r,
  best,
  open,
  onToggle,
}: {
  r: QuoteResult;
  best: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const q = r.quote;
  const prazo =
    r.prazo_min && r.prazo_max
      ? `${r.prazo_min}–${r.prazo_max} dias`
      : r.prazo_max
        ? `${r.prazo_max} dias`
        : "prazo não informado";

  return (
    <Card className={best ? "border-primary" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {best && <Badge className="text-xs">Melhor Preço</Badge>}
              <h3 className="font-semibold">{r.carrier.name}</h3>
              <Badge variant="outline" className="text-xs font-normal">
                {r.table.name}
              </Badge>
              {r.match_confidence === "api" && (
                <Badge className="text-xs bg-blue-600 hover:bg-blue-600 text-white">
                  API · tempo real
                </Badge>
              )}
              {r.match_confidence === "nearest" && (
                <Badge className="text-xs bg-amber-500 hover:bg-amber-500 text-white">
                  praça estimada
                </Badge>
              )}
              {r.match_confidence === "city" && (
                <Badge variant="secondary" className="text-xs font-normal">
                  por cidade
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {r.destination.city}
                {r.destination.cep_prefix ? ` (${r.destination.cep_prefix})` : ""}
                {r.destination.uf ? `/${r.destination.uf}` : ""}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {prazo}
              </span>
              <span className="flex items-center gap-1">
                <Scale className="h-3.5 w-3.5" /> {q.peso_taxavel_kg} kg taxável
                {q.usou_cubagem ? " (cubado)" : ""}
              </span>
            </div>
            {q.avisos.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {q.avisos.map((a, j) => (
                  <p
                    key={j}
                    className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1"
                  >
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {a}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-primary">{formatCurrency(q.total)}</p>
            <p className="text-xs text-muted-foreground">frete total</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 px-2 text-xs text-muted-foreground"
          onClick={onToggle}
        >
          {open ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 mr-1" /> Ocultar composição
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 mr-1" /> Ver composição do frete
            </>
          )}
        </Button>

        {open && (
          <div className="mt-2 rounded-md border divide-y text-sm">
            {q.lines
              .filter((l) => l.key !== "min")
              .map((l) => (
                <div key={l.key} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-muted-foreground">
                    {l.label}
                    {l.detail ? (
                      <span className="text-xs opacity-70"> · {l.detail}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">{formatCurrency(l.value)}</span>
                </div>
              ))}
            <div className="flex items-center justify-between px-3 py-2 font-semibold bg-muted/40">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(q.total)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
