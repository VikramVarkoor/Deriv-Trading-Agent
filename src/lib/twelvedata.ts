import { OHLCVCandle, TwelveDataResponse } from '@/types';

const BASE_URL = 'https://api.twelvedata.com';

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchOHLCV(
  symbol = 'EUR/USD',
  interval = '5min',
  outputsize = 20,
): Promise<OHLCVCandle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY environment variable is not set.');

  const url = new URL(`${BASE_URL}/time_series`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('outputsize', String(outputsize));
  url.searchParams.set('apikey', apiKey);

  const res = await fetch(url.toString(), {
    // Always fetch fresh data — never use Next.js cache for live prices
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Twelve Data HTTP ${res.status}: ${res.statusText}`);
  }

  const json: TwelveDataResponse = await res.json();

  if (json.status === 'error') {
    throw new Error(`Twelve Data API error: ${JSON.stringify(json)}`);
  }

  if (!json.values || json.values.length === 0) {
    throw new Error('Twelve Data returned no candle data. Market may be closed.');
  }

  return json.values; // Newest candle first
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Latest close price (index 0 = most recent) */
export function getLatestPrice(candles: OHLCVCandle[]): number {
  return parseFloat(candles[0].close);
}

/**
 * Returns a plain-text table of candles for the Claude prompt.
 * Sorted oldest → newest so Claude can read trend direction naturally.
 */
export function formatCandlesForPrompt(candles: OHLCVCandle[]): string {
  const header = 'Datetime              | Open    | High    | Low     | Close   | Volume';
  const divider = '----------------------|---------|---------|---------|---------|---------';
  const rows = [...candles]
    .reverse() // oldest first
    .map(
      (c) =>
        `${c.datetime.padEnd(21)}| ${c.open.padEnd(8)}| ${c.high.padEnd(8)}| ${c.low.padEnd(8)}| ${c.close.padEnd(8)}| ${c.volume}`,
    );
  return [header, divider, ...rows].join('\n');
}

/**
 * Simple ATR-like volatility estimate: average of (high - low) over all candles.
 * Used by the Claude prompt for context.
 */
export function estimateATR(candles: OHLCVCandle[]): number {
  const ranges = candles.map((c) => parseFloat(c.high) - parseFloat(c.low));
  return ranges.reduce((sum, r) => sum + r, 0) / ranges.length;
}

/**
 * Basic trend detection: compare the first and last close in the window.
 * Returns "UPTREND", "DOWNTREND", or "SIDEWAYS".
 */
export function detectTrend(candles: OHLCVCandle[]): string {
  const oldest = parseFloat(candles[candles.length - 1].close);
  const newest = parseFloat(candles[0].close);
  const change = ((newest - oldest) / oldest) * 100;
  if (change > 0.05) return 'UPTREND';
  if (change < -0.05) return 'DOWNTREND';
  return 'SIDEWAYS';
}
