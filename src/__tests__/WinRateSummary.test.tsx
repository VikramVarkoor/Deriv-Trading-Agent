/**
 * WinRateSummary — TDD red-green-refactor example
 *
 * RED:   This test was written BEFORE WinRateSummary.tsx existed.
 *        Running `jest` at this point fails with "Cannot find module".
 *
 * GREEN: WinRateSummary.tsx was then implemented to make these tests pass.
 *
 * REFACTOR: After green, the component was cleaned up (constants extracted,
 *           prop types tightened) without re-breaking the tests.
 *
 * This file is left as-is to document the process for CV / interview purposes.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WinRateSummary } from '../components/WinRateSummary';
import type { Trade } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

const closedWin  = makeTrade({ status: 'CLOSED', pnl: 20  });
const closedLoss = makeTrade({ status: 'CLOSED', pnl: -10 });
const openTrade  = makeTrade({ status: 'OPEN' });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WinRateSummary', () => {
  it('renders "No closed trades yet" when trade list is empty', () => {
    render(<WinRateSummary trades={[]} />);
    expect(screen.getByText(/no closed trades/i)).toBeInTheDocument();
  });

  it('renders "No closed trades yet" when all trades are OPEN', () => {
    render(<WinRateSummary trades={[openTrade]} />);
    expect(screen.getByText(/no closed trades/i)).toBeInTheDocument();
  });

  it('displays the correct win rate percentage', () => {
    // 1 win out of 2 closed → 50%
    render(<WinRateSummary trades={[closedWin, closedLoss]} />);
    expect(screen.getByTestId('win-rate-value')).toHaveTextContent('50%');
  });

  it('displays win/total counts', () => {
    render(<WinRateSummary trades={[closedWin, closedLoss]} />);
    expect(screen.getByTestId('win-rate-counts')).toHaveTextContent('1/2');
  });

  it('shows low-sample warning when fewer than 30 closed trades', () => {
    render(<WinRateSummary trades={[closedWin, closedLoss]} />);
    expect(screen.getByTestId('low-sample-warning')).toBeInTheDocument();
  });

  it('does NOT show low-sample warning when 30 or more closed trades', () => {
    const thirtyWins = Array.from({ length: 30 }, (_, i) =>
      makeTrade({ id: `t-${i}`, status: 'CLOSED', pnl: 10 }),
    );
    render(<WinRateSummary trades={thirtyWins} />);
    expect(screen.queryByTestId('low-sample-warning')).not.toBeInTheDocument();
  });

  it('shows 100% win rate when all closed trades are profitable', () => {
    render(<WinRateSummary trades={[closedWin]} />);
    expect(screen.getByTestId('win-rate-value')).toHaveTextContent('100%');
  });

  it('shows 0% win rate when all closed trades are losses', () => {
    render(<WinRateSummary trades={[closedLoss]} />);
    expect(screen.getByTestId('win-rate-value')).toHaveTextContent('0%');
  });

  it('ignores OPEN trades in the win-rate calculation', () => {
    // 1 win + 1 open → still 100% (1/1 closed)
    render(<WinRateSummary trades={[closedWin, openTrade]} />);
    expect(screen.getByTestId('win-rate-value')).toHaveTextContent('100%');
    expect(screen.getByTestId('win-rate-counts')).toHaveTextContent('1/1');
  });
});
