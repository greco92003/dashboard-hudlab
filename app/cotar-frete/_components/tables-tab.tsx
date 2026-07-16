"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Edit,
  Truck,
  Upload,
  FileSpreadsheet,
  MapPinned,
  Table2,
  Loader2,
  Download,
  PhoneCall,
  Mail,
  CheckCircle,
  AlertCircle,
  Zap,
  Globe,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { parsePriceTable, parseCoverage, type ParsedLane, type ParsedCoverage } from "@/lib/freight/parse";
import { readFileToRows, readAllSheets, downloadPriceTemplate } from "@/lib/freight/client-parse";
import { FreightCarrier, CarrierTable } from "./types";

const emptyCarrier = (): Partial<FreightCarrier> => ({
  name: "",
  phone: "",
  email: "",
  website: "",
  notes: "",
});

// Transportadoras integradas via API em tempo real (config no servidor;
// contatos editáveis vêm da linha em freight_carriers com api_slug)
interface ApiCarrier {
  id: string;
  name: string;
  enabled: boolean;
  modal: string;
  tipo_frete: string;
  cnpj_remetente: string | null;
  origin_label: string;
  website: string | null;
  db: FreightCarrier | null;
}

const formatCnpj = (v: string) =>
  v.length === 14 ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}` : v;

export default function TablesTab({
  carriers,
  loading,
  refresh,
}: {
  carriers: FreightCarrier[];
  loading: boolean;
  refresh: () => void;
}) {
  const [tables, setTables] = useState<CarrierTable[]>([]);
  const [coverageCounts, setCoverageCounts] = useState<Record<string, number>>({});
  const [apiCarriers, setApiCarriers] = useState<ApiCarrier[]>([]);

  const fetchApiCarriers = useCallback(() => {
    fetch("/api/freight/api-carriers")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setApiCarriers(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchApiCarriers();
  }, [fetchApiCarriers]);

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch("/api/freight/tables");
      if (res.ok) setTables(await res.json());
      // coverage counts per carrier
      const counts: Record<string, number> = {};
      await Promise.all(
        carriers.map(async (c) => {
          const r = await fetch(`/api/freight/coverage?carrier_id=${c.id}`);
          if (r.ok) counts[c.id] = ((await r.json()) as unknown[]).length;
        }),
      );
      setCoverageCounts(counts);
    } catch {
      /* ignore */
    }
  }, [carriers]);

  useEffect(() => {
    if (carriers.length) fetchTables();
  }, [carriers, fetchTables]);

  // ── carrier dialog ──────────────────────────────────────────────────────────
  const [cDialog, setCDialog] = useState(false);
  const [cEdit, setCEdit] = useState<FreightCarrier | null>(null);
  const [cForm, setCForm] = useState<Partial<FreightCarrier>>(emptyCarrier());

  const openCarrier = (c?: FreightCarrier) => {
    setCEdit(c || null);
    setCForm(c ? { ...c } : emptyCarrier());
    setCDialog(true);
  };
  const saveCarrier = async () => {
    if (!cForm.name) return toast.error("Nome é obrigatório");
    const method = cEdit ? "PUT" : "POST";
    const url = cEdit ? `/api/freight/carriers/${cEdit.id}` : "/api/freight/carriers";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cForm),
    });
    if (!res.ok) return toast.error("Erro ao salvar transportadora");
    toast.success(cEdit ? "Transportadora atualizada" : "Transportadora criada");
    setCDialog(false);
    refresh();
    fetchApiCarriers();
  };
  const deleteCarrier = async (id: string) => {
    if (!confirm("Excluir esta transportadora, suas tabelas e cobertura?")) return;
    const res = await fetch(`/api/freight/carriers/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Erro ao excluir");
    toast.success("Transportadora excluída");
    refresh();
  };

  const deleteTable = async (id: string) => {
    if (!confirm("Excluir esta tabela de preços e todas as rotas?")) return;
    const res = await fetch(`/api/freight/tables/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Erro ao excluir");
    toast.success("Tabela excluída");
    fetchTables();
  };

  // ── price-table import dialog ───────────────────────────────────────────────
  const [pImport, setPImport] = useState<{ carrier: FreightCarrier } | null>(null);
  const [pName, setPName] = useState("");
  const [pOrigin, setPOrigin] = useState("");
  const [pCubage, setPCubage] = useState("300");
  const [pIcms, setPIcms] = useState("12");
  const [pLanes, setPLanes] = useState<ParsedLane[]>([]);
  const [pWarn, setPWarn] = useState<string[]>([]);
  const [pSaving, setPSaving] = useState(false);
  const pFileRef = useRef<HTMLInputElement>(null);

  const openPriceImport = (carrier: FreightCarrier) => {
    setPImport({ carrier });
    setPName("");
    setPOrigin("");
    setPCubage("300");
    setPIcms("12");
    setPLanes([]);
    setPWarn([]);
  };

  const onPriceFile = async (file: File) => {
    try {
      const rows = await readFileToRows(file);
      const parsed = parsePriceTable(rows);
      setPLanes(parsed.lanes);
      setPWarn(parsed.warnings);
      if (parsed.origin_label && !pOrigin) setPOrigin(parsed.origin_label);
      if (!pName) setPName(file.name.replace(/\.[^.]+$/, ""));
      const valid = parsed.lanes.filter((l) => l.valid).length;
      if (valid === 0) toast.error("Nenhuma rota válida detectada. Confira o modelo.");
      else toast.success(`${valid} rota(s) detectada(s). Revise e salve.`);
    } catch {
      toast.error("Erro ao ler o arquivo. Use CSV ou Excel.");
    }
  };

  const savePriceImport = async () => {
    if (!pImport) return;
    const valid = pLanes.filter((l) => l.valid);
    if (!pName.trim()) return toast.error("Dê um nome à tabela");
    if (valid.length === 0) return toast.error("Nenhuma rota válida para salvar");
    setPSaving(true);
    try {
      const tRes = await fetch("/api/freight/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier_id: pImport.carrier.id,
          name: pName.trim(),
          origin_label: pOrigin.trim() || null,
          cubage_kg_per_m3: parseFloat(pCubage) || 300,
          icms_rate: (parseFloat(pIcms.replace(",", ".")) || 0) / 100,
        }),
      });
      const table = await tRes.json();
      if (!tRes.ok) {
        toast.error(table.error || "Erro ao criar tabela");
        return;
      }
      const lRes = await fetch(`/api/freight/tables/${table.id}/lanes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lanes: valid, replace: true }),
      });
      const lJson = await lRes.json();
      if (!lRes.ok) {
        toast.error(lJson.error || "Erro ao importar rotas");
        return;
      }
      toast.success(`Tabela "${pName}" criada com ${lJson.lanes_imported} rota(s).`);
      setPImport(null);
      fetchTables();
    } catch {
      toast.error("Erro ao salvar tabela");
    } finally {
      setPSaving(false);
    }
  };

  // ── coverage import dialog ──────────────────────────────────────────────────
  const [covImport, setCovImport] = useState<{ carrier: FreightCarrier } | null>(null);
  const [covRows, setCovRows] = useState<ParsedCoverage[]>([]);
  const [covWarn, setCovWarn] = useState<string[]>([]);
  const [covSaving, setCovSaving] = useState(false);
  const covFileRef = useRef<HTMLInputElement>(null);

  const onCoverageFile = async (file: File) => {
    try {
      const sheets = await readAllSheets(file);
      const byKey = new Map<string, ParsedCoverage>();
      const warns: string[] = [];
      for (const s of sheets) {
        const parsed = parseCoverage(s.rows);
        parsed.rows.forEach((r) => byKey.set(`${r.city}|${r.uf ?? ""}`, r));
      }
      const merged = [...byKey.values()];
      setCovRows(merged);
      setCovWarn(warns);
      if (merged.length === 0) toast.error("Nenhuma praça detectada.");
      else toast.success(`${merged.length} praça(s) detectada(s).`);
    } catch {
      toast.error("Erro ao ler o arquivo.");
    }
  };

  const saveCoverageImport = async () => {
    if (!covImport || covRows.length === 0) return;
    setCovSaving(true);
    try {
      const res = await fetch("/api/freight/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier_id: covImport.carrier.id, rows: covRows, replace: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Erro ao importar praças");
        return;
      }
      toast.success(`${json.coverage_imported} praça(s) importada(s).`);
      setCovImport(null);
      setCovRows([]);
      fetchTables();
    } catch {
      toast.error("Erro ao salvar praças");
    } finally {
      setCovSaving(false);
    }
  };

  const carrierTables = (id: string) => tables.filter((t) => t.carrier_id === id);
  const pValidCount = pLanes.filter((l) => l.valid).length;
  const covTdaCount = covRows.filter((r) => r.tda_value != null).length;

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-semibold">Transportadoras & Tabelas</h2>
          <p className="text-xs text-muted-foreground">
            Cadastre transportadoras e importe suas tabelas de preço (rotas + faixas de peso) e a
            relação de praças (prazo e TDA).
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={downloadPriceTemplate}>
            <Download className="h-4 w-4 mr-1" /> Modelo de tabela
          </Button>
          <Button size="sm" onClick={() => openCarrier()}>
            <Plus className="h-4 w-4 mr-1" /> Nova Transportadora
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : carriers.length === 0 && apiCarriers.length === 0 ? (
        <Card className="flex items-center justify-center min-h-[180px] border-dashed">
          <div className="text-center text-muted-foreground space-y-2">
            <Truck className="h-8 w-8 mx-auto opacity-30" />
            <p className="text-sm">Nenhuma transportadora cadastrada</p>
            <Button size="sm" variant="outline" onClick={() => openCarrier()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {carriers.map((carrier) => {
            const cts = carrierTables(carrier.id);
            return (
              <Card key={carrier.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold">{carrier.name}</h3>
                        <Badge variant={carrier.active ? "default" : "secondary"} className="text-xs">
                          {carrier.active ? "Ativa" : "Inativa"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {cts.length} tabela(s)
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {coverageCounts[carrier.id] ?? 0} praça(s)
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {carrier.phone && (
                          <span className="flex items-center gap-1">
                            <PhoneCall className="h-3 w-3" /> {carrier.phone}
                          </span>
                        )}
                        {carrier.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {carrier.email}
                          </span>
                        )}
                      </div>
                      {carrier.notes && (
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                          {carrier.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openCarrier(carrier)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteCarrier(carrier.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* tables list */}
                  <div className="mt-3 pt-3 border-t space-y-2">
                    {cts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma tabela de preços importada.</p>
                    ) : (
                      cts.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Table2 className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium truncate">{t.name}</span>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {t.lane_count ?? 0} rotas
                            </Badge>
                            {t.origin_label && (
                              <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                                origem: {t.origin_label}
                              </span>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                            onClick={() => deleteTable(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openPriceImport(carrier)}>
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Importar tabela de preços
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCovImport({ carrier })}>
                        <MapPinned className="h-3.5 w-3.5 mr-1" /> Importar praças
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* carriers integrated via live API — read-only, config comes from the server */}
          {apiCarriers.map((ac) => (
            <Card key={ac.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold">{ac.name}</h3>
                      <Badge variant={ac.enabled ? "default" : "secondary"} className="text-xs">
                        {ac.enabled ? "Ativa" : "Não configurada"}
                      </Badge>
                      <Badge className="text-xs bg-blue-600 hover:bg-blue-600 text-white">
                        <Zap className="h-3 w-3 mr-1" /> API · tempo real
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Truck className="h-3 w-3" /> {ac.modal} · Frete {ac.tipo_frete}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> origem: {ac.origin_label}
                      </span>
                      {ac.cnpj_remetente && (
                        <span>CNPJ remetente: {formatCnpj(ac.cnpj_remetente)}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                      {ac.db?.phone && (
                        <span className="flex items-center gap-1">
                          <PhoneCall className="h-3 w-3" /> {ac.db.phone}
                        </span>
                      )}
                      {ac.db?.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {ac.db.email}
                        </span>
                      )}
                      {ac.website && (
                        <a
                          href={ac.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:underline"
                        >
                          <Globe className="h-3 w-3" /> {ac.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </div>
                    {ac.db?.notes && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                        {ac.db.notes}
                      </p>
                    )}
                  </div>
                  {ac.db && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openCarrier(ac.db!)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Cotação em tempo real via API — não usa tabelas importadas. Preço e prazo são
                    retornados pela transportadora no momento da cotação, com impostos e taxas
                    inclusos.
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Carrier dialog ── */}
      <Dialog open={cDialog} onOpenChange={setCDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{cEdit ? "Editar Transportadora" : "Nova Transportadora"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                placeholder="Ex: TRANSDUARTE"
                value={cForm.name || ""}
                onChange={(e) => setCForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input
                  value={cForm.phone || ""}
                  onChange={(e) => setCForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={cForm.email || ""}
                  onChange={(e) => setCForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea
                rows={2}
                value={cForm.notes || ""}
                onChange={(e) => setCForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {cEdit && !cEdit.api_slug && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="carrier-active"
                  checked={cForm.active ?? true}
                  onChange={(e) => setCForm((f) => ({ ...f, active: e.target.checked }))}
                  className="h-4 w-4"
                />
                <Label htmlFor="carrier-active">Transportadora ativa</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCarrier}>{cEdit ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Price-table import dialog ── */}
      <Dialog open={!!pImport} onOpenChange={(o) => !o && setPImport(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Importar Tabela de Preços — {pImport?.carrier.name}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nome da tabela *</Label>
              <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Ex: Tabela 1/A 2026" />
            </div>
            <div className="space-y-1">
              <Label>Origem (praça)</Label>
              <Input value={pOrigin} onChange={(e) => setPOrigin(e.target.value)} placeholder="NOVO HAMBURGO-93300" />
            </div>
            <div className="space-y-1">
              <Label>Cubagem (kg/m³)</Label>
              <Input value={pCubage} onChange={(e) => setPCubage(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ICMS padrão (%)</Label>
              <Input value={pIcms} onChange={(e) => setPIcms(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-5 text-center space-y-2 mt-2">
            <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium">Selecione o CSV/Excel da tabela</p>
            <p className="text-xs text-muted-foreground">
              Use o <button className="underline" onClick={downloadPriceTemplate}>modelo</button> para
              garantir a leitura de todas as colunas (faixas, advalorem, pedágio, taxas, GRIS, TA).
            </p>
            <input
              ref={pFileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onPriceFile(e.target.files[0])}
            />
            <Button variant="outline" size="sm" onClick={() => pFileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Selecionar arquivo
            </Button>
          </div>

          {pWarn.length > 0 && (
            <div className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              {pWarn.map((w, i) => (
                <p key={i} className="flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}

          {pLanes.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">
                {pValidCount} rota(s) válida(s)
                {pLanes.length - pValidCount > 0 && (
                  <span className="text-destructive ml-2">
                    · {pLanes.length - pValidCount} ignorada(s)
                  </span>
                )}
              </p>
              <div className="max-h-56 overflow-y-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="text-muted-foreground">
                      <th className="text-left p-2">Destino</th>
                      <th className="text-left p-2">CEP</th>
                      <th className="text-right p-2">até 10kg</th>
                      <th className="text-right p-2">até 100kg</th>
                      <th className="text-center p-2">Faixas</th>
                      <th className="text-center p-2">OK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pLanes.slice(0, 200).map((l, i) => (
                      <tr key={i} className={`border-t ${!l.valid ? "bg-destructive/5" : ""}`}>
                        <td className="p-2 font-medium">{l.dest_city || "—"}</td>
                        <td className="p-2 text-muted-foreground">{l.dest_cep_prefix || "—"}</td>
                        <td className="p-2 text-right">{l.brackets[0]?.price?.toFixed(2) ?? "—"}</td>
                        <td className="p-2 text-right">
                          {l.brackets[l.brackets.length - 1]?.price?.toFixed(2) ?? "—"}
                        </td>
                        <td className="p-2 text-center">{l.brackets.length}</td>
                        <td className="p-2 text-center">
                          {l.valid ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500 mx-auto" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-destructive mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPImport(null)}>
              Cancelar
            </Button>
            <Button onClick={savePriceImport} disabled={pSaving || pValidCount === 0}>
              {pSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                <>Salvar tabela ({pValidCount})</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Coverage import dialog ── */}
      <Dialog open={!!covImport} onOpenChange={(o) => !o && (setCovImport(null), setCovRows([]))}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPinned className="h-5 w-5 text-primary" />
              Importar Praças — {covImport?.carrier.name}
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-5 text-center space-y-2">
            <MapPinned className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium">Selecione a planilha de praças (CSV/Excel)</p>
            <p className="text-xs text-muted-foreground">
              Colunas esperadas: CIDADE, FILIAL, PERC (CEP), KM, UF, FREQUÊNCIA, PRAZO/MIN/MAX e T.D.A.
              Todas as abas são lidas.
            </p>
            <input
              ref={covFileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onCoverageFile(e.target.files[0])}
            />
            <Button variant="outline" size="sm" onClick={() => covFileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Selecionar arquivo
            </Button>
          </div>

          {covWarn.length > 0 &&
            covWarn.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1">
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
              </p>
            ))}

          {covRows.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">
                {covRows.length} praça(s) · {covTdaCount} com TDA
              </p>
              <div className="max-h-56 overflow-y-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="text-muted-foreground">
                      <th className="text-left p-2">Cidade</th>
                      <th className="text-left p-2">UF</th>
                      <th className="text-left p-2">Filial</th>
                      <th className="text-center p-2">Prazo</th>
                      <th className="text-right p-2">TDA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {covRows.slice(0, 300).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-medium">{r.city}</td>
                        <td className="p-2 text-muted-foreground">{r.uf || "—"}</td>
                        <td className="p-2 text-muted-foreground">{r.filial || "—"}</td>
                        <td className="p-2 text-center text-muted-foreground">
                          {r.prazo_min && r.prazo_max ? `${r.prazo_min}-${r.prazo_max}d` : "—"}
                        </td>
                        <td className="p-2 text-right">{r.tda_value != null ? r.tda_value : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => (setCovImport(null), setCovRows([]))}>
              Cancelar
            </Button>
            <Button onClick={saveCoverageImport} disabled={covSaving || covRows.length === 0}>
              {covSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                <>Salvar praças ({covRows.length})</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
