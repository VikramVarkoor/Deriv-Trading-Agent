'use client';

interface ConfidenceBarProps {
  /** Confidence value between 0 and 1 */
  value: number;
}

/**
 * Horizontal progress bar showing agent confidence percentage.
 * Green ≥75%, amber ≥50%, red <50%.
 */
export function ConfidenceBar({ value }: ConfidenceBarProps) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#fb7185';

  return (
    <div
      data-testid="confidence-bar"
      style={{ display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <div
        style={{
          flex: 1,
          height: 3,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 99,
          overflow: 'hidden',
        }}
      >
        <div
          data-testid="confidence-bar-fill"
          style={{
            width: `${pct}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${color}80)`,
            borderRadius: 99,
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
      <span
        data-testid="confidence-bar-label"
        style={{
          color,
          fontWeight: 700,
          fontSize: 12,
          minWidth: 32,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
