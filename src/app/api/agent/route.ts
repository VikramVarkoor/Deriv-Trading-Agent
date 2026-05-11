/**
 * POST /api/agent
 *
 * The main autonomous agent loop. Call this endpoint to run one cycle:
 *   1. Fetch live EUR/USD OHLCV data from Twelve Data
 *   2. Load open positions + recent memory from Supabase
 *   3. Ask Claude to reason and decide (BUY / SELL / HOLD)
 *   4. If BUY or SELL: execute on Deriv demo API, persist to Supabase
 *   5. Always persist the decision to agent_memory
 *
 * This endpoint is called by the Vercel cron job every 5 minutes
 * (see /api/cron) and can also be triggered manually from the dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { fetchOHLCV, getLatestPrice } from '@/lib/twelvedata';
import { getTradeDecision } from '@/lib/claude';
import {
  getOpenPositions,
  getRecentMemory,
  saveAgentMemory,
  createTrade,
  createPosition,
  closeTradeByContractId,
  closePositionById,
  updateMemoryOutcome,
} from '@/lib/supabase';
import { placeDemoTrade } from '@/lib/deriv';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Pro: up to 300s; Hobby: 60s

const PAIR = 'EUR/USD';

export async function POST(req: NextRequest) {
  const runId = randomUUID();
  const startTime = Date.now();

  // Optional force_action for testing: POST body { "force_action": "BUY" | "SELL" }
  let forceAction: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.force_action === 'BUY' || body?.force_action === 'SELL') {
      forceAction = body.force_action;
    }
  } catch { /* no body is fine */ }

  try {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[Agent] Run ${runId} started at ${new Date().toISOString()}${forceAction ? ` (FORCED: ${forceAction})` : ''}`);

    // ── Step 1: Market data ────────────────────────────────────────────────
    console.log('[Agent] Fetching OHLCV data from Twelve Data…');
    const candles = await fetchOHLCV(PAIR, '5min', 20);
    const latestPrice = getLatestPrice(candles);
    console.log(`[Agent] ${PAIR} latest price: ${latestPrice}`);

    // ── Step 2: Context from Supabase ─────────────────────────────────────
    const [openPositions, recentMemory] = await Promise.all([
      getOpenPositions(),
      getRecentMemory(PAIR, 5),
    ]);
    console.log(
      `[Agent] Context → open positions: ${openPositions.length}, memory entries: ${recentMemory.length}`,
    );

    // ── Step 2b: Auto-close positions that hit SL or TP ───────────────────
    // P&L = pips × $1/pip  (1 pip = 0.0001 for EUR/USD → × 10 000)
    let positionsClosed = 0;
    for (const pos of openPositions) {
      if (
        !pos.entry_price ||
        !pos.stop_loss   ||
        !pos.take_profit ||
        !pos.deriv_contract_id
      ) continue;

      const isBuy = pos.action === 'BUY';
      const hitTP = isBuy
        ? latestPrice >= pos.take_profit
        : latestPrice <= pos.take_profit;
      const hitSL = isBuy
        ? latestPrice <= pos.stop_loss
        : latestPrice >= pos.stop_loss;

      if (!hitTP && !hitSL) continue;

      const exitPrice = hitTP ? pos.take_profit : pos.stop_loss;
      const pnl = parseFloat(
        ((exitPrice - pos.entry_price) * (isBuy ? 1 : -1) * 10_000).toFixed(2),
      );
      const outcome: 'WIN' | 'LOSS' = hitTP ? 'WIN' : 'LOSS';

      console.log(
        `[Agent] Auto-closing position ${pos.id} → ${outcome} | exit: ${exitPrice} | P&L: $${pnl}`,
      );

      const agentRunId = await closeTradeByContractId(pos.deriv_contract_id, exitPrice, pnl);
      await closePositionById(pos.id, exitPrice);
      if (agentRunId) await updateMemoryOutcome(agentRunId, outcome);

      positionsClosed++;
    }
    if (positionsClosed > 0) {
      console.log(`[Agent] Auto-closed ${positionsClosed} position(s).`);
    }

    // ── Step 3: Decision (AI or forced) ───────────────────────────────────
    let decision;
    if (forceAction) {
      console.log(`[Agent] Using forced action: ${forceAction}`);
      decision = {
        action: forceAction as 'BUY' | 'SELL',
        pair: PAIR,
        reasoning: `Forced ${forceAction} triggered manually for testing purposes.`,
        confidence: 1.0,
        entry_price: latestPrice,
        stop_loss: forceAction === 'BUY' ? latestPrice - 0.0020 : latestPrice + 0.0020,
        take_profit: forceAction === 'BUY' ? latestPrice + 0.0040 : latestPrice - 0.0040,
      };
    } else {
      console.log('[Agent] Requesting decision from Groq…');
      decision = await getTradeDecision(candles, openPositions, recentMemory, PAIR);
    }
    console.log(`[Agent] Decision: ${decision.action} | confidence: ${decision.confidence}`);
    console.log(`[Agent] Reasoning: "${decision.reasoning}"`);

    // ── Step 4: Persist memory (always, even for HOLD) ────────────────────
    await saveAgentMemory(
      decision,
      {
        latestPrice,
        recentCandles: candles.slice(0, 5).map((c) => ({
          datetime: c.datetime,
          close: c.close,
        })),
      },
      runId,
    );

    // ── Step 5: Execute trade (BUY / SELL only) ───────────────────────────
    let tradeExecuted = false;
    let contractId: string | undefined;
    let tradeError: string | undefined;

    if (decision.action !== 'HOLD') {
      console.log(`[Agent] Executing ${decision.action} trade on Deriv demo…`);
      const result = await placeDemoTrade(decision.action, PAIR, 10, 5);

      if (result.success) {
        contractId = result.contractId;
        await Promise.all([
          createTrade(decision, runId, contractId),
          createPosition(decision, contractId),
        ]);
        tradeExecuted = true;
        console.log(`[Agent] Trade persisted. Contract ID: ${contractId}`);
      } else {
        tradeError = result.error;
        console.error(`[Agent] Trade execution failed: ${tradeError}`);
        // Still return 200 — the decision was valid, just execution failed
      }
    } else {
      console.log('[Agent] HOLD decision — no trade executed.');
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Agent] Run ${runId} completed in ${elapsed}ms.`);

    return NextResponse.json({
      success: true,
      runId,
      pair: PAIR,
      latestPrice,
      decision,
      tradeExecuted,
      contractId: contractId ?? null,
      tradeError: tradeError ?? null,
      positionsClosed,
      elapsedMs: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Agent] Run ${runId} FAILED:`, message);

    return NextResponse.json(
      {
        success: false,
        runId,
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

// GET returns basic status — useful for health checks
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/agent',
    method: 'POST to trigger one agent run',
    pair: PAIR,
    timestamp: new Date().toISOString(),
  });
}
