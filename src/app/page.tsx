'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { createClient } from '@supabase/supabase-js';
import type { AgentMemoryEntry, Trade, AgentRunResult } from '@/types';
import { useMemo } from 'react';
import { ActionBadge } from '@/components/ActionBadge';
import { ConfidenceBar } from '@/components/ConfidenceBar';
import { WinRateSummary } from '@/components/WinRateSummary';
import { TradeFilters } from '@/components/TradeFilters';
import { useAppSelector } from '@/store/hooks';
import { selectFilters, applyFilters } from '@/store/filtersSlice';
import { buildPnlSeries } from '@/lib/tradeUtils';
import ChartLineIcon from '@/icons/chart-line.svg';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  BUY:  { text: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.28)',  glow: '0 0 40px rgba(52,211,153,0.18)'  },
  SELL: { text: '#fb7185', bg: 'rgba(251,113,133,0.12)', border: 'rgba(251,113,133,0.28)', glow: '0 0 40px rgba(251,113,133,0.18)' },
  HOLD: { text: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.28)',  glow: '0 0 40px rgba(251,191,36,0.18)'  },
} as const;

type Action = keyof typeof C;

// ─── Reusable primitives ──────────────────────────────────────────────────────

function Glass({
  children, style, glow, p = '24px',
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  glow?: string;
  p?: string;
}) {
  return (
    <div style={{
      background: 'rgba(12, 18, 38, 0.6)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 20,
      padding: p,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: glow
        ? `0 2px 4px rgba(0,0,0,0.5), 0 20px 50px rgba(0,0,0,0.35), ${glow}`
        : '0 2px 4px rgba(0,0,0,0.5), 0 20px 50px rgba(0,0,0,0.35)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: 'rgba(148,163,184,0.5)',
      marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

function LiveDot() {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 9, height: 9 }}>
      <span style={{ position: 'absolute', width: 9, height: 9, borderRadius: '50%', background: '#34d399', animation: 'pulse-ring 1.8s ease-out infinite' }} />
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', position: 'relative' }} />
    </span>
  );
}

function Btn({
  onClick, disabled, variant = 'ghost', children, title,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'ghost' | 'buy' | 'sell' | 'primary';
  children: React.ReactNode;
  title?: string;
}) {
  const v = {
    ghost:   { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)',   color: '#94a3b8', shadow: 'none' },
    buy:     { bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.3)',    color: '#34d399', shadow: '0 0 20px rgba(52,211,153,0.15)' },
    sell:    { bg: 'rgba(251,113,133,0.1)',  border: 'rgba(251,113,133,0.3)',   color: '#fb7185', shadow: '0 0 20px rgba(251,113,133,0.15)' },
    primary: { bg: 'linear-gradient(135deg, #6366f1, #818cf8)', border: 'transparent', color: '#fff', shadow: '0 0 28px rgba(99,102,241,0.45)' },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '10px 20px', borderRadius: 12, fontWeight: 600, fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.18s ease',
        border: `1px solid ${v.border}`,
        background: v.bg,
        color: v.color,
        boxShadow: v.shadow,
        fontFamily: 'Space Grotesk, sans-serif',
        display: 'inline-flex', alignItems: 'center', gap: 7,
      }}
    >
      {children}
    </button>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [memory, setMemory]   = useState<AgentMemoryEntry[]>([]);
  const [trades,  setTrades]  = useState<Trade[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<AgentRunResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [refreshAt, setRefreshAt] = useState(new Date());
  const filters = useAppSelector(selectFilters);
  const filteredTrades = useMemo(() => applyFilters(trades, filters), [trades, filters]);

  const fetchData = useCallback(async () => {
    const [{ data: memData }, { data: tradeData }] = await Promise.all([
      sb.from('agent_memory').select('*').order('created_at', { ascending: false }).limit(50),
      sb.from('trades').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    if (memData)   setMemory(memData as AgentMemoryEntry[]);
    if (tradeData) setTrades(tradeData as Trade[]);
    setRefreshAt(new Date());
  }, []);

  useEffect(() => {
    // Initial load
    fetchData();

    // Supabase Realtime — dashboard updates the instant any row changes
    const channel = sb
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_memory' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => {
        fetchData();
      })
      .subscribe();

    // 30s fallback poll (handles cases where realtime is not enabled in Supabase)
    const fallback = setInterval(fetchData, 30_000);

    return () => {
      sb.removeChannel(channel);
      clearInterval(fallback);
    };
  }, [fetchData]);

  async function triggerAgent(forceAction?: 'BUY' | 'SELL') {
    setRunning(true);
    setError(null);
    try {
      const res  = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: forceAction ? JSON.stringify({ force_action: forceAction }) : undefined,
      });
      const data: AgentRunResult = await res.json();
      setLastRun(data);
      if (!data.success) setError(data.error ?? 'Unknown error');
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────────
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');
  const wins         = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalPnl     = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const winRate      = closedTrades.length > 0 ? Math.round((wins / closedTrades.length) * 100) : null;
  const latestDecision = memory[0];
  const latestAction   = latestDecision?.action as Action | undefined;
  const pnlColor       = totalPnl >= 0 ? '#34d399' : '#fb7185';
  const actionC        = latestAction ? C[latestAction] : null;

  const pnlChartData = buildPnlSeries(trades);

  const signalChartData = [...memory]
    .reverse()
    .slice(-20)
    .map((entry, i) => ({
      i: i + 1,
      confidence: Math.round(entry.confidence * 100),
      action: entry.action,
      color: C[entry.action as Action]?.text ?? '#64748b',
    }));

  const statCards = [
    { label: 'Total Trades', value: String(trades.length),            color: '#818cf8' },
    { label: 'Total P&L',    value: `$${totalPnl.toFixed(2)}`,        color: pnlColor  },
    { label: 'Win Rate',     value: winRate != null ? `${winRate}%` : '—',
      color: winRate != null ? (winRate >= 50 ? '#34d399' : '#fb7185') : 'rgba(148,163,184,0.4)' },
    { label: 'Agent Runs',   value: String(memory.length),             color: '#818cf8' },
    { label: 'Last Signal',  value: latestAction ?? '—',
      color: latestAction ? C[latestAction].text : 'rgba(148,163,184,0.4)' },
    ...(lastRun ? [{ label: 'Live Price', value: String(lastRun.latestPrice), color: '#34d399' }] : []),
  ];

  const TOOLTIP_STYLE = {
    background: '#080e1f',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 12,
    fontSize: 12,
    color: '#e2e8f0',
  };

  return (
    <>
      {/* ── Floating background orbs ──────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', width: 800, height: 800, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 70%)',
          top: '-250px', left: '-180px',
          animation: 'float1 24s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 650, height: 650, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
          bottom: '-120px', right: '4%',
          animation: 'float2 30s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)',
          top: '38%', right: '-80px',
          animation: 'float3 22s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52,211,153,0.06) 0%, transparent 70%)',
          top: '65%', left: '22%',
          animation: 'float1 32s ease-in-out infinite reverse',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1300, margin: '0 auto', padding: '0 28px 72px' }}>

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <div style={{
          textAlign: 'center',
          padding: '88px 0 64px',
          animation: 'fade-up 0.65s ease both',
        }}>
          {/* Live pill badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 18px', borderRadius: 99,
            background: 'rgba(52,211,153,0.08)',
            border: '1px solid rgba(52,211,153,0.22)',
            marginBottom: 28,
          }}>
            <LiveDot />
            <ChartLineIcon style={{ width: 11, height: 11, opacity: 0.7 }} />
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: '#34d399',
            }}>
              LIVE · EUR/USD · PAPER TRADING
            </span>
          </div>

          {/* Big gradient title */}
          <h1 style={{
            fontSize: 'clamp(44px, 8vw, 94px)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            background: 'linear-gradient(135deg, #f0f4f8 0%, #c7d2fe 35%, #818cf8 65%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: 18,
          }}>
            Deriv Trading<br />Agent
          </h1>

          <p style={{ color: 'rgba(148,163,184,0.6)', fontSize: 14, marginBottom: 36, letterSpacing: '0.01em' }}>
            Groq llama-3.3-70b-versatile · Twelve Data · Supabase · Next.js 14
          </p>

          {/* Latest signal badge + confidence */}
          {latestDecision && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 20,
              background: 'rgba(12,18,38,0.55)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${actionC?.border ?? 'rgba(255,255,255,0.07)'}`,
              borderRadius: 16,
              padding: '14px 24px',
              marginBottom: 40,
              boxShadow: actionC?.glow,
            }}>
              <ActionBadge action={latestDecision.action} size="lg" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
                <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Confidence</span>
                <ConfidenceBar value={latestDecision.confidence} />
              </div>
            </div>
          )}

          {/* Control buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Btn onClick={fetchData} variant="ghost">
              ↻ Refresh
            </Btn>
            <Btn onClick={() => triggerAgent('BUY')} disabled={running} variant="buy" title="Force a BUY trade for testing">
              ↑ Force BUY
            </Btn>
            <Btn onClick={() => triggerAgent('SELL')} disabled={running} variant="sell" title="Force a SELL trade for testing">
              ↓ Force SELL
            </Btn>
            <Btn onClick={() => triggerAgent()} disabled={running} variant="primary">
              {running ? (
                <>
                  <span style={{
                    width: 12, height: 12,
                    border: '2px solid rgba(255,255,255,0.35)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }} />
                  Running…
                </>
              ) : '▶ Run Agent'}
            </Btn>
          </div>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div style={{
            background: 'rgba(251,113,133,0.1)',
            border: '1px solid rgba(251,113,133,0.28)',
            color: '#fb7185',
            padding: '13px 18px', borderRadius: 14, marginBottom: 20,
            fontSize: 13, display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <span>⚠</span> {error}
          </div>
        )}

        {/* ── Stat cards row ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
          {statCards.map(({ label, value, color }) => (
            <Glass key={label} p="18px 20px">
              <SectionLabel>{label}</SectionLabel>
              <div style={{
                fontSize: 26, fontWeight: 800,
                color, letterSpacing: '-0.02em',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                {value}
              </div>
            </Glass>
          ))}
        </div>

        {/* ── Latest decision card ─────────────────────────────────────────── */}
        {latestDecision && (
          <Glass
            glow={actionC?.glow}
            style={{ marginBottom: 20, borderColor: actionC?.border ?? 'rgba(255,255,255,0.07)' }}
          >
            {/* Accent line at top */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 1,
              background: actionC
                ? `linear-gradient(90deg, ${actionC.text}55, transparent 55%)`
                : 'transparent',
            }} />

            <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Action + timestamp */}
              <div style={{ minWidth: 130 }}>
                <SectionLabel>Latest Decision</SectionLabel>
                <ActionBadge action={latestDecision.action} size="md" />
                <div style={{
                  marginTop: 12, fontSize: 11,
                  color: 'rgba(148,163,184,0.45)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  {new Date(latestDecision.created_at).toLocaleString()}
                </div>
              </div>

              {/* AI reasoning */}
              <div style={{ flex: 1, minWidth: 220, borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 32 }}>
                <SectionLabel>AI Reasoning</SectionLabel>
                <p style={{ color: 'rgba(226,232,240,0.82)', lineHeight: 1.78, fontSize: 14, marginBottom: 18 }}>
                  {latestDecision.reasoning}
                </p>
                <SectionLabel>Confidence</SectionLabel>
                <ConfidenceBar value={latestDecision.confidence} />
              </div>

              {/* Last run mini stats */}
              {lastRun && (
                <div style={{ minWidth: 160, borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 32 }}>
                  <SectionLabel>Last Run</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { k: 'Price', v: String(lastRun.latestPrice), c: undefined },
                      {
                        k: 'Trade',
                        v: lastRun.tradeExecuted ? '✓ Executed' : '– Skipped',
                        c: lastRun.tradeExecuted ? '#34d399' : 'rgba(148,163,184,0.45)',
                      },
                    ].map(({ k, v, c }) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                        <span style={{ color: 'rgba(148,163,184,0.55)', fontSize: 12 }}>{k}</span>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 600, fontSize: 12,
                          color: c ?? 'var(--text)',
                        }}>{v}</span>
                      </div>
                    ))}
                    {lastRun.contractId && (
                      <div style={{ color: 'rgba(148,163,184,0.35)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
                        #{lastRun.contractId.slice(-14)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Glass>
        )}

        {/* ── Charts ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* P&L curve */}
          <Glass>
            <SectionLabel>Cumulative P&L — Closed Trades</SectionLabel>
            {pnlChartData.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                height: 190, gap: 10, color: 'rgba(148,163,184,0.35)',
              }}>
                <span style={{ fontSize: 30 }}>📈</span>
                <span style={{ fontSize: 13 }}>P&amp;L chart appears after first closed trade</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={pnlChartData}>
                  <defs>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={pnlColor} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={pnlColor} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time"
                    tick={{ fill: 'rgba(148,163,184,0.35)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(148,163,184,0.35)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: 'rgba(148,163,184,0.5)' }}
                    formatter={(v: number) => [`$${v}`, 'P&L']}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                  <Area
                    type="monotone" dataKey="pnl"
                    stroke={pnlColor} strokeWidth={2}
                    fill="url(#pnlGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: pnlColor, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Glass>

          {/* Signal confidence history */}
          <Glass>
            <SectionLabel>Signal Confidence History</SectionLabel>
            {signalChartData.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                height: 190, gap: 10, color: 'rgba(148,163,184,0.35)',
              }}>
                <span style={{ fontSize: 30 }}>🤖</span>
                <span style={{ fontSize: 13 }}>Run the agent to see signal history</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={signalChartData} barSize={14}>
                  <XAxis dataKey="i"
                    tick={{ fill: 'rgba(148,163,184,0.35)', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: 'rgba(148,163,184,0.35)', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: 'rgba(148,163,184,0.5)' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: number, _: any, p: any) => [`${v}%`, p?.payload?.action ?? 'Signal']}
                    labelFormatter={() => ''}
                  />
                  <Bar dataKey="confidence" radius={[5, 5, 0, 0]}>
                    {signalChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Glass>
        </div>

        {/* ── Decision log + Trade log ──────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Decision log */}
          <Glass>
            <SectionLabel>Agent Decision Log</SectionLabel>
            <div style={{ maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
              {memory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '52px 0', color: 'rgba(148,163,184,0.35)', fontSize: 13 }}>
                  No decisions yet — run the agent to start
                </div>
              ) : (
                memory.map((entry, i) => (
                  <div key={entry.id} style={{
                    padding: '16px 0',
                    borderBottom: i < memory.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <ActionBadge action={entry.action} />
                      <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.45)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.7)', lineHeight: 1.7, marginBottom: 10 }}>
                      {entry.reasoning}
                    </p>
                    <ConfidenceBar value={entry.confidence} />
                    {entry.outcome && entry.outcome !== 'PENDING' && (
                      <div style={{
                        marginTop: 8, fontSize: 11, fontWeight: 700,
                        color: entry.outcome === 'WIN' ? '#34d399' : '#fb7185',
                      }}>
                        {entry.outcome === 'WIN' ? '✓' : '✗'} {entry.outcome}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Glass>

          {/* Trade log */}
          <Glass>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
              <SectionLabel>Trade Log</SectionLabel>
              <WinRateSummary trades={trades} />
            </div>
            <TradeFilters />
            {filteredTrades.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '52px 0', color: 'rgba(148,163,184,0.35)', fontSize: 13 }}>
                No trades match the current filters
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table data-testid="trade-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Time', 'Action', 'Entry', 'SL', 'TP', 'Status', 'P&L'].map((h) => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '0 10px 14px',
                          fontWeight: 600, fontSize: 10,
                          textTransform: 'uppercase', letterSpacing: '0.12em',
                          color: 'rgba(148,163,184,0.45)',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrades.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '12px 10px', color: 'rgba(148,163,184,0.45)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, whiteSpace: 'nowrap' }}>
                          {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <ActionBadge action={t.action} />
                        </td>
                        <td style={{ padding: '12px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                          {t.entry_price ?? '—'}
                        </td>
                        <td style={{ padding: '12px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#fb7185' }}>
                          {t.stop_loss ?? '—'}
                        </td>
                        <td style={{ padding: '12px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#34d399' }}>
                          {t.take_profit ?? '—'}
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                            color: t.status === 'OPEN' ? '#34d399' : t.status === 'CLOSED' ? 'rgba(148,163,184,0.45)' : '#fb7185',
                          }}>
                            {t.status === 'OPEN' && '● '}{t.status}
                          </span>
                        </td>
                        <td style={{
                          padding: '12px 10px',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontWeight: 700, fontSize: 12,
                          color: t.pnl == null ? 'rgba(148,163,184,0.35)' : t.pnl >= 0 ? '#34d399' : '#fb7185',
                        }}>
                          {t.pnl != null ? `$${t.pnl.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Glass>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{
          textAlign: 'center', marginTop: 52,
          display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'rgba(148,163,184,0.3)', fontSize: 11, marginRight: 4 }}>
            last refresh {refreshAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ·
          </span>
          {['Groq llama-3.3-70b', 'Twelve Data', 'Deriv Demo', 'Supabase', 'Next.js 14', 'Vercel'].map((s) => (
            <span key={s} style={{
              padding: '4px 12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 99, fontSize: 11,
              color: 'rgba(148,163,184,0.45)',
            }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
