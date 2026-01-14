"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, AlertCircle, TrendingUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TrafficConfigFormProps {
  paidTrafficPercentage: number;
  organicPercentage: number;
  onSave: (paidTraffic: number, organic: number) => Promise<void>;
}

export function TrafficConfigForm({
  paidTrafficPercentage,
  organicPercentage,
  onSave,
}: TrafficConfigFormProps) {
  const [paidTraffic, setPaidTraffic] = useState(paidTrafficPercentage);
  const [organic, setOrganic] = useState(organicPercentage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setPaidTraffic(paidTrafficPercentage);
    setOrganic(organicPercentage);
  }, [paidTrafficPercentage, organicPercentage]);

  const total = paidTraffic + organic;
  const isValid = total === 100;

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    if (!isValid) {
      setError("A soma das porcentagens deve ser 100%");
      return;
    }

    setLoading(true);
    try {
      await onSave(paidTraffic, organic);
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
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          <CardTitle>Distribuição de Tráfego</CardTitle>
        </div>
        <CardDescription>
          Defina a porcentagem de vendas provenientes de tráfego pago vs. orgânico
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 text-green-900 border-green-200">
            <AlertDescription>Configurações salvas com sucesso!</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="paid-traffic">Tráfego Pago (%)</Label>
            <Input
              id="paid-traffic"
              type="number"
              value={paidTraffic}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0;
                setPaidTraffic(value);
                setOrganic(100 - value);
              }}
              min={0}
              max={100}
              step={1}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="organic">Tráfego Orgânico (%)</Label>
            <Input
              id="organic"
              type="number"
              value={organic}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0;
                setOrganic(value);
                setPaidTraffic(100 - value);
              }}
              min={0}
              max={100}
              step={1}
            />
          </div>
        </div>

        {/* Indicador Visual */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total:</span>
            <span className={`font-semibold ${isValid ? "text-green-600" : "text-red-600"}`}>
              {total.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
            <div
              className="bg-blue-500 transition-all"
              style={{ width: `${paidTraffic}%` }}
            />
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${organic}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Pago: {paidTraffic.toFixed(0)}%</span>
            <span>Orgânico: {organic.toFixed(0)}%</span>
          </div>
        </div>

        <Button onClick={handleSave} disabled={loading || !isValid} className="w-full">
          {loading ? (
            <>Salvando...</>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar Configurações
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

