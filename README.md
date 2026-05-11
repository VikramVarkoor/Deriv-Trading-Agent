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

## Day 1 Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd deriv-trading-agent
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
# Open .env.local and fill in your API keys
```

You need:
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com/settings/keys)
- `TWELVE_DATA_API_KEY` — free at [twelvedata.com](https://twelvedata.com/pricing)
- Supabase `URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` — from your project's Settings → API
- `DERIV_API_TOKEN` — optional for Day 1; see below

### 3. Set up Supabase tables

1. Open your Supabase project → **SQL Editor**
2. Paste the contents of `supabase/schema.sql`
3. Click **Run**

This creates three tables: `trades`, `positions`, `agent_memory`.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the dashboard.

### 5. Test the agent loop

```bash
# Trigger one agent run manually
curl -X POST http://localhost:3000/api/agent | jq .
# or use the "Run Agent Now" button in the dashboard
```

You should see Claude's reasoning, confidence score, and decision in the response JSON.

---

## Day 2: Deriv Integration

1. Sign up for a **free demo account** at [app.deriv.com](https://app.deriv.com)
2. Go to [app.deriv.com/account/api-token](https://app.deriv.com/account/api-token)
3. Create a token with **Trade** + **Read** scopes
4. Add `DERIV_API_TOKEN=your_token` to `.env.local`

Without a token the agent runs in paper-only mode — all decisions are logged but no Deriv WebSocket calls are made. This is useful for Day 1 testing.

---

## Day 3: Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add all environment variables in Vercel's project settings (Dashboard → Settings → Environment Variables). The cron job is defined in `vercel.json` and runs every 5 minutes automatically on Vercel's infrastructure.

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
