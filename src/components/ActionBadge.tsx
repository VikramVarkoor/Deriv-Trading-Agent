'use client';

const COLORS = {
  BUY:  { text: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.28)',  glow: '0 0 40px rgba(52,211,153,0.18)'  },
  SELL: { text: '#fb7185', bg: 'rgba(251,113,133,0.12)', border: 'rgba(251,113,133,0.28)', glow: '0 0 40px rgba(251,113,133,0.18)' },
  HOLD: { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.28)',  glow: '0 0 40px rgba(251,191,36,0.18)'  },
} as const;

type Action = keyof typeof COLORS;

interface ActionBadgeProps {
  action: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Coloured pill badge showing BUY / SELL / HOLD with directional arrow.
 * Size 'lg' adds a glow effect for the hero decision card.
 */
export function ActionBadge({ action, size = 'sm' }: ActionBadgeProps) {
  const c =
    COLORS[action as Action] ?? {
      text: '#64748b',
      bg: 'rgba(100,116,139,0.1)',
      border: 'rgba(100,116,139,0.2)',
      glow: 'none',
    };
  const arrow = action === 'BUY' ? '↑' : action === 'SELL' ? '↓' : '–';
  const s =
    size === 'lg'
      ? { pad: '10px 26px', fs: 17, afs: 20 }
      : size === 'md'
      ? { pad: '6px 16px', fs: 13, afs: 14 }
      : { pad: '3px 11px', fs: 10, afs: 11 };

  return (
    <span
      data-testid="action-badge"
      data-action={action}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: s.pad,
        borderRadius: 99,
        fontWeight: 700,
        fontSize: s.fs,
        letterSpacing: '0.1em',
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        boxShadow: size === 'lg' ? c.glow : undefined,
        fontFamily: 'Space Grotesk, sans-serif',
      }}
    >
      <span style={{ fontSize: s.afs }}>{arrow}</span> {action}
    </span>
  );
}

export { COLORS as ACTION_COLORS };
