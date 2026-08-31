/**
 * tradeUtils — pure, side-effect-free helpers for trade calculations.
 * Extracted from page.tsx so they can be unit-tested in isolation.
 */

import type { Trade } from '@/types';

/**
 * Calculate realised P&L in USD for a closed EUR/USD trade.
 *
 * Formula: (exitPrice − entryPrice) × direction × 10,000 pips × $1/pip
 *
 * EUR/USD moves in 4 decimal places. A 1 pip move = 0.0001.
 * At $1/pip notional, 1 pip = $1, so we multiply pct by 10,000.
 *
 * @param entryPrice  Price at which the trade was opened
 * @param exitPrice   Price at which the trade was closed
 * @param action      'BUY' (long) or 'SELL' (short)
 * @returns P&L in USD, rounded to 2 decimal places
 */
export function calcPipPnl(
  entryPrice: number,
  exitPrice: number,
  action: 'BUY' | 'SELL',
): number {
  const direction = action === 'BUY' ? 1 : -1;
  return parseFloat(((exitPrice - entryPrice) * direction * 10_000).toFixed(2));
}

/**
 * Compute win rate statistics from a list of trades.
 * Only considers CLOSED trades with a non-null pnl.
 *
 * @returns { wins, total, rate } — rate is null when total === 0
 */
export function calcWinRate(trades: Trade[]): {
  wins: number;
  total: number;
  rate: number | null;
} {
  const closed = trades.filter((t) => t.status === 'CLOSED' && t.pnl != null);
  if (closed.length === 0) return { wins: 0, total: 0, rate: null };
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  return { wins, total: closed.length, rate: wins / closed.length };
}

/**
 * Build cumulative P&L time-series for the AreaChart.
 * Iterates closed trades oldest-first and accumulates P&L.
 */
export function buildPnlSeries(
  trades: Trade[],
): { time: string; pnl: number }[] {
  let cum = 0;
  return [...trades]
    .reverse()
    .filter((t) => t.status === 'CLOSED' && t.pnl != null)
    .map((t) => {
      cum += t.pnl!;
      return {
        time: new Date(t.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        pnl: parseFloat(cum.toFixed(2)),
      };
    });
}

/**
 * Returns true if a trade's confidence is below the given threshold.
 * Used to flag low-conviction trades in the trade log.
 */
export function isLowConfidence(
  confidence: number | null | undefined,
  threshold: number,
): boolean {
  if (confidence == null || threshold <= 0) return false;
  return confidence < threshold;
}

/**
 * Format a price to a fixed number of decimal places (default 5 for FX).
 */
export function formatPrice(price: number | null | undefined, decimals = 5): string {
  if (price == null) return '—';
  return price.toFixed(decimals);
}
