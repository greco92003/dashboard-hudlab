"use client";

import { MediaGrid } from "./media-grid";

export function Reels() {
  return (
    <MediaGrid
      mediaProductType="REELS"
      emptyMessage="Nenhum reel encontrado no período."
      showWatchTime
    />
  );
}
