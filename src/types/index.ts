// ─── Core Agent Types ────────────────────────────────────────────────────────

export type TradeAction = 'BUY' | 'SELL' | 'HOLD';

export interface AgentDecision {
  action: TradeAction;
  pair: string;
  reasoning: string;
  confidence: number; // 0.0 – 1.0
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
}

// ─── Twelve Data ─────────────────────────────────────────────────────────────

export interface OHLCVCandle {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface TwelveDataResponse {
  meta: {
    symbol: string;
    interval: string;
    currency_base: string;
    currency_quote: string;
    type: string;
  };
  values: OHLCVCandle[];
  status: string;
}

// ─── Supabase Row Types ───────────────────────────────────────────────────────

export interface Trade {
  id: string;
  created_at: string;
  pair: string;
  action: string;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  pnl: number | null;
  deriv_contract_id: string | null;
  confidence: number | null;
  reasoning: string | null;
  agent_run_id: string | null;
}

export interface Position {
  id: string;
  created_at: string;
  updated_at: string;
  pair: string;
  action: string;
  entry_price: number | null;
  current_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: 'OPEN' | 'CLOSED';
  deriv_contract_id: string | null;
  unrealized_pnl: number | null;
}

export interface AgentMemoryEntry {
  id: string;
  created_at: string;
  run_id: string;
  pair: string;
  action: string;
  reasoning: string;
  confidence: number;
  market_context: Record<string, unknown> | null;
  outcome: 'WIN' | 'LOSS' | 'PENDING' | null;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface AgentRunResult {
  success: boolean;
  runId: string;
  decision: AgentDecision;
  tradeExecuted: boolean;
  contractId?: string;
  latestPrice: number;
  timestamp: string;
  error?: string;
}

export interface DerivTradeResult {
  success: boolean;
  contractId: string;
  error?: string;
}
