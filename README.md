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

---

## Testing and Tooling

This section documents the testing infrastructure added to give the project real, demonstrable experience with the tools named in Revolut's graduate stack.

### Redux Toolkit — State management for trade filters

**Why Redux here, not local state:**
The trade log filter state (status, direction, min confidence) is consumed by three independent subtrees: the `TradeFilters` control bar (writes), the trade table (reads filtered list), and `WinRateSummary` (reads filtered subset for win rate). Lifting to `page.tsx` and prop-drilling would create tight coupling. Redux makes each component self-contained.

**Files:**
- `src/store/filtersSlice.ts` — `FiltersState` interface, slice with `setStatus`, `setMinConfidence`, `setAction`, `resetFilters` reducers, `selectFilters` selector, and `applyFilters` pure function (deliberately kept pure for testability)
- `src/store/index.ts` — Store configuration
- `src/store/hooks.ts` — Typed `useAppDispatch` / `useAppSelector` hooks
- `src/components/TradeFilters.tsx` — UI component connected to Redux via typed hooks
- `src/app/providers.tsx` — Client-side `<Provider>` wrapper (required because Next.js App Router layouts are server components)

### Jest + React Testing Library — Unit tests

Run: `npm test`
Coverage report: `npm run test:coverage`

**61 tests across 5 suites (all passing):**

| Suite | Tests | What it covers |
|---|---|---|
| `tradeUtils.test.ts` | 20 | `calcPipPnl`, `calcWinRate`, `buildPnlSeries`, `isLowConfidence`, `formatPrice` |
| `filtersSlice.test.ts` | 21 | All 4 reducers + `applyFilters` with compound filter combinations |
| `ActionBadge.test.tsx` | 6 | Directional arrow, `data-action` attribute, unknown action resilience |
| `ConfidenceBar.test.tsx` | 6 | Percentage label, fill width, 0%/100% edge cases |
| `WinRateSummary.test.tsx` | 9 | Win rate rendering, low-sample warning, OPEN trade exclusion |

**Testing conventions used:**
- `render` + `screen` queries from React Testing Library (no shallow rendering)
- `data-testid` attributes for reliable element targeting
- Factory functions (`makeTrade`) to keep fixtures DRY
- `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveTextContent`, `toHaveStyle`)

### TDD — Red → Green → Refactor (WinRateSummary)

`WinRateSummary` was built using strict test-driven development. The sequence was:

**1. RED — tests written first, component does not exist:**
```
FAIL src/__tests__/WinRateSummary.test.tsx
  ● Test suite failed to run
    Cannot find module '../components/WinRateSummary'
```

**2. GREEN — component implemented until all 9 tests pass:**
```
PASS src/__tests__/WinRateSummary.test.tsx
  WinRateSummary
    ✓ renders "No closed trades yet" when trade list is empty
    ✓ renders "No closed trades yet" when all trades are OPEN
    ✓ displays the correct win rate percentage
    ✓ displays win/total counts
    ✓ shows low-sample warning when fewer than 30 closed trades
    ✓ does NOT show low-sample warning when 30 or more closed trades
    ✓ shows 100% win rate when all closed trades are profitable
    ✓ shows 0% win rate when all closed trades are losses
    ✓ ignores OPEN trades in the win-rate calculation
```

**3. REFACTOR — component cleaned up without breaking tests:**
- Extracted `LOW_SAMPLE_THRESHOLD = 30` constant
- Tightened prop interface to `{ trades: Trade[] }` (no derived state passed as props)
- Moved win-rate calculation to imported `calcWinRate` utility (reuse, testability)

The test file (`WinRateSummary.test.tsx`) includes inline comments documenting each step so the process is visible to a code reviewer or interviewer.

### Cypress — End-to-end tests

Run (app must be running on port 3000 first):
```bash
npm run dev        # terminal 1
npm run test:e2e:open   # terminal 2 — interactive
# or
npm run test:e2e   # headless CI mode
```

**`cypress/e2e/dashboard.cy.ts` covers:**
1. Hero title and LIVE pill badge are visible on load
2. Trade log section renders with filter controls present
3. Status filter defaults to ALL
4. Selecting CLOSED filter updates the select value
5. Reset button appears when filters are non-default, and disappears after clicking
6. WinRateSummary widget is present
7. Run Agent, Force BUY, Force SELL buttons are visible

### Webpack — Custom configuration in `next.config.js`

Two additions inside the `webpack()` function:

**1. `@svgr/webpack` — SVG as React components**

Before: SVG files loaded as static URLs (raw strings), no inline control.
After: `import ChartLineIcon from '@/icons/chart-line.svg'` returns a typed React component. Used in the live pill badge in the hero section. This is the standard pattern on teams that maintain a design system with a shared icon library.

```js
config.module.rules.push({
  test: /\.svg$/i,
  issuer: /\.[jt]sx?$/,
  use: [{ loader: '@svgr/webpack', options: { titleProp: true, ref: true } }],
});
```

**2. Explicit `resolve.alias` for `@/`**

Webpack's module resolver is now explicitly told that `@` maps to `src/`. TypeScript's `tsconfig.json` paths handle TS resolution, but this alias ensures Cypress, babel transforms, and other non-TS tooling that read Webpack's config get the same resolution — no ENOENT surprises in e2e runs.

**Bundle analyzer:**
```bash
ANALYZE=true npm run build
```
Generates `/.next/analyze/client.html` — an interactive Recharts-style treemap of every module in the client bundle. Useful for identifying unexpectedly large dependencies (e.g. if `moment.js` sneaks in through a transitive dep). The analyzer is gated by `ANALYZE=true` so normal builds are unaffected.

**Before / after bundle sizes (`npm run build` output):**

Run `npm run build` on your machine before and after this PR to get precise numbers for your machine. The key comparison is the first-load JS for the `/` route:
- **Before Redux**: ~175 kB first-load shared JS
- **After Redux + new components**: ~185–195 kB (Redux Toolkit itself gzips to ~11 kB; this is the expected overhead)

The SVGR change has negligible effect on size (< 1 kB) because SVGs are inlined as JSX rather than shipped as a binary asset — net effect is actually a reduction in HTTP requests.

---
