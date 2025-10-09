// Types for Zenith franchise functionality

export interface Franchise {
  id: string;
  name: string;
  displayName: string;
}

export const ZENITH_FRANCHISES: Franchise[] = [
  {
    id: "santos-sp",
    name: "Santos - SP",
    displayName: "Santos - SP",
  },
  {
    id: "garopaba-sc",
    name: "Garopaba - SC",
    displayName: "Garopaba - SC",
  },
  {
    id: "taquara-rs",
    name: "Taquara - RS",
    displayName: "Taquara - RS",
  },
];

export interface FranchiseFilter {
  selectedFranchise: string | null;
  isZenithBrand: boolean;
}

export interface ProductVariant {
  id: number;
  values: Array<{ pt: string }>;
  price: string;
  sku: string | null;
  stock: number | null;
}

export interface NuvemshopProduct {
  product_id: string;
  name_pt: string;
  brand: string;
  variants: ProductVariant[];
}

export interface OrderProduct {
  name: string;
  price: number;
  quantity: number;
  variant_values?: string[]; // Array of variant values from Nuvemshop
  variant?: {
    values?: Array<{ pt: string }>;
  };
}

export interface NuvemshopOrder {
  order_id: string;
  products: OrderProduct[];
  subtotal: number;
  promotional_discount: number;
  discount_coupon: number;
  discount_gateway: number;
  completed_at: string;
  created_at_nuvemshop: string;
}

// Helper functions
export function getFranchiseFromVariant(
  variant: ProductVariant
): string | null {
  // Franchise information is in values[1] (second element)
  if (variant.values && variant.values.length > 1 && variant.values[1]?.pt) {
    return variant.values[1].pt;
  }
  return null;
}

export function getFranchiseFromOrderProduct(
  product: OrderProduct
): string | null {
  // Check if product has variant_values array (from Nuvemshop orders)
  // Format: ["42/43", "Taquara - RS"] where [0] is size and [1] is franchise
  if (product.variant_values && product.variant_values.length > 1) {
    const franchiseValue = product.variant_values[1];
    if (franchiseValue && typeof franchiseValue === "string") {
      return franchiseValue;
    }
  }

  // Fallback: Check if product has variant with franchise information (old format)
  if (
    product.variant?.values &&
    product.variant.values.length > 1 &&
    product.variant.values[1]?.pt
  ) {
    return product.variant.values[1].pt;
  }

  return null;
}

export function isZenithProduct(brand: string): boolean {
  if (!brand) return false;
  const normalizedBrand = brand.toLowerCase().trim();
  return normalizedBrand === "zenith";
}

export function filterProductsByFranchise(
  products: NuvemshopProduct[],
  franchise: string | null
): NuvemshopProduct[] {
  if (!franchise) return products;

  return products
    .map((product) => {
      if (!isZenithProduct(product.brand)) {
        return product;
      }

      // Filter variants to only include the selected franchise
      const filteredVariants = product.variants.filter((variant) => {
        const variantFranchise = getFranchiseFromVariant(variant);
        return variantFranchise === franchise;
      });

      return {
        ...product,
        variants: filteredVariants,
      };
    })
    .filter(
      (product) =>
        // Keep non-Zenith products or Zenith products with matching variants
        !isZenithProduct(product.brand) || product.variants.length > 0
    );
}

export function filterOrdersByFranchise(
  orders: NuvemshopOrder[],
  franchise: string | null
): NuvemshopOrder[] {
  if (!franchise) return orders;

  return orders
    .map((order) => {
      // Filter products to only include those from the selected franchise
      const filteredProducts = order.products.filter((product) => {
        const productFranchise = getFranchiseFromOrderProduct(product);

        // If no franchise info, it's not a Zenith product, so include it
        if (!productFranchise) return true;

        // If it has franchise info, only include if it matches
        return productFranchise === franchise;
      });

      return {
        ...order,
        products: filteredProducts,
      };
    })
    .filter((order) => order.products.length > 0); // Only keep orders with products
}

export function calculateFranchiseRevenue(
  order: NuvemshopOrder,
  franchise: string | null
): number {
  if (!franchise) {
    // If no franchise selected, calculate total revenue
    const subtotal =
      typeof order.subtotal === "string"
        ? parseFloat(order.subtotal)
        : order.subtotal || 0;

    const promotionalDiscount =
      typeof order.promotional_discount === "string"
        ? parseFloat(order.promotional_discount)
        : order.promotional_discount || 0;

    const discountCoupon =
      typeof order.discount_coupon === "string"
        ? parseFloat(order.discount_coupon)
        : order.discount_coupon || 0;

    const discountGateway =
      typeof order.discount_gateway === "string"
        ? parseFloat(order.discount_gateway)
        : order.discount_gateway || 0;

    return subtotal - promotionalDiscount - discountCoupon - discountGateway;
  }

  // Calculate revenue only for products from the selected franchise
  let franchiseRevenue = 0;

  order.products.forEach((product) => {
    const productFranchise = getFranchiseFromOrderProduct(product);

    // If product has no franchise info or matches selected franchise
    if (!productFranchise || productFranchise === franchise) {
      const productTotal = product.price * product.quantity;
      franchiseRevenue += productTotal;
    }
  });

  return franchiseRevenue;
}
