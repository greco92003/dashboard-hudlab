export function googleDriveFileId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) {
      const pathId = parsed.pathname.match(/\/file\/d\/([^/]+)/i)?.[1];
      return pathId || parsed.searchParams.get("id");
    }
    // Copiar a imagem da visualização do Drive gera um link lh3, com as
    // dimensões após "=". Use o ID original na prévia e no proxy JPEG do Tiny.
    if (/^lh[3-6]\.(google\.com|googleusercontent\.com)$/i.test(parsed.hostname)) {
      return parsed.pathname.match(/^\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:=|\/|$)/)?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function artworkThumbnailUrl(url: string): string | null {
  const driveId = googleDriveFileId(url);
  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1000`;
  }
  return /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(url) ? url : null;
}

export function artworkEmbedUrl(url: string): string | null {
  const driveId = googleDriveFileId(url);
  return driveId
    ? `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`
    : null;
}

export function artworkOpenUrl(url: string): string {
  const driveId = googleDriveFileId(url);
  // O link lh3 copiado da imagem pode depender da sessão do Google.
  // Abra a página pública do arquivo, assim como fazemos para a prévia.
  return driveId
    ? `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/view`
    : url;
}

export function artworkProxyPath(fileId: string) {
  return `/api/erp/artwork/${encodeURIComponent(fileId)}.jpg`;
}

export function artworkFileIdFromPathSegment(pathSegment: string) {
  return pathSegment.replace(/\.jpg$/i, "");
}
