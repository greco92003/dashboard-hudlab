"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreditCard, Save, Info } from "lucide-react";
import { DEFAULT_NUVEM_PAGO_FEES, PaymentFeeConfig } from "@/lib/payment-fees";
import { CabecalhoDaPagina } from "@/components/hud/pagina";

export default function PaymentFeesConfigPage() {
  const [config, setConfig] = useState<PaymentFeeConfig>(
    DEFAULT_NUVEM_PAGO_FEES,
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load saved config from localStorage
    const saved = localStorage.getItem("payment_fee_config");
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (error) {
        console.error("Error loading payment fee config:", error);
      }
    }
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    try {
      localStorage.setItem("payment_fee_config", JSON.stringify(config));
      toast.success("Configuração de taxas salva com sucesso!");
    } catch (error) {
      toast.error("Erro ao salvar configuração");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_NUVEM_PAGO_FEES);
    localStorage.removeItem("payment_fee_config");
    toast.success("Configuração resetada para valores padrão");
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      <CabecalhoDaPagina
        icone={CreditCard}
        titulo="Configuração de Taxas de Pagamento"
        descricao="Configure as taxas do Nuvem Pago para cálculo estimado de custos"
      />

      <Card className="tone-sky hud-tone-card">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="tone-sky hud-tone-text h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold mb-2">Importante:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Estas são taxas ESTIMADAS para cálculos internos</li>
                <li>
                  Os valores reais podem variar conforme seu contrato com o
                  Nuvem Pago
                </li>
                <li>
                  Atualize estas taxas regularmente conforme mudanças no
                  contrato
                </li>
                <li>Para valores exatos, consulte o painel do Nuvem Pago</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* PIX */}
        <Card>
          <CardHeader>
            <CardTitle>PIX</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="pixFeePercentage">Taxa (%)</Label>
              <Input
                id="pixFeePercentage"
                type="number"
                step="0.01"
                value={config.pixFeePercentage}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    pixFeePercentage: parseFloat(e.target.value) || 0,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Percentual cobrado por transação PIX
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Boleto */}
        <Card>
          <CardHeader>
            <CardTitle>Boleto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="boletoFixedFee">Taxa Fixa (R$)</Label>
              <Input
                id="boletoFixedFee"
                type="number"
                step="0.01"
                value={config.boletoFixedFee}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    boletoFixedFee: parseFloat(e.target.value) || 0,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Valor fixo cobrado por boleto
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Credit Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Cartão de Crédito</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="creditCardPercentage">Taxa (%)</Label>
                <Input
                  id="creditCardPercentage"
                  type="number"
                  step="0.01"
                  value={config.creditCardPercentage}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      creditCardPercentage: parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Percentual por transação
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="creditCardFixedFee">Taxa Fixa (R$)</Label>
                <Input
                  id="creditCardFixedFee"
                  type="number"
                  step="0.01"
                  value={config.creditCardFixedFee}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      creditCardFixedFee: parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Valor fixo por transação
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Max Interest-Free Installments */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Parcelamento sem Juros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="maxInterestFreeInstallments">
                Máximo de parcelas sem juros
              </Label>
              <Input
                id="maxInterestFreeInstallments"
                type="number"
                step="1"
                min="1"
                max="12"
                value={config.maxInterestFreeInstallments}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    maxInterestFreeInstallments: parseInt(e.target.value) || 1,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Número máximo de parcelas sem juros oferecidas ao cliente (o
                lojista absorve os juros)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          Salvar Configuração
        </Button>
        <Button variant="outline" onClick={handleReset}>
          Resetar para Padrão
        </Button>
      </div>
    </div>
  );
}
