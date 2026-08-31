export function googleDriveFileId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return null;
    const pathId = parsed.pathname.match(/\/file\/d\/([^/]+)/i)?.[1];
    return pathId || parsed.searchParams.get("id");
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

export function artworkProxyPath(fileId: string) {
  return `/api/erp/artwork/${encodeURIComponent(fileId)}.jpg`;
}

export function artworkFileIdFromPathSegment(pathSegment: string) {
  return pathSegment.replace(/\.jpg$/i, "");
}
