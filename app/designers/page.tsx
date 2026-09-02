"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { BarChart3, MessageSquareText, Palette } from "lucide-react";
import { DesignersPerformanceTab } from "@/components/designers/ghl-performance-tab";
import { MockupInstructionsTab } from "@/components/designers/mockup-instructions-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DESIGNER_TABS = ["desempenho", "instrucoes-mockup"] as const;

export default function DesignersPage() {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(DESIGNER_TABS)
      .withDefault("desempenho")
      .withOptions({ history: "push" }),
  );

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
          <Palette className="h-4 w-4" />
          Operação de design
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Designers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe a produção do time e os briefings gerados pela automação do
          GHL.
        </p>
      </div>

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
