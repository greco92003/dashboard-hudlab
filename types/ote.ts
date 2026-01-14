// =====================================================
// TIPOS DO SISTEMA OTE (ON TARGET EARNINGS)
// =====================================================

/**
 * Multiplicador baseado no % de atingimento da meta
 */
export interface OTEMultiplier {
  min: number; // % mínimo
  max: number; // % máximo
  multiplier: number; // Multiplicador a aplicar
}

/**
 * Configuração global do sistema OTE
 */
export interface OTEConfig {
  id: string;
  paid_traffic_percentage: number; // Ex: 80
  organic_percentage: number; // Ex: 20
  multipliers: OTEMultiplier[];
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * Vendedor cadastrado no sistema OTE
 */
export interface OTESeller {
  id: string;
  user_id: string;
  seller_name: string; // Nome que aparece no campo "vendedor" dos deals
  salary_fixed: number; // Salário fixo mensal
  commission_percentage: number; // % da meta que vira comissão (ex: 2%)
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * Meta mensal da empresa
 * Todos os vendedores trabalham juntos para atingir essa meta
 */
export interface OTEMonthlyTarget {
  id: string;
  month: number; // 1-12
  year: number;
  target_amount: number; // Valor total da meta mensal da empresa
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * Histórico de comissão calculada
 */
export interface OTECommissionHistory {
  id: string;
  seller_id: string;
  target_id: string;
  month: number;
  year: number;

  // Valores
  target_amount: number;
  achieved_amount: number;
  achievement_percentage: number;

  // Detalhamento por canal
  paid_traffic_sales: number;
  organic_sales: number;

  // Comissões
  base_commission: number; // 2% da meta
  multiplier: number;
  commission_paid_traffic: number;
  commission_organic: number;
  total_commission: number;

  // Total final
  salary_fixed: number;
  total_earnings: number; // fixo + comissão

  calculated_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Notificação OTE
 */
export interface OTENotification {
  id: string;
  seller_id: string;
  user_id: string;
  type: "milestone" | "target_achieved" | "multiplier_unlocked";
  title: string;
  message: string;
  metadata: Record<string, any>;
  read: boolean;
  created_at: string;
}

/**
 * Resultado do cálculo de comissão
 */
export interface OTECalculationResult {
  // Dados básicos
  seller_id: string;
  seller_name: string;
  month: number;
  year: number;

  // Meta e atingimento
  target_amount: number;
  achieved_amount: number;
  achievement_percentage: number;

  // Detalhamento por canal
  paid_traffic_sales: number;
  organic_sales: number;

  // Comissões
  base_commission: number; // 2% da meta
  multiplier: number;
  commission_paid_traffic: number;
  commission_organic: number;
  total_commission: number;

  // Total final
  salary_fixed: number;
  total_earnings: number; // fixo + comissão

  // Informações adicionais
  deals_count: number;
  pairs_sold: number;
}

/**
 * Dashboard do vendedor
 */
export interface OTESellerDashboard {
  seller: OTESeller;
  current_month: OTECalculationResult;
  previous_months: OTECommissionHistory[];
  notifications: OTENotification[];
  monthly_target?: OTEMonthlyTarget;
}

/**
 * Formulário de criação/edição de vendedor
 */
export interface OTESellerFormData {
  user_id: string;
  seller_name: string;
  salary_fixed: number;
  commission_percentage: number;
  active: boolean;
}

/**
 * Formulário de criação/edição de meta mensal da empresa
 */
export interface OTETargetFormData {
  month: number;
  year: number;
  target_amount: number;
}
