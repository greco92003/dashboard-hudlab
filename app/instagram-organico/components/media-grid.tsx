"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";
import {
  fmtDataCurta,
  fmtNum,
  fmtPctFraction,
  fmtWatchTime,
  PERIODOS,
  periodoParaDatas,
  SORT_OPTIONS,
  type Periodo,
  type SortKey,
} from "../lib";

interface MediaRow {
  id: string;
  media_type: string;
  media_product_type: string;
  caption: string | null;
  permalink: string;
  media_url: string | null;
  thumbnail_url: string | null;
  timestamp: string;
  reach: number | null;
  views: number | null;
  saved: number | null;
  shares: number | null;
  likes: number | null;
  comments: number | null;
  total_interactions: number | null;
  avg_watch_time_ms: number | null;
  save_rate: number | null;
  share_rate: number | null;
  engagement_rate: number | null;
}

interface MediaGridProps {
  mediaProductType: "REELS" | "FEED" | "STORY";
  emptyMessage: string;
  showWatchTime?: boolean;
  note?: React.ReactNode;
}

export function MediaGrid({ mediaProductType, emptyMessage, showWatchTime, note }: MediaGridProps) {
  const [items, setItems] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [selected, setSelected] = useState<MediaRow | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancel = false;
    setLoading(true);
    setErro(null);
    (async () => {
      const { inicio, fim } = periodoParaDatas(periodo);
      let query = supabase
        .from("v_ig_media_latest")
        .select(
          "id, media_type, media_product_type, caption, permalink, media_url, thumbnail_url, timestamp, reach, views, saved, shares, likes, comments, total_interactions, avg_watch_time_ms, save_rate, share_rate, engagement_rate",
        )
        .eq("media_product_type", mediaProductType)
        .lte("timestamp", `${fim}T23:59:59`);
      if (inicio) query = query.gte("timestamp", inicio);
      query = query.order(sortKey, { ascending: false, nullsFirst: false });

      const { data, error } = await query;
      if (cancel) return;
      if (error) {
        setErro(error.message);
        setLoading(false);
        return;
      }
      setItems((data as MediaRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [mediaProductType, periodo, sortKey]);

  const sortOptions = SORT_OPTIONS.filter((o) => showWatchTime || !o.reelsOnly);

  return (
    <div className="space-y-4">
      {note}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading ? "Carregando..." : `${items.length} ${items.length === 1 ? "item" : "itens"}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {erro && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">Erro ao carregar: {erro}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">{emptyMessage}</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              showWatchTime={showWatchTime}
              onClick={() => setSelected(item)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && <MediaDetail item={selected} showWatchTime={showWatchTime} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaCard({
  item,
  showWatchTime,
  onClick,
}: {
  item: MediaRow;
  showWatchTime?: boolean;
  onClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  // Posts/carrosséis (IMAGE/CAROUSEL_ALBUM) não têm thumbnail_url -- a
  // própria media_url já é a imagem. Só vídeo/reel tem thumbnail_url.
  const img = item.thumbnail_url ?? item.media_url;

  return (
    <button
      onClick={onClick}
      className="group relative aspect-[9/16] w-full overflow-hidden rounded-lg border bg-muted text-left"
    >
      {img && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt={item.caption ?? ""}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
          <span>Prévia indisponível</span>
          <span className="text-[10px]">Link expirado, veja no Instagram</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6 text-white">
        <div className="text-xs font-medium">{fmtNum(item.views)} views</div>
        <div className="flex items-center gap-2 text-[11px] opacity-90">
          <span>{fmtPctFraction(item.engagement_rate)} eng.</span>
          {showWatchTime && <span>{fmtWatchTime(item.avg_watch_time_ms)}</span>}
        </div>
      </div>
      <Badge variant="secondary" className="absolute left-2 top-2 text-[10px]">
        {item.media_type === "CAROUSEL_ALBUM" ? "Carrossel" : item.media_type === "VIDEO" ? "Vídeo" : "Imagem"}
      </Badge>
    </button>
  );
}

function MediaDetail({ item, showWatchTime }: { item: MediaRow; showWatchTime?: boolean }) {
  const [previewError, setPreviewError] = useState(false);
  const isVideo = item.media_type === "VIDEO";
  const src = item.media_url;

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="text-base">{fmtDataCurta(item.timestamp)}</DialogTitle>
        {item.caption && (
          <DialogDescription className="line-clamp-3 whitespace-pre-line text-left">
            {item.caption}
          </DialogDescription>
        )}
      </DialogHeader>

      {src && !previewError ? (
        isVideo ? (
          <video
            src={src}
            controls
            className="max-h-96 w-full rounded-md bg-black"
            onError={() => setPreviewError(true)}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="max-h-96 w-full rounded-md object-contain"
            onError={() => setPreviewError(true)}
          />
        )
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md border text-sm text-muted-foreground">
          Prévia indisponível (link expirado)
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Metric label="Views" value={fmtNum(item.views)} />
        <Metric label="Alcance" value={fmtNum(item.reach)} />
        <Metric label="Curtidas" value={fmtNum(item.likes)} />
        <Metric label="Comentários" value={fmtNum(item.comments)} />
        <Metric label="Salvos" value={fmtNum(item.saved)} />
        <Metric label="Compart." value={fmtNum(item.shares)} />
        <Metric label="Taxa de salvamento" value={fmtPctFraction(item.save_rate)} />
        <Metric label="Taxa de compart." value={fmtPctFraction(item.share_rate)} />
        <Metric label="Engajamento" value={fmtPctFraction(item.engagement_rate)} />
        {showWatchTime && (
          <Metric label="Tempo médio assistido" value={fmtWatchTime(item.avg_watch_time_ms)} />
        )}
      </div>

      <a
        href={item.permalink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Ver no Instagram <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
