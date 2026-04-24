/**
 * Order brand-slicing utilities.
 *
 * When an order contains products from multiple brands (e.g., one product
 * from Brand A and one from Brand B) and we need to attribute revenue /
 * commission to a single brand, we can't use the whole-order totals --
 * that would leak Brand B's revenue into Brand A's reports.
 *
 * This module provides a pure helper that rewrites an order to the
 * portion matching a product-level predicate, proportionally scaling
 * subtotal, discounts, shipping values and fees so downstream consumers
 * (dashboard cards, charts, commission summaries) stay consistent.
 */
import { getEffectiveOrderFees } from "@/lib/payment-fees";

export interface SliceableOrder {
  products?: any[] | null;
  subtotal?: number | string | null;
  total?: number | string | null;
  promotional_discount?: number | string | null;
  discount_coupon?: number | string | null;
  discount_gateway?: number | string | null;
  total_discount_amount?: number | string | null;
  shipping_cost_customer?: number | string | null;
  shipping_cost_owner?: number | string | null;
  shipping_discount?: number | string | null;
  gateway_fees?: number | string | null;
  transaction_taxes?: number | string | null;
  installment_interest?: number | string | null;
  payment_method?: string | null;
  payment_details?: any;
  [key: string]: any;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const parsed = parseFloat(value.toString());
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Slice an order down to the products matching `predicate`, rewriting
 * subtotal / discounts / fees proportionally.
 *
 * Returns `null` when no products match, so the caller can drop the order.
 * Returns the original order reference when all products match (fast path).
 */
export function sliceOrderByProducts<T extends SliceableOrder>(
  order: T,
  predicate: (product: any) => boolean,
): T | null {
  const allProducts = (order.products || []) as any[];
  const matchingProducts = allProducts.filter(predicate);

  if (matchingProducts.length === 0) return null;
  if (matchingProducts.length === allProducts.length) return order;

  const sumProducts = (items: any[]) =>
    items.reduce(
      (sum, p) => sum + toNumber(p.price) * toNumber(p.quantity || 1),
      0,
    );

  const originalSubtotal = sumProducts(allProducts);
  const matchingSubtotal = sumProducts(matchingProducts);

  if (originalSubtotal <= 0 || matchingSubtotal <= 0) return null;

  const ratio = matchingSubtotal / originalSubtotal;

  // Resolve effective fees BEFORE scaling so the Nuvem Pago fallback can
  // still kick in when the DB values are NULL.
  const effective = getEffectiveOrderFees(order as any);

  const totalNumber = toNumber(order.total);

  return {
    ...order,
    products: matchingProducts,
    subtotal: matchingSubtotal,
    total: totalNumber > 0 ? totalNumber * ratio : matchingSubtotal,
    promotional_discount: toNumber(order.promotional_discount) * ratio,
    discount_coupon: toNumber(order.discount_coupon) * ratio,
    discount_gateway: toNumber(order.discount_gateway) * ratio,
    total_discount_amount: toNumber(order.total_discount_amount) * ratio,
    shipping_cost_customer: toNumber(order.shipping_cost_customer) * ratio,
    shipping_cost_owner: toNumber(order.shipping_cost_owner) * ratio,
    shipping_discount: toNumber(order.shipping_discount) * ratio,
    // Write scaled effective fees as numbers so the DB-null fallback is not
    // triggered again downstream (we already applied it here).
    gateway_fees: effective.gatewayFees * ratio,
    transaction_taxes: effective.transactionTaxes * ratio,
    installment_interest: effective.installmentInterest * ratio,
  };
}
