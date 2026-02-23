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
