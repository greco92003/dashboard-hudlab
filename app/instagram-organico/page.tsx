"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { VisaoGeral } from "./components/visao-geral";
import { Reels } from "./components/reels";
import { Posts } from "./components/posts";
import { Stories } from "./components/stories";
import { Insights } from "./components/insights";
import { Estrategia } from "./components/estrategia";

const ABAS = ["visao-geral", "reels", "posts", "stories", "insights", "estrategia"] as const;

function InstagramOrganicoContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const abaParam = searchParams.get("aba");
  const aba = (ABAS as readonly string[]).includes(abaParam ?? "")
    ? (abaParam as (typeof ABAS)[number])
    : "visao-geral";

  const setAba = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("aba", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Instagram Orgânico</h1>
        <p className="text-muted-foreground">
          Avaliador de criativos: o que performa bem e o que não performa, com base em dados reais
        </p>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="reels">Reels</TabsTrigger>
          <TabsTrigger value="posts">Posts &amp; Carrosséis</TabsTrigger>
          <TabsTrigger value="stories">Stories</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="estrategia">Estratégia</TabsTrigger>
        </TabsList>
        <TabsContent value="visao-geral" className="mt-4">
          <VisaoGeral />
        </TabsContent>
        <TabsContent value="reels" className="mt-4">
          <Reels />
        </TabsContent>
        <TabsContent value="posts" className="mt-4">
          <Posts />
        </TabsContent>
        <TabsContent value="stories" className="mt-4">
          <Stories />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <Insights />
        </TabsContent>
        <TabsContent value="estrategia" className="mt-4">
          <Estrategia />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function InstagramOrganicoPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6">
          <Skeleton className="h-96" />
        </div>
      }
    >
      <InstagramOrganicoContent />
    </Suspense>
  );
}
