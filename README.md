# Deriv Trading Agent

An autonomous AI trading agent that monitors live EUR/USD forex data, uses Claude to reason about it, and places paper trades on Deriv's demo API. Memory, trades, and agent decisions are persisted in Supabase. A live dashboard shows trades, Claude's reasoning, and running P&L.

**Stack:** TypeScript · Next.js 14 · Claude Sonnet · Twelve Data · Deriv Demo API · Supabase · Vercel

---

## Architecture

```
Every 5 min (Vercel cron)
         │
         ▼
  GET /api/cron ──► POST /api/agent
                          │
                    ┌─────┴──────────────────────────────┐
                    │                                    │
              Twelve Data API                      Supabase
              (EUR/USD OHLCV)               (open positions + memory)
                    │                                    │
                    └─────────────┐  ┌──────────────────┘
                                  ▼  ▼
                            Claude Sonnet
                       (reasoning + decision)
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
              BUY / SELL                       HOLD
                    │                            │
           Deriv Demo API                 log to memory
          (paper contract)                only, no trade
                    │
           persist to Supabase
           (trades + positions)
```

---


## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── agent/route.ts     # Main agent loop endpoint
│   │   └── cron/route.ts      # Vercel cron trigger
│   ├── layout.tsx
│   ├── globals.css
│   └── page.tsx               # Live dashboard
├── lib/
│   ├── claude.ts              # Claude reasoning engine
│   ├── supabase.ts            # DB helpers
│   ├── twelvedata.ts          # Market data fetcher
│   └── deriv.ts               # Deriv WebSocket client
├── types/
│   └── index.ts               # Shared TypeScript types
supabase/
└── schema.sql                  # Run once to set up DB
vercel.json                     # Cron schedule (every 5 min)
```

---


## Key Links

- Deriv API docs: [api.deriv.com](https://api.deriv.com)
- Twelve Data: [twelvedata.com](https://twelvedata.com)
- Anthropic API: [docs.anthropic.com](https://docs.anthropic.com)
- Supabase: [supabase.com](https://supabase.com)
