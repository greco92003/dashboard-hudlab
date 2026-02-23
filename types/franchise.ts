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
  {
    id: "moema-sp",
    name: "Moema - SP",
    displayName: "Moema - SP",
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
  shipping_cost_customer?: number | null;
  shipping_cost_owner?: number | null;
  shipping_discount?: number | null;
  gateway_fees?: number | null;
  transaction_taxes?: number | null;
  installment_interest?: number | null;
  completed_at: string;
  created_at_nuvemshop: string;
}

// Helper functions
export function getFranchiseFromVariant(
  variant: ProductVariant,
): string | null {
  // Franchise information is in values[1] (second element)
  if (variant.values && variant.values.length > 1 && variant.values[1]?.pt) {
    return variant.values[1].pt;
  }
  return null;
}

export function getFranchiseFromOrderProduct(
  product: OrderProduct,
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
  franchise: string | null,
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
        !isZenithProduct(product.brand) || product.variants.length > 0,
    );
}

export function filterOrdersByFranchise(
  orders: NuvemshopOrder[],
  franchise: string | null,
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
  franchise: string | null,
): number {
  if (!franchise) {
    // If no franchise selected, calculate total revenue (net revenue after all costs)
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

    const shippingDiscount =
      typeof order.shipping_discount === "string"
        ? parseFloat(order.shipping_discount)
        : order.shipping_discount || 0;

    const gatewayFees =
      typeof order.gateway_fees === "string"
        ? parseFloat(order.gateway_fees)
        : order.gateway_fees || 0;

    const transactionTaxes =
      typeof order.transaction_taxes === "string"
        ? parseFloat(order.transaction_taxes)
        : order.transaction_taxes || 0;

    const installmentInterest =
      typeof order.installment_interest === "string"
        ? parseFloat(order.installment_interest)
        : order.installment_interest || 0;

    // NOTE: shipping_cost_owner is NOT deducted as it's an operational cost of the store, not the partner
    return (
      subtotal -
      promotionalDiscount -
      discountCoupon -
      discountGateway -
      shippingDiscount -
      gatewayFees -
      transactionTaxes -
      installmentInterest
    );
  }

  // Calculate revenue only for products from the selected franchise
  // First, calculate the total subtotal and franchise subtotal
  const orderSubtotal =
    typeof order.subtotal === "string"
      ? parseFloat(order.subtotal)
      : order.subtotal || 0;

  let franchiseSubtotal = 0;

  order.products.forEach((product) => {
    const productFranchise = getFranchiseFromOrderProduct(product);

    // Only include products that match the selected franchise
    if (productFranchise === franchise) {
      const productTotal = product.price * product.quantity;
      franchiseSubtotal += productTotal;
    }
  });

  // If no franchise products, return 0
  if (franchiseSubtotal === 0 || orderSubtotal === 0) {
    return 0;
  }

  // Calculate the proportion of the order that belongs to this franchise
  const franchiseProportion = franchiseSubtotal / orderSubtotal;

  // Apply discounts and costs proportionally
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

  const shippingDiscount =
    typeof order.shipping_discount === "string"
      ? parseFloat(order.shipping_discount)
      : order.shipping_discount || 0;

  const gatewayFees =
    typeof order.gateway_fees === "string"
      ? parseFloat(order.gateway_fees)
      : order.gateway_fees || 0;

  const transactionTaxes =
    typeof order.transaction_taxes === "string"
      ? parseFloat(order.transaction_taxes)
      : order.transaction_taxes || 0;

  const installmentInterest =
    typeof order.installment_interest === "string"
      ? parseFloat(order.installment_interest)
      : order.installment_interest || 0;

  // Apply each discount and cost proportionally to the franchise revenue
  // NOTE: shipping_cost_owner is NOT deducted as it's an operational cost of the store, not the partner
  const franchisePromotionalDiscount =
    promotionalDiscount * franchiseProportion;
  const franchiseDiscountCoupon = discountCoupon * franchiseProportion;
  const franchiseDiscountGateway = discountGateway * franchiseProportion;
  const franchiseShippingDiscount = shippingDiscount * franchiseProportion;
  const franchiseGatewayFees = gatewayFees * franchiseProportion;
  const franchiseTransactionTaxes = transactionTaxes * franchiseProportion;
  const franchiseInstallmentInterest =
    installmentInterest * franchiseProportion;

  // Calculate final franchise revenue: subtotal - proportional discounts and costs
  const franchiseRevenue =
    franchiseSubtotal -
    franchisePromotionalDiscount -
    franchiseDiscountCoupon -
    franchiseDiscountGateway -
    franchiseShippingDiscount -
    franchiseGatewayFees -
    franchiseTransactionTaxes -
    franchiseInstallmentInterest;

  return Math.max(0, franchiseRevenue); // Ensure non-negative
}

/**
 * Calculate Net Revenue (Faturamento Líquido)
 * This is the revenue after all discounts including free shipping discount
 * Formula: subtotal - promotional_discount - discount_coupon - discount_gateway - shipping_discount
 */
export function calculateNetRevenue(order: NuvemshopOrder): number {
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

  const shippingDiscount =
    typeof order.shipping_discount === "string"
      ? parseFloat(order.shipping_discount)
      : order.shipping_discount || 0;

  return (
    subtotal -
    promotionalDiscount -
    discountCoupon -
    discountGateway -
    shippingDiscount
  );
}

/**
 * Calculate Commissionable Revenue (Valor Comissionável)
 * This is the net revenue after all discounts
 * Formula: calculateNetRevenue()
 * This is the value on which partner commission should be calculated
 * NOTE: shipping_cost_owner is NOT deducted as it's an operational cost of the store, not the partner
 */
export function calculateCommissionableRevenue(order: NuvemshopOrder): number {
  const netRevenue = calculateNetRevenue(order);
  return Math.max(0, netRevenue);
}
