export const OFFICIAL_MOCKUP_STAGE = "solicitoumockupoficial";

export function hasOfficialMockupTag(rawContact: unknown): boolean {
  if (!rawContact || typeof rawContact !== "object") return false;

  const tags = (rawContact as { tags?: unknown }).tags;
  const values = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
      ? tags.split(",")
      : [];

  return values.some((tag) => {
    if (typeof tag !== "string") return false;

    const normalized = tag
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

    return normalized === OFFICIAL_MOCKUP_STAGE;
  });
}