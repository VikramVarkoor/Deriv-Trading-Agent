'use client';

import { calcWinRate } from '@/lib/tradeUtils';
import type { Trade } from '@/types';

interface WinRateSummaryProps {
  trades: Trade[];
}

const LOW_SAMPLE_THRESHOLD = 30;

/**
 * WinRateSummary — shows win rate for all closed trades.
 *
 * Displays a ⚠ low-sample warning when fewer than 30 closed trades exist,
 * because a win rate on a small sample has very wide confidence intervals
 * and should not be treated as a reliable signal.
 *
 * This component was built using TDD:
 *   1. Tests written first (WinRateSummary.test.tsx)
 *   2. Component implemented until all tests passed
 *   3. Refactored: extracted LOW_SAMPLE_THRESHOLD constant, tightened types
 */
export function WinRateSummary({ trades }: WinRateSummaryProps) {
  const { wins, total, rate } = calcWinRate(trades);

  if (rate === null) {
    return (
      <div
        data-testid="win-rate-summary"
        style={{ color: 'rgba(148,163,184,0.4)', fontSize: 12 }}
      >
        No closed trades yet
      </div>
    );
  }

  const pct = Math.round(rate * 100);
  const isLowSample = total < LOW_SAMPLE_THRESHOLD;
  const color = pct >= 50 ? '#34d399' : '#fb7185';

  return (
    <div data-testid="win-rate-summary" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span
        data-testid="win-rate-value"
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          fontSize: 22,
          color,
          letterSpacing: '-0.02em',
        }}
      >
        {pct}%
      </span>
      <span
        data-testid="win-rate-counts"
        style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)' }}
      >
        {wins}/{total} trades
      </span>
      {isLowSample && (
        <span
          data-testid="low-sample-warning"
          title={`Only ${total} closed trade${total === 1 ? '' : 's'} — need ${LOW_SAMPLE_THRESHOLD} for statistical significance`}
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: '2px 8px',
            borderRadius: 99,
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.3)',
            color: '#fbbf24',
          }}
        >
          ⚠ LOW SAMPLE
        </span>
      )}
    </div>
  );
}
