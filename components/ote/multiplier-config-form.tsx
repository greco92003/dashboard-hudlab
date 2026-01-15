"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OTEMultiplier } from "@/types/ote";
import { Plus, Trash2, Save, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MultiplierConfigFormProps {
  initialMultipliers: OTEMultiplier[];
  onSave: (multipliers: OTEMultiplier[]) => Promise<void>;
}

export function MultiplierConfigForm({
  initialMultipliers,
  onSave,
}: MultiplierConfigFormProps) {
  const [multipliers, setMultipliers] =
    useState<OTEMultiplier[]>(initialMultipliers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setMultipliers(initialMultipliers);
  }, [initialMultipliers]);

  const handleAddMultiplier = () => {
    const lastMultiplier = multipliers[multipliers.length - 1];
    const newMin = lastMultiplier ? lastMultiplier.max + 1 : 0;

    setMultipliers([
      ...multipliers,
      { min: newMin, max: newMin + 10, multiplier: 0 },
    ]);
  };

  const handleRemoveMultiplier = (index: number) => {
    if (multipliers.length <= 1) {
      setError("Deve haver pelo menos uma faixa de multiplicador");
      return;
    }
    setMultipliers(multipliers.filter((_, i) => i !== index));
  };

  const handleUpdateMultiplier = (
    index: number,
    field: keyof OTEMultiplier,
    value: number
  ) => {
    const updated = [...multipliers];
    updated[index] = { ...updated[index], [field]: value };
    setMultipliers(updated);
  };

  const validateMultipliers = (): string | null => {
    // Ordenar por min
    const sorted = [...multipliers].sort((a, b) => a.min - b.min);

    // Verificar se começa em 0
    if (sorted[0].min !== 0) {
      return "A primeira faixa deve começar em 0%";
    }

    // Verificar continuidade e sobreposição
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].max >= sorted[i + 1].min) {
        return `Faixas ${i + 1} e ${i + 2} se sobrepõem ou têm lacunas`;
      }
      if (sorted[i].max + 1 !== sorted[i + 1].min) {
        return `Há uma lacuna entre as faixas ${i + 1} e ${i + 2}`;
      }
    }

    return null;
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    // Validar
    const validationError = validateMultipliers();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await onSave(multipliers.sort((a, b) => a.min - b.min));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar configurações");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg">
          Configuração de Multiplicadores
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Defina as faixas de percentual de cumprimento da meta e seus
          respectivos multiplicadores
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 text-green-900 border-green-200">
            <AlertDescription>
              Configurações salvas com sucesso!
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2 sm:space-y-3">
          {multipliers
            .sort((a, b) => a.min - b.min)
            .map((m, index) => (
              <div
                key={index}
                className="flex items-end gap-2 sm:gap-3 p-3 sm:p-4 border rounded-lg bg-muted/50"
              >
                <div className="flex-1 grid grid-cols-3 gap-2 sm:gap-3">
                  <div>
                    <Label htmlFor={`min-${index}`} className="text-xs">
                      Mín (%)
                    </Label>
                    <Input
                      id={`min-${index}`}
                      type="number"
                      value={m.min}
                      onChange={(e) =>
                        handleUpdateMultiplier(
                          index,
                          "min",
                          parseFloat(e.target.value)
                        )
                      }
                      min={0}
                      step={1}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`max-${index}`} className="text-xs">
                      Máx (%)
                    </Label>
                    <Input
                      id={`max-${index}`}
                      type="number"
                      value={m.max}
                      onChange={(e) =>
                        handleUpdateMultiplier(
                          index,
                          "max",
                          parseFloat(e.target.value)
                        )
                      }
                      min={m.min}
                      step={1}
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor={`multiplier-${index}`} className="text-xs">
                      Multiplicador
                    </Label>
                    <Input
                      id={`multiplier-${index}`}
                      type="number"
                      value={m.multiplier}
                      onChange={(e) =>
                        handleUpdateMultiplier(
                          index,
                          "multiplier",
                          parseFloat(e.target.value)
                        )
                      }
                      min={0}
                      step={0.1}
                      className="text-sm"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveMultiplier(index)}
                  disabled={multipliers.length <= 1}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 sm:h-10 sm:w-10"
                >
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
            ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleAddMultiplier}
            className="flex-1 text-xs sm:text-sm"
          >
            <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            Adicionar Faixa
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 text-xs sm:text-sm"
          >
            {loading ? (
              <>Salvando...</>
            ) : (
              <>
                <Save className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>

        {/* Preview Visual */}
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 border rounded-lg bg-background">
          <h4 className="font-semibold mb-2 sm:mb-3 text-xs sm:text-sm">
            Preview das Faixas
          </h4>
          <div className="space-y-1 sm:space-y-2">
            {multipliers
              .sort((a, b) => a.min - b.min)
              .map((m, index) => {
                const getColor = (mult: number) => {
                  if (mult === 0) return "text-red-600";
                  if (mult < 1) return "text-orange-600";
                  if (mult === 1) return "text-blue-600";
                  if (mult < 2) return "text-green-600";
                  return "text-purple-600";
                };

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between text-xs sm:text-sm"
                  >
                    <span className="font-medium">
                      {m.min}% - {m.max === 999 ? "+∞" : `${m.max}%`}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span
                      className={`font-bold text-base sm:text-lg ${getColor(
                        m.multiplier
                      )}`}
                    >
                      {m.multiplier.toFixed(1)}x
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
