"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { BarChart3, MessageSquareText, Palette } from "lucide-react";
import { DesignersPerformanceTab } from "@/components/designers/ghl-performance-tab";
import { MockupInstructionsTab } from "@/components/designers/mockup-instructions-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CabecalhoDaPagina } from "@/components/hud/pagina";

const DESIGNER_TABS = ["desempenho", "instrucoes-mockup"] as const;

export default function DesignersPage() {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(DESIGNER_TABS)
      .withDefault("desempenho")
      .withOptions({ history: "push" }),
  );

  return (
    <div className="flex flex-1 flex-col gap-5">
      <CabecalhoDaPagina
        icone={Palette}
        titulo="Designers"
        descricao="Produção do time e os briefings gerados pela automação do GHL"
      />

      <Tabs
        value={tab}
        onValueChange={(value) => void setTab(value as typeof tab)}
        className="gap-5"
      >
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-2">
          <TabsTrigger value="desempenho" className="py-2">
            <BarChart3 />
            Desempenho
          </TabsTrigger>
          <TabsTrigger value="instrucoes-mockup" className="py-2">
            <MessageSquareText />
            Instrução mockup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="desempenho">
          <DesignersPerformanceTab />
        </TabsContent>
        <TabsContent value="instrucoes-mockup">
          <MockupInstructionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
