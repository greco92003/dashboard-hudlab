// -------------------------------------------------------
// Tiny/Olist – Internal normalized types
// -------------------------------------------------------

export type FinancialPayable = {
  id: string;
  description: string;
  dueDate: string; // dd/MM/yyyy
  amount: number;
  status: "open" | "paid" | "partial" | "overdue" | "canceled";
  category?: {
    id?: string;
    name: string;
  };
  supplier?: {
    id?: string;
    name: string;
  };
};

export type FinancialReceivable = {
  id: string;
  description: string;
  dueDate: string; // dd/MM/yyyy or YYYY-MM-DD
  amount: number;
  saldo: number; // outstanding balance still to be received
  receivedAmount: number; // amount already received (amount - saldo)
  status: "open" | "received" | "partial" | "overdue" | "canceled";
  customer?: {
    id?: string;
    name: string;
  };
  receiptMethod?: string;
  installment?: string; // e.g. "1/3", "2/3"
};

export type FinancialCashBalance = {
  balance: number;
  currency: "BRL";
  referenceDate: string;
};

export type FinancialTimelinePoint = {
  period: string;
  // Aggregate (Previsto + Realizado)
  payable: number;
  receivable: number;
  // Realizado (situacao = pago / recebido)
  realizedIn: number;
  realizedOut: number;
  // Previsto (aberto / prevista / parcial / atrasadas)
  predictedIn: number;
  predictedOut: number;
  // Cumulative running balances
  cashBalance: number; // realized + predicted (all entries)
  realizedBalance: number; // realized only
};

// -------------------------------------------------------
// Internal API response types
// -------------------------------------------------------

export type FinancialDashboardSummaryResponse = {
  // Aggregate
  totalPayable: number;
  totalReceivable: number;
  cashBalance: number;
  netForecast: number;
  // Realizado (status pago/recebido)
  totalPaid: number;
  totalReceived: number;
  realizedNet: number;
  // Previsto (status aberto/prevista/parcial/atrasadas)
  totalToPay: number;
  totalToReceive: number;
  predictedNet: number;
  // Diagnostics
  payablesCount: number;
  receivablesCount: number;
};

export type FinancialDashboardTimelineResponse = {
  granularity: "day" | "week" | "month";
  points: FinancialTimelinePoint[];
};

// -------------------------------------------------------
// Tiny API raw shapes (V2 fallback – token auth)
// -------------------------------------------------------

export type TinyRawContaPagar = {
  id: string | number;
  descricao?: string;
  vencimento?: string;
  valor?: number | string;
  situacao?: string;
  categoria?: string;
  idCategoria?: string | number;
  nomeContato?: string;
  idContato?: string | number;
};

export type TinyRawContaReceber = {
  id: string | number;
  descricao?: string;
  vencimento?: string;
  valor?: number | string;
  saldo?: number | string;
  situacao?: string;
  nomeContato?: string;
  idContato?: string | number;
  formaPagamento?: string;
  parcela?: string; // e.g. "1/3"
};

// -------------------------------------------------------
// Tiny API raw shapes (V3 – OAuth2 Bearer)
// Campos confirmados em https://api-docs.erp.olist.com
// -------------------------------------------------------

export type TinyV3RawContaPagar = {
  id: number;
  situacao?: string; // "aberto" | "cancelada" | "pago" | "parcial" | "prevista" | "atrasadas" | "emissao"
  data?: string; // YYYY-MM-DD (emissão)
  dataVencimento?: string; // YYYY-MM-DD
  historico?: string; // descrição / histórico
  valor?: number;
  saldo?: number;
  numeroDocumento?: string;
  cliente?: {
    id?: number;
    nome?: string;
    fantasia?: string;
    cpfCnpj?: string;
  };
};

export type TinyV3RawContaReceber = {
  id: number;
  situacao?: string; // "aberto" | "cancelada" | "recebido" | "parcial" | "prevista" | "atrasadas"
  data?: string; // YYYY-MM-DD (emissão)
  dataVencimento?: string; // YYYY-MM-DD
  historico?: string;
  valor?: number;
  saldo?: number;
  numeroDocumento?: string;
  numeroBanco?: string;
  parcela?: number;
  totalParcelas?: number;
  competencia?: string;
  meioPagamento?: string;
  cliente?: {
    id?: number;
    nome?: string;
    fantasia?: string;
    cpfCnpj?: string;
  };
};

// -------------------------------------------------------
// Shared filter types used by service and routes
// -------------------------------------------------------

export type FinancialFilters = {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  status?: string;
  granularity?: "day" | "week" | "month";
  /** Conta Azul-style view: realized only, predicted only, or both */
  viewMode?: "realized" | "predicted" | "both";
};
