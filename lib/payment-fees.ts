/**
 * Payment Gateway Fees Calculator - Nuvem Pago
 *
 * This module calculates payment gateway fees and installment interest based on actual Nuvem Pago rates.
 *
 * IMPORTANT: These are calculated estimates based on your Nuvem Pago contract configuration.
 * Real-time transaction data is only available to Payment Provider apps via API.
 *
 * Last updated: 2026-02-23
 * Source: Nuvem Pago contract configuration provided by user
 */

export interface PaymentFeeConfig {
  // PIX
  pixFeePercentage: number; // Percentage fee

  // Credit Card - gateway processing fee
  creditCardPercentage: number; // Percentage fee
  creditCardFixedFee: number; // Fixed fee in BRL (R$ 0.35)

  // Boleto
  boletoFixedFee: number; // Fixed fee in BRL

  // Installment interest rates (paid by merchant when offering interest-free installments)
  // These are the interest rates the MERCHANT pays to offer "sem juros" to customers
  installmentInterestRates: {
    [key: number]: number; // installments -> interest percentage
  };

  // Maximum installments offered without interest to customer
  maxInterestFreeInstallments: number;
}

/**
 * Nuvem Pago fee configuration based on actual contract
 * Updated: 2026-02-23
 */
export const DEFAULT_NUVEM_PAGO_FEES: PaymentFeeConfig = {
  // PIX - 0.99% of transaction value
  pixFeePercentage: 0.99,

  // Credit Card - 4.19% + R$ 0.35 per transaction
  creditCardPercentage: 4.19,
  creditCardFixedFee: 0.35,

  // Boleto - R$ 2.39 per transaction
  boletoFixedFee: 2.39,

  // Installment interest rates (what merchant pays to offer interest-free)
  installmentInterestRates: {
    1: 0, // No interest for 1x
    2: 6.19, // Merchant pays 6.19% to offer 2x interest-free
    3: 7.57, // Merchant pays 7.57% to offer 3x interest-free
    4: 8.86, // Customer pays interest from 4x onwards
    5: 10.46,
    6: 11.76,
    7: 13.04,
    8: 14.3,
    9: 15.52,
    10: 16.73,
    11: 17.92,
    12: 19.08,
  },

  // Merchant offers up to 3x interest-free (merchant pays the interest)
  maxInterestFreeInstallments: 3,
};

/**
 * Calculate gateway processing fee (taxa de processamento)
 * This is the fee charged by Nuvem Pago to process the payment
 */
export function calculateGatewayFee(
  paymentMethod: string | null | undefined,
  totalAmount: number,
  installments: number = 1,
  config: PaymentFeeConfig = DEFAULT_NUVEM_PAGO_FEES,
): number {
  if (!paymentMethod || totalAmount <= 0) {
    return 0;
  }

  const method = paymentMethod.toLowerCase();

  // PIX - 0.99% of transaction value
  if (method === "pix") {
    return (totalAmount * config.pixFeePercentage) / 100;
  }

  // Credit Card - 4.19% + R$ 0.35
  if (method === "credit_card") {
    const percentageFee = (totalAmount * config.creditCardPercentage) / 100;
    return percentageFee + config.creditCardFixedFee;
  }

  // Boleto - R$ 2.39 fixed
  if (method === "boleto" || method === "ticket") {
    return config.boletoFixedFee;
  }

  // Debit Card - assume same as credit card for now
  if (method === "debit_card") {
    const percentageFee = (totalAmount * config.creditCardPercentage) / 100;
    return percentageFee + config.creditCardFixedFee;
  }

  // Other methods - no fee data available
  return 0;
}

/**
 * Calculate installment interest PAID BY MERCHANT
 * When merchant offers "sem juros" (interest-free) to customers,
 * the merchant actually pays the interest to the gateway.
 *
 * This function calculates how much the MERCHANT pays in interest.
 *
 * @param totalAmount - Total transaction amount
 * @param installments - Number of installments
 * @param config - Fee configuration
 * @returns Interest amount paid by merchant (0 if customer pays interest)
 */
export function calculateMerchantInstallmentInterest(
  totalAmount: number,
  installments: number,
  config: PaymentFeeConfig = DEFAULT_NUVEM_PAGO_FEES,
): number {
  if (installments <= 1 || totalAmount <= 0) {
    return 0;
  }

  // If installments exceed max interest-free, customer pays interest (merchant pays 0)
  if (installments > config.maxInterestFreeInstallments) {
    return 0;
  }

  // Get interest rate for this number of installments
  const interestRate = config.installmentInterestRates[installments] || 0;

  if (interestRate <= 0) {
    return 0;
  }

  // Calculate interest amount paid by merchant
  return (totalAmount * interestRate) / 100;
}

/**
 * Get payment method display name
 */
export function getPaymentMethodName(
  method: string | null | undefined,
): string {
  if (!method) return "Não informado";

  const methodMap: Record<string, string> = {
    pix: "PIX",
    credit_card: "Cartão de Crédito",
    debit_card: "Cartão de Débito",
    boleto: "Boleto",
    ticket: "Boleto",
    wallet: "Carteira Digital",
    wire_transfer: "Transferência Bancária",
    bank_debit: "Débito Bancário",
    cash: "Dinheiro",
  };

  return methodMap[method.toLowerCase()] || method;
}

// =====================================================
// EFFECTIVE FEE HELPERS
// =====================================================
// Nuvemshop's regular store API does not expose transaction fees
// (gateway_fees / installment_interest / transaction_taxes).
// These helpers return the value stored in the DB when present,
// otherwise they compute an estimate using the Nuvem Pago rates
// so the net revenue / commission calculations stay consistent
// with what merchants see on the Nuvemshop admin panel.

export interface OrderWithFees {
  total?: number | string | null;
  subtotal?: number | string | null;
  shipping_cost_customer?: number | string | null;
  promotional_discount?: number | string | null;
  discount_coupon?: number | string | null;
  discount_gateway?: number | string | null;
  shipping_discount?: number | string | null;
  gateway_fees?: number | string | null;
  transaction_taxes?: number | string | null;
  installment_interest?: number | string | null;
  payment_method?: string | null;
  payment_details?: any;
}

// Parse numeric value returning null when the value is missing/invalid
function parseNumericOrNull(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  const trimmed = value.toString().trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "undefined") {
    return null;
  }
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? null : parsed;
}

function parseNumericOrZero(value: number | string | null | undefined): number {
  return parseNumericOrNull(value) ?? 0;
}

/**
 * Resolve the payment method from an order, handling array, object and
 * flat-column payment_details formats used across sync paths.
 */
export function resolvePaymentMethod(order: OrderWithFees): string | null {
  if (order.payment_method && order.payment_method.trim() !== "") {
    return order.payment_method;
  }

  const details = order.payment_details;
  if (!details) return null;

  if (Array.isArray(details)) {
    const first = details[0];
    return (
      first?.payment_method?.name ||
      first?.payment_method ||
      first?.method ||
      first?.type ||
      null
    );
  }

  if (typeof details === "object") {
    return details.method || details.payment_method || null;
  }

  return null;
}

/**
 * Resolve the number of installments from the order payment details.
 */
function resolveInstallments(order: OrderWithFees): number {
  const details = order.payment_details;
  if (!details) return 1;

  const raw = Array.isArray(details)
    ? details[0]?.installments
    : details.installments;

  if (raw === undefined || raw === null) return 1;
  const parsed = parseInt(raw.toString(), 10);
  return isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

/**
 * Resolve the transaction total used as the base for fee calculation.
 * Falls back to subtotal + shipping - discounts when `total` is missing.
 */
function resolveTotal(order: OrderWithFees): number {
  const total = parseNumericOrNull(order.total);
  if (total !== null && total > 0) return total;

  const subtotal = parseNumericOrZero(order.subtotal);
  const shipping = parseNumericOrZero(order.shipping_cost_customer);
  const promotional = parseNumericOrZero(order.promotional_discount);
  const coupon = parseNumericOrZero(order.discount_coupon);
  const gatewayDiscount = parseNumericOrZero(order.discount_gateway);
  const shippingDiscount = parseNumericOrZero(order.shipping_discount);

  return Math.max(
    0,
    subtotal +
      shipping -
      promotional -
      coupon -
      gatewayDiscount -
      shippingDiscount,
  );
}

export interface EffectiveFees {
  gatewayFees: number;
  transactionTaxes: number;
  installmentInterest: number;
}

/**
 * Return the effective gateway fee for the order.
 * Uses the stored DB value when present (not null), otherwise estimates it
 * from the payment method + total using the Nuvem Pago rates.
 */
export function getEffectiveGatewayFees(order: OrderWithFees): number {
  const stored = parseNumericOrNull(order.gateway_fees);
  if (stored !== null) return Math.max(0, stored);

  const method = resolvePaymentMethod(order);
  const total = resolveTotal(order);
  const installments = resolveInstallments(order);
  return calculateGatewayFee(method, total, installments);
}

/**
 * Return the effective merchant installment interest for the order.
 * Uses the stored DB value when present, otherwise estimates it.
 */
export function getEffectiveInstallmentInterest(order: OrderWithFees): number {
  const stored = parseNumericOrNull(order.installment_interest);
  if (stored !== null) return Math.max(0, stored);

  const method = resolvePaymentMethod(order);
  if (!method || method.toLowerCase() !== "credit_card") return 0;

  const total = resolveTotal(order);
  const installments = resolveInstallments(order);
  return calculateMerchantInstallmentInterest(total, installments);
}

/**
 * Return the effective transaction taxes for the order.
 * No estimate is possible for this field, so it defaults to 0 when NULL.
 */
export function getEffectiveTransactionTaxes(order: OrderWithFees): number {
  return Math.max(0, parseNumericOrZero(order.transaction_taxes));
}

/**
 * Return all effective fees in a single call.
 */
export function getEffectiveOrderFees(order: OrderWithFees): EffectiveFees {
  return {
    gatewayFees: getEffectiveGatewayFees(order),
    transactionTaxes: getEffectiveTransactionTaxes(order),
    installmentInterest: getEffectiveInstallmentInterest(order),
  };
}
