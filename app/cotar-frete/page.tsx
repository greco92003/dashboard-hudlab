"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Truck, Box } from "lucide-react";
import { toast } from "sonner";
import QuoteTab from "./_components/quote-tab";
import TablesTab from "./_components/tables-tab";
import VolumesTab from "./_components/volumes-tab";
import { FreightVolume, FreightCarrier } from "./_components/types";

export default function CotarFretePage() {
  const [volumes, setVolumes] = useState<FreightVolume[]>([]);
  const [carriers, setCarriers] = useState<FreightCarrier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, cRes] = await Promise.all([
        fetch("/api/freight/volumes"),
        fetch("/api/freight/carriers"),
      ]);
      if (vRes.ok) setVolumes(await vRes.json());
      if (cRes.ok) setCarriers(await cRes.json());
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" /> Cotar Frete
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Cotação de frete fracionado — importe as tabelas das transportadoras (rotas, faixas de
          peso e taxas) e cote por destino, volumes e valor da NF.
        </p>
      </div>

      <Tabs defaultValue="quotation" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="quotation" className="gap-2">
            <Calculator className="h-4 w-4" /> Cotação
          </TabsTrigger>
          <TabsTrigger value="tables" className="gap-2">
            <Truck className="h-4 w-4" /> Transportadoras & Tabelas
          </TabsTrigger>
          <TabsTrigger value="volumes" className="gap-2">
            <Box className="h-4 w-4" /> Volumes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quotation">
          <QuoteTab volumes={volumes} />
        </TabsContent>

        <TabsContent value="tables">
          <TablesTab carriers={carriers} loading={loading} refresh={fetchAll} />
        </TabsContent>

        <TabsContent value="volumes">
          <VolumesTab volumes={volumes} loading={loading} refresh={fetchAll} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
