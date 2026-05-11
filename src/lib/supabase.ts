import { createClient } from '@supabase/supabase-js';
import { AgentDecision, AgentMemoryEntry, Position, Trade } from '@/types';

// Use service role key server-side (writes), anon key client-side (reads).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Positions ────────────────────────────────────────────────────────────────

export async function getOpenPositions(): Promise<Position[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getOpenPositions: ${error.message}`);
  return data ?? [];
}

export async function createPosition(
  decision: AgentDecision,
  contractId?: string,
): Promise<Position> {
  const { data, error } = await supabase
    .from('positions')
    .insert({
      pair: decision.pair,
      action: decision.action,
      entry_price: decision.entry_price,
      current_price: decision.entry_price,
      stop_loss: decision.stop_loss,
      take_profit: decision.take_profit,
      status: 'OPEN',
      deriv_contract_id: contractId ?? null,
      unrealized_pnl: 0,
    })
    .select()
    .single();

  if (error) throw new Error(`createPosition: ${error.message}`);
  return data;
}

export async function updatePositionPrice(
  id: string,
  currentPrice: number,
  unrealizedPnl: number,
): Promise<void> {
  const { error } = await supabase
    .from('positions')
    .update({ current_price: currentPrice, unrealized_pnl: unrealizedPnl })
    .eq('id', id);

  if (error) throw new Error(`updatePositionPrice: ${error.message}`);
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export async function createTrade(
  decision: AgentDecision,
  runId: string,
  contractId?: string,
): Promise<Trade> {
  const { data, error } = await supabase
    .from('trades')
    .insert({
      pair: decision.pair,
      action: decision.action,
      entry_price: decision.entry_price,
      stop_loss: decision.stop_loss,
      take_profit: decision.take_profit,
      status: 'OPEN',
      deriv_contract_id: contractId ?? null,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      agent_run_id: runId,
    })
    .select()
    .single();

  if (error) throw new Error(`createTrade: ${error.message}`);
  return data;
}

export async function getRecentTrades(limit = 20): Promise<Trade[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentTrades: ${error.message}`);
  return data ?? [];
}

// ─── Agent Memory ─────────────────────────────────────────────────────────────

export async function getRecentMemory(
  pair: string,
  limit = 5,
): Promise<AgentMemoryEntry[]> {
  const { data, error } = await supabase
    .from('agent_memory')
    .select('*')
    .eq('pair', pair)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentMemory: ${error.message}`);
  return data ?? [];
}

export async function saveAgentMemory(
  decision: AgentDecision,
  marketContext: Record<string, unknown>,
  runId: string,
): Promise<void> {
  const { error } = await supabase.from('agent_memory').insert({
    run_id: runId,
    pair: decision.pair,
    action: decision.action,
    reasoning: decision.reasoning,
    confidence: decision.confidence,
    market_context: marketContext,
    outcome: 'PENDING',
  });

  if (error) throw new Error(`saveAgentMemory: ${error.message}`);
}

export async function getAgentMemoryFeed(limit = 50): Promise<AgentMemoryEntry[]> {
  const { data, error } = await supabase
    .from('agent_memory')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getAgentMemoryFeed: ${error.message}`);
  return data ?? [];
}

// ─── Auto-close helpers ────────────────────────────────────────────────────────

/**
 * Close a trade row by its Deriv contract ID.
 * Returns the trade's agent_run_id so we can update agent_memory outcome.
 */
export async function closeTradeByContractId(
  contractId: string,
  exitPrice: number,
  pnl: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('trades')
    .update({ status: 'CLOSED', exit_price: exitPrice, pnl })
    .eq('deriv_contract_id', contractId)
    .select('agent_run_id')
    .single();

  if (error) throw new Error(`closeTradeByContractId: ${error.message}`);
  return (data as { agent_run_id: string | null })?.agent_run_id ?? null;
}

/** Close a position row by its primary key. */
export async function closePositionById(
  id: string,
  exitPrice: number,
): Promise<void> {
  const { error } = await supabase
    .from('positions')
    .update({ status: 'CLOSED', current_price: exitPrice, unrealized_pnl: 0 })
    .eq('id', id);

  if (error) throw new Error(`closePositionById: ${error.message}`);
}

/** Stamp a WIN or LOSS outcome onto the agent_memory row for a given run. */
export async function updateMemoryOutcome(
  runId: string,
  outcome: 'WIN' | 'LOSS',
): Promise<void> {
  const { error } = await supabase
    .from('agent_memory')
    .update({ outcome })
    .eq('run_id', runId);

  if (error) throw new Error(`updateMemoryOutcome: ${error.message}`);
}
