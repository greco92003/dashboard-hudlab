// Shared brand-inference helpers for Nuvemshop coupons.
//
// These helpers run at READ time (no DB writes). They take a Nuvemshop coupon
// and resolve a HudLab brand by, in order:
//   1) Direct lookup of attached product IDs in nuvemshop_products
//   2) Token match against the attached product names
//   3) Token match against the coupon code itself
//
// Returns null when no brand can be inferred.

export interface NuvemshopCouponLite {
  code: string;
  products?: Array<{ id: number | string; name?: { pt?: string } | string }>;
}

export interface BrandMatcher {
  brand: string;
  tokens: string[];
}

export interface BrandIndex {
  productIdToBrand: Map<string, string>;
  matchers: BrandMatcher[];
}

// Build the index from rows pulled from nuvemshop_products
export function buildBrandIndex(
  rows: Array<{ product_id: string | number | null; brand: string | null }>,
): BrandIndex {
  const productIdToBrand = new Map<string, string>();
  const brandSet = new Set<string>();

  for (const row of rows) {
    if (!row.brand) continue;
    brandSet.add(row.brand);
    if (row.product_id != null) {
      productIdToBrand.set(String(row.product_id), row.brand);
    }
  }

  const matchers: BrandMatcher[] = Array.from(brandSet).map((brand) => ({
    brand,
    tokens: brand
      .toLowerCase()
      .split(/[\s\-_]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3),
  }));

  return { productIdToBrand, matchers };
}

type CouponProduct = NonNullable<NuvemshopCouponLite["products"]>[number];

function pickProductName(p: CouponProduct): string {
  if (!p?.name) return "";
  if (typeof p.name === "string") return p.name;
  return p.name.pt || "";
}

export function inferCouponBrand(
  coupon: NuvemshopCouponLite,
  index: BrandIndex,
): string | null {
  // 1) Direct mapping via attached product IDs
  if (coupon.products && coupon.products.length > 0) {
    for (const p of coupon.products) {
      const brand = index.productIdToBrand.get(String(p.id));
      if (brand) return brand;
    }

    // 2) Fallback: tokens against product names
    for (const p of coupon.products) {
      const name = pickProductName(p).toLowerCase();
      if (!name) continue;
      const matched = index.matchers.find(({ tokens }) =>
        tokens.some((t) => name.includes(t)),
      );
      if (matched) return matched.brand;
    }
  }

  // 3) Fallback: tokens against coupon code
  const codeNorm = (coupon.code || "").toLowerCase();
  if (codeNorm) {
    const matched = index.matchers.find(({ tokens }) =>
      tokens.some((t) => codeNorm.includes(t)),
    );
    if (matched) return matched.brand;
  }

  return null;
}

// Case-insensitive, trimmed brand equality
export function brandEquals(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
