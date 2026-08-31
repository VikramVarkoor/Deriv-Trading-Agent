/**
 * Unit tests for src/lib/tradeUtils.ts
 * Pure functions — no mocks needed.
 */

import {
  calcPipPnl,
  calcWinRate,
  buildPnlSeries,
  isLowConfidence,
  formatPrice,
} from '../lib/tradeUtils';
import type { Trade } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    created_at: '2026-01-01T10:00:00Z',
    pair: 'EUR/USD',
    action: 'BUY',
    entry_price: 1.1,
    exit_price: null,
    stop_loss: 1.09,
    take_profit: 1.12,
    status: 'OPEN',
    pnl: null,
    deriv_contract_id: null,
    confidence: 0.7,
    reasoning: null,
    agent_run_id: null,
    ...overrides,
  };
}

// ─── calcPipPnl ───────────────────────────────────────────────────────────────

describe('calcPipPnl', () => {
  it('calculates positive P&L for a winning BUY trade', () => {
    // Entry 1.1000, exit 1.1010 → +1 pip → $10
    const pnl = calcPipPnl(1.1, 1.101, 'BUY');
    expect(pnl).toBeCloseTo(10, 1);
  });

  it('calculates negative P&L for a losing BUY trade', () => {
    // Entry 1.1010, exit 1.1000 → -1 pip → -$10
    const pnl = calcPipPnl(1.101, 1.1, 'BUY');
    expect(pnl).toBeCloseTo(-10, 1);
  });

  it('calculates positive P&L for a winning SELL trade', () => {
    // SELL: profit when price drops. Entry 1.101, exit 1.1 → +10
    const pnl = calcPipPnl(1.101, 1.1, 'SELL');
    expect(pnl).toBeCloseTo(10, 1);
  });

  it('calculates negative P&L for a losing SELL trade', () => {
    const pnl = calcPipPnl(1.1, 1.101, 'SELL');
    expect(pnl).toBeCloseTo(-10, 1);
  });

  it('returns 0 when entry equals exit', () => {
    expect(calcPipPnl(1.1, 1.1, 'BUY')).toBe(0);
    expect(calcPipPnl(1.1, 1.1, 'SELL')).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    const pnl = calcPipPnl(1.10001, 1.10002, 'BUY');
    const decimals = pnl.toString().split('.')[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

// ─── calcWinRate ──────────────────────────────────────────────────────────────

describe('calcWinRate', () => {
  it('returns null rate for empty list', () => {
    expect(calcWinRate([])).toEqual({ wins: 0, total: 0, rate: null });
  });

  it('returns null rate when no closed trades', () => {
    const open = makeTrade({ status: 'OPEN' });
    expect(calcWinRate([open])).toEqual({ wins: 0, total: 0, rate: null });
  });

  it('counts only CLOSED trades with non-null pnl', () => {
    const closed = makeTrade({ status: 'CLOSED', pnl: 20 });
    const open   = makeTrade({ status: 'OPEN' });
    const result = calcWinRate([closed, open]);
    expect(result.total).toBe(1);
  });

  it('computes 100% win rate', () => {
    const trades = [
      makeTrade({ status: 'CLOSED', pnl: 10 }),
      makeTrade({ status: 'CLOSED', pnl: 5  }),
    ];
    expect(calcWinRate(trades)).toEqual({ wins: 2, total: 2, rate: 1 });
  });

  it('computes 0% win rate', () => {
    const trades = [
      makeTrade({ status: 'CLOSED', pnl: -10 }),
      makeTrade({ status: 'CLOSED', pnl: -5  }),
    ];
    expect(calcWinRate(trades)).toEqual({ wins: 0, total: 2, rate: 0 });
  });

  it('computes 50% win rate', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'CLOSED', pnl: 10  }),
      makeTrade({ id: 'b', status: 'CLOSED', pnl: -10 }),
    ];
    const { wins, total, rate } = calcWinRate(trades);
    expect(wins).toBe(1);
    expect(total).toBe(2);
    expect(rate).toBeCloseTo(0.5);
  });
});

// ─── buildPnlSeries ───────────────────────────────────────────────────────────

describe('buildPnlSeries', () => {
  it('returns empty array when no closed trades', () => {
    expect(buildPnlSeries([])).toEqual([]);
  });

  it('accumulates P&L correctly', () => {
    // buildPnlSeries receives trades newest-first (Supabase order) and reverses.
    // Pass newest first: 11:00 (pnl=-5), then 10:00 (pnl=10)
    const trades = [
      makeTrade({ id: 'b', status: 'CLOSED', pnl: -5, created_at: '2026-01-01T11:00:00Z' }),
      makeTrade({ id: 'a', status: 'CLOSED', pnl: 10, created_at: '2026-01-01T10:00:00Z' }),
    ];
    const series = buildPnlSeries(trades);
    expect(series).toHaveLength(2);
    // After reversal: oldest first → [10:00 (+10), 11:00 (-5)]
    // Cumulative: [10, 5]
    expect(series[0].pnl).toBeCloseTo(10);
    expect(series[1].pnl).toBeCloseTo(5);
  });

  it('excludes OPEN trades', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'CLOSED', pnl: 10 }),
      makeTrade({ id: 'b', status: 'OPEN' }),
    ];
    expect(buildPnlSeries(trades)).toHaveLength(1);
  });
});

// ─── isLowConfidence ─────────────────────────────────────────────────────────

describe('isLowConfidence', () => {
  it('returns true when confidence is below threshold', () => {
    expect(isLowConfidence(0.4, 0.55)).toBe(true);
  });

  it('returns false when confidence meets the threshold', () => {
    expect(isLowConfidence(0.55, 0.55)).toBe(false);
  });

  it('returns false when confidence is above threshold', () => {
    expect(isLowConfidence(0.8, 0.55)).toBe(false);
  });

  it('returns false when confidence is null', () => {
    expect(isLowConfidence(null, 0.55)).toBe(false);
  });

  it('returns false when threshold is 0 (filter disabled)', () => {
    expect(isLowConfidence(0.1, 0)).toBe(false);
  });
});

// ─── formatPrice ─────────────────────────────────────────────────────────────

describe('formatPrice', () => {
  it('formats to 5 decimal places by default', () => {
    expect(formatPrice(1.12345)).toBe('1.12345');
  });

  it('respects custom decimal places', () => {
    expect(formatPrice(1.12345, 2)).toBe('1.12');
  });

  it('returns em dash for null', () => {
    expect(formatPrice(null)).toBe('—');
  });

  it('returns em dash for undefined', () => {
    expect(formatPrice(undefined)).toBe('—');
  });
});
