'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectFilters,
  setStatus,
  setMinConfidence,
  setAction,
  resetFilters,
  StatusFilter,
  ActionFilter,
} from '@/store/filtersSlice';

const SELECT_STYLE: React.CSSProperties = {
  background: 'rgba(12,18,38,0.8)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#94a3b8',
  fontSize: 12,
  fontFamily: 'Space Grotesk, sans-serif',
  fontWeight: 600,
  padding: '6px 10px',
  cursor: 'pointer',
  outline: 'none',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'rgba(148,163,184,0.45)',
};

/**
 * TradeFilters — filter bar for the trade log table.
 * Reads and writes Redux state via typed hooks.
 * Connected to filtersSlice (status, action, minConfidence).
 */
export function TradeFilters() {
  const dispatch = useAppDispatch();
  const filters  = useAppSelector(selectFilters);

  const isActive =
    filters.status !== 'ALL' ||
    filters.action !== 'ALL' ||
    filters.minConfidence > 0;

  return (
    <div
      data-testid="trade-filters"
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      {/* Status filter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={LABEL_STYLE}>Status</span>
        <select
          data-testid="filter-status"
          value={filters.status}
          onChange={(e) => dispatch(setStatus(e.target.value as StatusFilter))}
          style={SELECT_STYLE}
        >
          <option value="ALL">All</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* Action filter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={LABEL_STYLE}>Direction</span>
        <select
          data-testid="filter-action"
          value={filters.action}
          onChange={(e) => dispatch(setAction(e.target.value as ActionFilter))}
          style={SELECT_STYLE}
        >
          <option value="ALL">All</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
          <option value="HOLD">HOLD</option>
        </select>
      </div>

      {/* Min confidence slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={LABEL_STYLE}>
          Min confidence:{' '}
          <span style={{ color: '#818cf8' }}>
            {Math.round(filters.minConfidence * 100)}%
          </span>
        </span>
        <input
          data-testid="filter-confidence"
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(filters.minConfidence * 100)}
          onChange={(e) => dispatch(setMinConfidence(Number(e.target.value) / 100))}
          style={{ cursor: 'pointer', accentColor: '#818cf8', width: 110 }}
        />
      </div>

      {/* Reset — only shown when filters are active */}
      {isActive && (
        <button
          data-testid="filter-reset"
          onClick={() => dispatch(resetFilters())}
          style={{
            padding: '6px 14px',
            borderRadius: 10,
            border: '1px solid rgba(251,113,133,0.3)',
            background: 'rgba(251,113,133,0.08)',
            color: '#fb7185',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'Space Grotesk, sans-serif',
            cursor: 'pointer',
            letterSpacing: '0.08em',
          }}
        >
          ✕ Reset
        </button>
      )}
    </div>
  );
}
