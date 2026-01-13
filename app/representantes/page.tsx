"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, UserCheck, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// Types from secondary database
interface Representante {
  id: number;
  nome_completo: string;
  vendedor: string;
  email: string;
  telefone: string;
  cpf: string;
  cnpj: string;
  estado_civil: string;
  chave_pix: string;
  endereco: string;
  rua_avenida: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  cep: string;
  contract_url?: string | null;
  created_at: string;
}

interface Afiliate {
  id: number;
  nome: string;
  sobrenome: string;
  email: string;
  telefone: string;
  instagram: string;
  cpf: string;
  cnpj?: string;
  chave_pix: string;
  affiliate_code: string;
  affiliate_link: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  created_at: string;
}

export default function RepresentantesPage() {
  const [representantes, setRepresentantes] = useState<Representante[]>([]);
  const [afiliados, setAfiliados] = useState<Afiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepresentante, setSelectedRepresentante] =
    useState<Representante | null>(null);
  const [selectedAfiliado, setSelectedAfiliado] = useState<Afiliate | null>(
    null
  );
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    console.log("RepresentantesPage mounted");
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("Fetching data from API...");

      // Fetch data from API route
      const response = await fetch("/api/representantes");

      if (!response.ok) {
        throw new Error("Failed to fetch data");
      }

      const data = await response.json();

      console.log("Representantes fetched:", data.representantes?.length || 0);
      console.log("Afiliados fetched:", data.afiliates?.length || 0);

      setRepresentantes(data.representantes || []);
      setAfiliados(data.afiliates || []);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (
      !event.target.files ||
      !event.target.files[0] ||
      !selectedRepresentante
    ) {
      return;
    }

    const file = event.target.files[0];
    setUploading(true);

    try {
      console.log("Starting file upload...");
      console.log("File:", file.name, "Size:", file.size);

      // Upload file to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${selectedRepresentante.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      console.log("Uploading to path:", filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("representantes-contratos")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      console.log("Upload successful:", uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("representantes-contratos")
        .getPublicUrl(filePath);

      console.log("Public URL:", urlData.publicUrl);

      // Update representante with contract URL via API
      const updateResponse = await fetch(
        "/api/representantes/update-contract",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            representanteId: selectedRepresentante.id,
            contractUrl: urlData.publicUrl,
          }),
        }
      );

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(errorData.error || "Failed to update contract URL");
      }

      console.log("Contract URL updated successfully");

      // Refresh data
      await fetchData();

      // Update selected representante
      setSelectedRepresentante({
        ...selectedRepresentante,
        contract_url: urlData.publicUrl,
      });

      alert("Contrato enviado com sucesso!");
    } catch (err: any) {
      console.error("Error uploading file:", err);
      alert("Erro ao enviar contrato: " + (err.message || "Erro desconhecido"));
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = "";
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold mb-6">
        Representantes e Afiliados
      </h1>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs Navigation */}
      <Tabs defaultValue="representantes" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger
            value="representantes"
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            Representantes
            <Badge variant="secondary">{representantes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="afiliados" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Afiliados
            <Badge variant="secondary">{afiliados.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Representantes Tab Content */}
        <TabsContent value="representantes">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : representantes.length === 0 ? (
            <Alert>
              <AlertDescription>
                Nenhum representante cadastrado.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {representantes.map((rep) => (
                <Card
                  key={rep.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelectedRepresentante(rep)}
                >
                  <CardHeader>
                    <CardTitle className="text-base">
                      {rep.nome_completo}
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Afiliados Tab Content */}
        <TabsContent value="afiliados">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : afiliados.length === 0 ? (
            <Alert>
              <AlertDescription>Nenhum afiliado cadastrado.</AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {afiliados.map((afil) => (
                <Card
                  key={afil.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelectedAfiliado(afil)}
                >
                  <CardHeader>
                    <CardTitle className="text-base">
                      {afil.nome} {afil.sobrenome}
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog for Representante Details */}
      <Dialog
        open={!!selectedRepresentante}
        onOpenChange={() => setSelectedRepresentante(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Detalhes do Representante
            </DialogTitle>
            <DialogDescription>
              Informações completas do representante
            </DialogDescription>
          </DialogHeader>

          {selectedRepresentante && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Nome Completo
                </Label>
                <p className="text-base">
                  {selectedRepresentante.nome_completo}
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Vendedor
                </Label>
                <p className="text-base">{selectedRepresentante.vendedor}</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Email
                </Label>
                <p className="text-base">{selectedRepresentante.email}</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Telefone
                </Label>
                <p className="text-base">{selectedRepresentante.telefone}</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  CPF
                </Label>
                <p className="text-base">{selectedRepresentante.cpf}</p>
              </div>

              {selectedRepresentante.cnpj && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    CNPJ
                  </Label>
                  <p className="text-base">{selectedRepresentante.cnpj}</p>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Estado Civil
                </Label>
                <p className="text-base">
                  {selectedRepresentante.estado_civil}
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Chave PIX
                </Label>
                <p className="text-base">{selectedRepresentante.chave_pix}</p>
              </div>

              <div className="md:col-span-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  Endereço
                </Label>
                <p className="text-base">
                  {selectedRepresentante.rua_avenida},{" "}
                  {selectedRepresentante.numero}
                  {selectedRepresentante.complemento &&
                    ` - ${selectedRepresentante.complemento}`}
                  <br />
                  {selectedRepresentante.bairro} -{" "}
                  {selectedRepresentante.cidade}
                  <br />
                  CEP: {selectedRepresentante.cep}
                </p>
              </div>

              <div className="md:col-span-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  Contrato
                </Label>
                {selectedRepresentante.contract_url ? (
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(
                          selectedRepresentante.contract_url!,
                          "_blank"
                        )
                      }
                    >
                      Ver Contrato
                    </Button>
                    <Label
                      htmlFor="contract-upload"
                      className="cursor-pointer text-sm text-blue-600 hover:underline"
                    >
                      Substituir contrato
                    </Label>
                  </div>
                ) : (
                  <Label
                    htmlFor="contract-upload"
                    className="cursor-pointer text-sm text-blue-600 hover:underline block mt-2"
                  >
                    Adicionar contrato
                  </Label>
                )}
                <Input
                  id="contract-upload"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
                {uploading && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Enviando...
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog for Afiliado Details */}
      <Dialog
        open={!!selectedAfiliado}
        onOpenChange={() => setSelectedAfiliado(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Detalhes do Afiliado
            </DialogTitle>
            <DialogDescription>
              Informações completas do afiliado
            </DialogDescription>
          </DialogHeader>

          {selectedAfiliado && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Nome
                </Label>
                <p className="text-base">
                  {selectedAfiliado.nome} {selectedAfiliado.sobrenome}
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Email
                </Label>
                <p className="text-base">{selectedAfiliado.email}</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Telefone
                </Label>
                <p className="text-base">{selectedAfiliado.telefone}</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Instagram
                </Label>
                <p className="text-base">@{selectedAfiliado.instagram}</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  CPF
                </Label>
                <p className="text-base">{selectedAfiliado.cpf}</p>
              </div>

              {selectedAfiliado.cnpj && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    CNPJ
                  </Label>
                  <p className="text-base">{selectedAfiliado.cnpj}</p>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Chave PIX
                </Label>
                <p className="text-base">{selectedAfiliado.chave_pix}</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Código de Afiliado
                </Label>
                <p className="text-base">{selectedAfiliado.affiliate_code}</p>
              </div>

              <div className="md:col-span-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  Endereço
                </Label>
                <p className="text-base">{selectedAfiliado.endereco}</p>
              </div>

              <div className="md:col-span-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  Link de Afiliado
                </Label>
                <p className="text-base break-all">
                  <a
                    href={selectedAfiliado.affiliate_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {selectedAfiliado.affiliate_link}
                  </a>
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
