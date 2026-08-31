/**
 * Unit tests for filtersSlice (Redux Toolkit).
 * Tests reducers directly + the applyFilters pure function.
 */

import {
  filtersSlice,
  setStatus,
  setMinConfidence,
  setAction,
  resetFilters,
  applyFilters,
  FiltersState,
} from '../store/filtersSlice';
import type { Trade } from '../types';

const { reducer } = filtersSlice;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const initial: FiltersState = {
  status: 'ALL',
  minConfidence: 0,
  action: 'ALL',
};

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    created_at: '2026-01-01T00:00:00Z',
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

// ─── Reducer tests ────────────────────────────────────────────────────────────

describe('filtersSlice reducer', () => {
  it('returns the initial state', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initial);
  });

  it('setStatus updates status filter', () => {
    const state = reducer(initial, setStatus('CLOSED'));
    expect(state.status).toBe('CLOSED');
  });

  it('setStatus does not mutate other fields', () => {
    const state = reducer({ ...initial, action: 'BUY' }, setStatus('OPEN'));
    expect(state.action).toBe('BUY');
  });

  it('setMinConfidence updates minConfidence', () => {
    const state = reducer(initial, setMinConfidence(0.6));
    expect(state.minConfidence).toBeCloseTo(0.6);
  });

  it('setMinConfidence clamps values above 1', () => {
    const state = reducer(initial, setMinConfidence(1.5));
    expect(state.minConfidence).toBe(1);
  });

  it('setMinConfidence clamps values below 0', () => {
    const state = reducer(initial, setMinConfidence(-0.1));
    expect(state.minConfidence).toBe(0);
  });

  it('setAction updates action filter', () => {
    const state = reducer(initial, setAction('SELL'));
    expect(state.action).toBe('SELL');
  });

  it('resetFilters returns to initial state', () => {
    const modified: FiltersState = { status: 'CLOSED', minConfidence: 0.7, action: 'BUY' };
    const state = reducer(modified, resetFilters());
    expect(state).toEqual(initial);
  });
});

// ─── applyFilters tests ───────────────────────────────────────────────────────

describe('applyFilters', () => {
  const open   = makeTrade({ id: 'open',   status: 'OPEN',   action: 'BUY',  confidence: 0.8 });
  const closed = makeTrade({ id: 'closed', status: 'CLOSED', action: 'SELL', confidence: 0.4 });
  const hold   = makeTrade({ id: 'hold',   status: 'OPEN',   action: 'HOLD', confidence: 0.5 });

  it('returns all trades when all filters are ALL/0', () => {
    const result = applyFilters([open, closed, hold], initial);
    expect(result).toHaveLength(3);
  });

  it('filters by status OPEN', () => {
    const result = applyFilters([open, closed], { ...initial, status: 'OPEN' });
    expect(result).toEqual([open]);
  });

  it('filters by status CLOSED', () => {
    const result = applyFilters([open, closed], { ...initial, status: 'CLOSED' });
    expect(result).toEqual([closed]);
  });

  it('filters by action BUY', () => {
    const result = applyFilters([open, closed, hold], { ...initial, action: 'BUY' });
    expect(result).toEqual([open]);
  });

  it('filters by minConfidence', () => {
    // closed has confidence 0.4, which is below 0.5
    const result = applyFilters([open, closed], { ...initial, minConfidence: 0.5 });
    expect(result).toEqual([open]);
  });

  it('includes trades with null confidence regardless of threshold', () => {
    const nullConf = makeTrade({ id: 'nc', confidence: null });
    const result = applyFilters([nullConf], { ...initial, minConfidence: 0.8 });
    expect(result).toEqual([nullConf]);
  });

  it('applies multiple filters simultaneously', () => {
    const result = applyFilters([open, closed, hold], {
      status: 'OPEN',
      action: 'BUY',
      minConfidence: 0.5,
    });
    expect(result).toEqual([open]);
  });

  it('returns empty array when no trades match', () => {
    const result = applyFilters([open], { ...initial, status: 'CLOSED' });
    expect(result).toEqual([]);
  });
});
