/**
 * filtersSlice — Redux Toolkit slice for trade history filters.
 *
 * WHY REDUX HERE (not local state):
 * The filter state is read by three independent subtrees:
 *   1. TradeFilters control bar (writes)
 *   2. Trade table (reads filtered list)
 *   3. WinRateSummary (reads to show rate on the filtered subset)
 * Prop-drilling from page.tsx would create tight coupling across all three.
 * Redux makes this genuinely cleaner and keeps each component self-contained.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './index';
import type { Trade } from '@/types';

// ─── State shape ─────────────────────────────────────────────────────────────

export type StatusFilter = 'ALL' | 'OPEN' | 'CLOSED';
export type ActionFilter = 'ALL' | 'BUY' | 'SELL' | 'HOLD';

export interface FiltersState {
  /** Trade status filter */
  status: StatusFilter;
  /** Minimum confidence 0–1; trades below this are hidden */
  minConfidence: number;
  /** Trade action (direction) filter */
  action: ActionFilter;
}

const initialState: FiltersState = {
  status: 'ALL',
  minConfidence: 0,
  action: 'ALL',
};

// ─── Slice ───────────────────────────────────────────────────────────────────

export const filtersSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    setStatus(state, action: PayloadAction<StatusFilter>) {
      state.status = action.payload;
    },
    setMinConfidence(state, action: PayloadAction<number>) {
      state.minConfidence = Math.min(1, Math.max(0, action.payload));
    },
    setAction(state, action: PayloadAction<ActionFilter>) {
      state.action = action.payload;
    },
    resetFilters: () => initialState,
  },
});

export const { setStatus, setMinConfidence, setAction, resetFilters } =
  filtersSlice.actions;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectFilters = (state: RootState) => state.filters;

/**
 * Apply the current filter state to a list of trades.
 * Kept as a pure function so it can be unit-tested without the Redux store.
 */
export function applyFilters(trades: Trade[], filters: FiltersState): Trade[] {
  return trades.filter((t) => {
    if (filters.status !== 'ALL' && t.status !== filters.status) return false;
    if (filters.action !== 'ALL' && t.action !== filters.action) return false;
    if (t.confidence != null && t.confidence < filters.minConfidence) return false;
    return true;
  });
}

export default filtersSlice.reducer;
