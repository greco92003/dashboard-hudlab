"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Search,
  Calendar,
  DollarSign,
  User,
  Building,
} from "lucide-react";

interface DealData {
  id: string;
  title: string;
  value: string;
  currency: string;
  status: string;
  stage: string;
  owner: string;
  contact: string;
  organization: string;
  createdAt: string;
  updatedAt: string;
  customFields: Array<{
    fieldId: string;
    fieldValue: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

interface TestResult {
  success: boolean;
  message: string;
  searchDate: string;
  totalDealsFound: number;
  latestDeal?: DealData;
  allDealsToday?: Array<{
    id: string;
    title: string;
    value: string;
    createdAt: string;
  }>;
  debug?: {
    dealsUrl?: string;
    dealDetailUrl?: string;
    customFieldsUrl?: string;
    timestamp: string;
    environment?: {
      hasBaseUrl: boolean;
      hasApiToken: boolean;
      baseUrl: string;
      apiTokenLength: number;
    };
  };
}

export default function LatestDealTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/test/latest-deal-today");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Test failed");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("pt-BR");
  };

  const formatCurrency = (value: string, currency: string = "BRL") => {
    const numValue = parseFloat(value) / 100; // ActiveCampaign stores values in cents
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency === "usd" ? "USD" : "BRL",
    }).format(numValue);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">
          Teste: Último Negócio Criado Hoje
        </h1>
        <p className="text-muted-foreground">
          Busca o último negócio adicionado no ActiveCampaign em 08/06/2025
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Executar Teste
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={runTest} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Buscando último negócio...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Buscar Último Negócio de Hoje
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-6 border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Erro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Resumo da Busca
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Data de Busca</p>
                  <p className="font-semibold">{result.searchDate}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total de Negócios
                  </p>
                  <p className="font-semibold">{result.totalDealsFound}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={result.success ? "default" : "destructive"}>
                    {result.success ? "Sucesso" : "Erro"}
                  </Badge>
                </div>
              </div>
              <p className="mt-4 text-sm">{result.message}</p>
            </CardContent>
          </Card>

          {/* Latest Deal Details */}
          {result.latestDeal && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Último Negócio Criado (ID: {result.latestDeal.id})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Título</p>
                      <p className="font-semibold">{result.latestDeal.title}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Valor</p>
                      <p className="font-semibold text-green-600">
                        {formatCurrency(
                          result.latestDeal.value,
                          result.latestDeal.currency
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge>{result.latestDeal.status}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Estágio</p>
                      <p className="font-semibold">{result.latestDeal.stage}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Criado em</p>
                      <p className="font-semibold">
                        {formatDate(result.latestDeal.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Atualizado em
                      </p>
                      <p className="font-semibold">
                        {formatDate(result.latestDeal.updatedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Proprietário
                      </p>
                      <p className="font-semibold">{result.latestDeal.owner}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Contato</p>
                      <p className="font-semibold">
                        {result.latestDeal.contact}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Custom Fields */}
                {result.latestDeal.customFields &&
                  result.latestDeal.customFields.length > 0 && (
                    <div className="mt-6">
                      <h4 className="font-semibold mb-3">
                        Campos Personalizados
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {result.latestDeal.customFields.map((field, index) => (
                          <div key={index} className="p-3 bg-muted rounded-lg">
                            <p className="text-sm text-muted-foreground">
                              Campo ID: {field.fieldId}
                            </p>
                            <p className="font-semibold">{field.fieldValue}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

          {/* All Deals Today */}
          {result.allDealsToday && result.allDealsToday.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Todos os Negócios de Hoje</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.allDealsToday.map((deal) => (
                    <div
                      key={deal.id}
                      className="flex justify-between items-center p-3 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="font-semibold">{deal.title}</p>
                        <p className="text-sm text-muted-foreground">
                          ID: {deal.id}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">
                          {formatCurrency(deal.value)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(deal.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Debug Information */}
          {result.debug && (
            <Card>
              <CardHeader>
                <CardTitle>Informações de Debug</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {result.debug.dealsUrl && (
                    <div>
                      <p className="text-muted-foreground">
                        URL de Busca de Negócios:
                      </p>
                      <p className="font-mono bg-muted p-2 rounded break-all">
                        {result.debug.dealsUrl}
                      </p>
                    </div>
                  )}
                  {result.latestDeal && result.debug.dealDetailUrl && (
                    <div>
                      <p className="text-muted-foreground">
                        URL de Detalhes do Negócio:
                      </p>
                      <p className="font-mono bg-muted p-2 rounded break-all">
                        {result.debug.dealDetailUrl}
                      </p>
                    </div>
                  )}
                  {result.latestDeal && result.debug.customFieldsUrl && (
                    <div>
                      <p className="text-muted-foreground">
                        URL de Campos Personalizados:
                      </p>
                      <p className="font-mono bg-muted p-2 rounded break-all">
                        {result.debug.customFieldsUrl}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Timestamp:</p>
                    <p className="font-mono">
                      {formatDate(result.debug.timestamp)}
                    </p>
                  </div>
                  {result.debug.environment && (
                    <div>
                      <p className="text-muted-foreground">
                        Configuração da API:
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              result.debug.environment.hasBaseUrl
                                ? "default"
                                : "destructive"
                            }
                          >
                            {result.debug.environment.hasBaseUrl ? "✓" : "✗"}
                          </Badge>
                          <span>Base URL</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              result.debug.environment.hasApiToken
                                ? "default"
                                : "destructive"
                            }
                          >
                            {result.debug.environment.hasApiToken ? "✓" : "✗"}
                          </Badge>
                          <span>
                            API Token ({result.debug.environment.apiTokenLength}{" "}
                            chars)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
