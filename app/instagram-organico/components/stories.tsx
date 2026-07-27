"use client";

import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MediaGrid } from "./media-grid";

export function Stories() {
  return (
    <MediaGrid
      mediaProductType="STORY"
      emptyMessage="Nenhum story capturado no período."
      note={
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Stories só ficam disponíveis pela API do Instagram enquanto ativos (24h). Este
            histórico depende do sync ter rodado enquanto o story estava no ar — não é possível
            buscar stories antigos retroativamente.
          </AlertDescription>
        </Alert>
      }
    />
  );
}
