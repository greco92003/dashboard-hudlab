"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Box, Package, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { FreightVolume } from "./types";

const empty = (): Partial<FreightVolume> => ({
  name: "",
  pairs_capacity: 0,
  weight_kg: null,
  width_cm: null,
  height_cm: null,
  depth_cm: null,
});

export default function VolumesTab({
  volumes,
  loading,
  refresh,
}: {
  volumes: FreightVolume[];
  loading: boolean;
  refresh: () => void;
}) {
  const [dialog, setDialog] = useState(false);
  const [edit, setEdit] = useState<FreightVolume | null>(null);
  const [form, setForm] = useState<Partial<FreightVolume>>(empty());

  const open = (v?: FreightVolume) => {
    setEdit(v || null);
    setForm(v ? { ...v } : empty());
    setDialog(true);
  };

  const save = async () => {
    if (!form.name || !form.pairs_capacity)
      return toast.error("Nome e capacidade são obrigatórios");
    const method = edit ? "PUT" : "POST";
    const url = edit ? `/api/freight/volumes/${edit.id}` : "/api/freight/volumes";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) return toast.error("Erro ao salvar volume");
    toast.success(edit ? "Volume atualizado" : "Volume criado");
    setDialog(false);
    refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este volume?")) return;
    const res = await fetch(`/api/freight/volumes/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Erro ao excluir");
    toast.success("Volume excluído");
    refresh();
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-semibold">Volumes de Embalagem</h2>
          <p className="text-xs text-muted-foreground">
            Cadastre cada tipo de caixa com seu <strong>peso</strong> e dimensões — são eles
            que definem o peso taxável na cotação.
          </p>
        </div>
        <Button size="sm" onClick={() => open()}>
          <Plus className="h-4 w-4 mr-1" /> Novo Volume
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : volumes.length === 0 ? (
        <Card className="flex items-center justify-center min-h-[180px] border-dashed">
          <div className="text-center text-muted-foreground space-y-2">
            <Box className="h-8 w-8 mx-auto opacity-30" />
            <p className="text-sm">Nenhum volume cadastrado</p>
            <Button size="sm" variant="outline" onClick={() => open()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {volumes.map((vol) => (
            <Card key={vol.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Box className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="font-semibold">{vol.name}</h3>
                      <Badge variant={vol.active ? "default" : "secondary"} className="text-xs">
                        {vol.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <div className="space-y-0.5 text-xs text-muted-foreground ml-6">
                      <p className="flex items-center gap-1">
                        <Package className="h-3 w-3" /> <strong>{vol.pairs_capacity}</strong> pares
                      </p>
                      {vol.weight_kg ? (
                        <p>Peso: {vol.weight_kg} kg</p>
                      ) : (
                        <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> sem peso
                        </p>
                      )}
                      {vol.width_cm && vol.height_cm && vol.depth_cm && (
                        <p>
                          Dimensões: {vol.width_cm}×{vol.height_cm}×{vol.depth_cm} cm
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => open(vol)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => remove(vol.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{edit ? "Editar Volume" : "Novo Volume"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                placeholder="Ex: Caixa 12 pares"
                value={form.name || ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Capacidade (pares) *</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Ex: 12"
                  value={form.pairs_capacity || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pairs_capacity: parseInt(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Peso (kg) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 5.5"
                  value={form.weight_kg ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weight_kg: parseFloat(e.target.value) || null }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["width_cm", "height_cm", "depth_cm"] as const).map((k, idx) => (
                <div className="space-y-1" key={k}>
                  <Label>{["Largura", "Altura", "Prof."][idx]} (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form[k] ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [k]: parseFloat(e.target.value) || null }))
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Dimensões são usadas para calcular o peso cubado (1 m³ = 300 kg).
            </p>
            {edit && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="vol-active"
                  checked={form.active ?? true}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  className="h-4 w-4"
                />
                <Label htmlFor="vol-active">Volume ativo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>{edit ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
