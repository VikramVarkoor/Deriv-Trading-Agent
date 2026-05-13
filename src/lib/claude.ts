import Groq from 'groq-sdk';
import { AgentDecision, AgentMemoryEntry, OHLCVCandle, Position } from '@/types';
import {
  estimateATR,
  detectTrend,
  formatCandlesForPrompt,
  getLatestPrice,
} from './twelvedata';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = 'llama-3.3-70b-versatile';

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(pair: string): string {
  return `You are an expert algorithmic forex trading analyst. Your job is to analyse live market data for ${pair} and make a disciplined trading decision.

You receive:
1. Recent OHLCV 5-minute candlestick data (oldest → newest)
2. Any currently open positions
3. Your last N trading decisions (memory) and their outcomes

You must output a SINGLE JSON object — nothing else, no markdown, no explanation outside the JSON.

Decision rules you must follow:
- Choose action: "BUY", "SELL", or "HOLD"
- Only enter a new trade when confidence >= 0.55. Otherwise output HOLD.
- If a BUY position is already open, output HOLD (don't pyramid).
- If a SELL position is already open, output HOLD.
- stop_loss must be set for every BUY/SELL (never null on a live trade).
- take_profit should target a minimum 2:1 reward/risk ratio.
- For HOLD, set entry_price, stop_loss, take_profit to null.
- Be concise in reasoning (2-3 sentences max). Mention specific price levels or patterns.
- Learn from past decisions: if the last 2+ trades were losses, be more conservative.
- confidence must reflect your actual conviction — avoid defaulting to exactly 0.5. Use the full range: 0.4 (uncertain), 0.6 (moderate), 0.75 (strong), 0.9 (very strong signal).`;
}

function buildUserPrompt(
  pair: string,
  candles: OHLCVCandle[],
  openPositions: Position[],
  memory: AgentMemoryEntry[],
): string {
  const latestPrice = getLatestPrice(candles);
  const atr = estimateATR(candles);
  const trend = detectTrend(candles);
  const candleTable = formatCandlesForPrompt(candles);

  const positionText =
    openPositions.length > 0
      ? openPositions
          .map(
            (p) =>
              `  • ${p.action} ${p.pair} opened @ ${p.entry_price} | Current P&L: ${p.unrealized_pnl ?? 'unknown'} | SL: ${p.stop_loss} | TP: ${p.take_profit}`,
          )
          .join('\n')
      : '  None';

  const memoryText =
    memory.length > 0
      ? memory
          .map(
            (m) =>
              `  • [${new Date(m.created_at).toUTCString()}] ${m.action} @ conf ${m.confidence} → outcome: ${m.outcome ?? 'PENDING'}\n    Reasoning: "${m.reasoning.slice(0, 120)}${m.reasoning.length > 120 ? '...' : ''}"`,
          )
          .join('\n')
      : '  No previous decisions yet.';

  return `## ${pair} — Live Market Data (5-min candles, oldest → newest)

\`\`\`
${candleTable}
\`\`\`

Current price : ${latestPrice}
Estimated ATR : ${atr.toFixed(5)} (avg candle range)
Trend (window): ${trend}

## Open Positions
${positionText}

## My Recent Decisions (memory)
${memoryText}

---
Now provide your decision as a JSON object with exactly these keys:
{
  "action": "BUY" | "SELL" | "HOLD",
  "pair": "${pair}",
  "reasoning": "<2-3 sentence explanation referencing specific prices/patterns>",
  "confidence": <0.0 to 1.0>,
  "entry_price": <number or null>,
  "stop_loss": <number or null>,
  "take_profit": <number or null>
}`;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function getTradeDecision(
  candles: OHLCVCandle[],
  openPositions: Position[],
  memory: AgentMemoryEntry[],
  pair = 'EUR/USD',
): Promise<AgentDecision> {
  const systemPrompt = buildSystemPrompt(pair);
  const userPrompt = buildUserPrompt(pair, candles, openPositions, memory);

  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Groq returned an empty response.');

  let decision: AgentDecision;
  try {
    decision = JSON.parse(raw) as AgentDecision;
  } catch {
    throw new Error(`Failed to parse Groq JSON:\n${raw}`);
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!['BUY', 'SELL', 'HOLD'].includes(decision.action)) {
    throw new Error(`Invalid action from model: "${decision.action}"`);
  }
  if (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1) {
    throw new Error(`Invalid confidence value: ${decision.confidence}`);
  }
  // Enforce HOLD fields
  if (decision.action === 'HOLD') {
    decision.entry_price = null;
    decision.stop_loss = null;
    decision.take_profit = null;
  }

  return decision;
}
