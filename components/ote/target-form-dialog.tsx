"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OTEMonthlyTarget } from "@/types/ote";
import { Loader2 } from "lucide-react";

interface TargetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target?: OTEMonthlyTarget;
  onSuccess: () => void;
}

const MONTHS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

export function TargetFormDialog({
  open,
  onOpenChange,
  target,
  onSuccess,
}: TargetFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [formData, setFormData] = useState({
    month: target?.month || currentMonth,
    year: target?.year || currentYear,
    target_amount: target?.target_amount || 0,
  });

  // Atualizar formData quando target mudar
  useEffect(() => {
    if (target) {
      setFormData({
        month: target.month,
        year: target.year,
        target_amount: target.target_amount,
      });
    } else {
      setFormData({
        month: currentMonth,
        year: currentYear,
        target_amount: 0,
      });
    }
  }, [target, currentMonth, currentYear]);

  // Limpar erro quando abrir/fechar
  useEffect(() => {
    if (!open) {
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = "/api/ote/targets";
      const method = target ? "PATCH" : "POST";
      const body = target
        ? { id: target.id, target_amount: formData.target_amount }
        : formData;

      console.log("Enviando meta:", { method, body });

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao salvar meta");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao salvar meta:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {target ? "Editar Meta" : "Nova Meta Mensal"}
          </DialogTitle>
          <DialogDescription>
            {target
              ? "Atualize o valor da meta mensal da empresa"
              : "Defina a meta mensal da empresa. Todos os vendedores trabalham juntos para atingir essa meta."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Month */}
            {!target && (
              <div className="grid gap-2">
                <Label htmlFor="month">
                  Mês <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.month.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, month: parseInt(value) })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem
                        key={month.value}
                        value={month.value.toString()}
                      >
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Year */}
            {!target && (
              <div className="grid gap-2">
                <Label htmlFor="year">
                  Ano <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="year"
                  type="number"
                  min="2020"
                  max="2100"
                  value={formData.year}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      year: parseInt(e.target.value) || currentYear,
                    })
                  }
                  required
                />
              </div>
            )}

            {/* Target Amount */}
            <div className="grid gap-2">
              <Label htmlFor="target_amount">
                Valor da Meta (R$) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="target_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.target_amount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    target_amount: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="150000.00"
                required
              />
              <p className="text-xs text-muted-foreground">
                Valor total de vendas esperado no mês
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {target ? "Atualizar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
