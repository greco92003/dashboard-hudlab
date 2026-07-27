"use client";

import { MediaGrid } from "./media-grid";

export function Posts() {
  return (
    <MediaGrid mediaProductType="FEED" emptyMessage="Nenhum post/carrossel encontrado no período." />
  );
}
