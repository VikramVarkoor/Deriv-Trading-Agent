/**
 * Deriv Demo API — WebSocket integration
 *
 * Docs  : https://api.deriv.com
 * App ID: 1089 is Deriv's public testing app_id (no registration required)
 *
 * To get your own API token:
 *   1. Sign up for a FREE demo account at https://app.deriv.com
 *   2. Go to https://app.deriv.com/account/api-token
 *   3. Create a token with "Trade" scope
 *   4. Add it to .env.local as DERIV_API_TOKEN
 *
 * If DERIV_API_TOKEN is not set, the agent runs in paper-only mode
 * (decisions are still logged to Supabase, but no real Deriv calls are made).
 */

import WebSocket from 'ws';
import { TradeAction, DerivTradeResult } from '@/types';

const DERIV_WS_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';
const WS_TIMEOUT_MS = 15_000;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Maps "EUR/USD" → "frxEURUSD" (Deriv symbol format) */
function toDerivSymbol(pair: string): string {
  return `frx${pair.replace('/', '').toUpperCase()}`;
}

/**
 * Opens a WebSocket to Deriv, authorises with the API token,
 * sends a message, waits for a reply of the expected msg_type, then closes.
 */
function derivRequest(
  payload: Record<string, unknown>,
  expectedMsgType: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const token = process.env.DERIV_API_TOKEN!;
    const ws = new WebSocket(DERIV_WS_URL);
    let authorised = false;

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Deriv WebSocket timed out after ${WS_TIMEOUT_MS}ms`));
    }, WS_TIMEOUT_MS);

    ws.on('open', () => {
      ws.send(JSON.stringify({ authorize: token }));
    });

    ws.on('message', (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;

      // Handle authorisation
      if (msg.msg_type === 'authorize') {
        if (msg.error) {
          clearTimeout(timer);
          ws.terminate();
          const err = msg.error as { message: string };
          reject(new Error(`Deriv auth failed: ${err.message}`));
          return;
        }
        authorised = true;
        // Send the actual request
        ws.send(JSON.stringify(payload));
        return;
      }

      // Handle the expected reply
      if (msg.msg_type === expectedMsgType) {
        clearTimeout(timer);
        ws.close();
        resolve(msg);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Deriv WebSocket error: ${err.message}`));
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Places a binary options paper trade on the Deriv demo account.
 *
 * BUY  → CALL contract  (price goes up)
 * SELL → PUT  contract  (price goes down)
 *
 * duration: how long the contract runs (default 5 minutes)
 * stake   : USD amount to risk on the trade (default $10)
 */
export async function placeDemoTrade(
  action: TradeAction,
  pair = 'EUR/USD',
  stakeDollars = 10,
  durationMinutes = 5,
): Promise<DerivTradeResult> {
  // ── Paper-only mode (no DERIV_API_TOKEN) ────────────────────────────────
  if (!process.env.DERIV_API_TOKEN) {
    console.warn(
      '[Deriv] DERIV_API_TOKEN not set — running in paper-only mode. ' +
        'Trade logged to Supabase but NOT sent to Deriv.',
    );
    return {
      success: true,
      contractId: `PAPER_${Date.now()}`,
    };
  }

  if (action === 'HOLD') {
    return { success: false, contractId: '', error: 'Cannot place a HOLD trade.' };
  }

  try {
    const contractType = action === 'BUY' ? 'CALL' : 'PUT';
    const symbol = toDerivSymbol(pair);

    const buyPayload = {
      buy: 1,
      price: stakeDollars,
      parameters: {
        amount: stakeDollars,
        basis: 'stake',
        contract_type: contractType,
        currency: 'USD',
        duration: durationMinutes,
        duration_unit: 'm',
        symbol,
      },
    };

    const reply = await derivRequest(buyPayload, 'buy');

    if (reply.error) {
      const err = reply.error as { message: string };
      return { success: false, contractId: '', error: err.message };
    }

    const buyData = reply.buy as { contract_id: number; longcode: string };
    console.log(`[Deriv] Contract placed: ${buyData.longcode}`);

    return {
      success: true,
      contractId: String(buyData.contract_id),
    };
  } catch (err) {
    return {
      success: false,
      contractId: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verifies your Deriv demo account is reachable and returns the balance.
 * Useful for a health-check endpoint.
 */
export async function checkDerivAccount(): Promise<{
  connected: boolean;
  loginId?: string;
  balance?: number;
  currency?: string;
  error?: string;
}> {
  if (!process.env.DERIV_API_TOKEN) {
    return { connected: false, error: 'DERIV_API_TOKEN not configured' };
  }

  try {
    const reply = await derivRequest({ authorize: process.env.DERIV_API_TOKEN }, 'authorize');

    if (reply.error) {
      const err = reply.error as { message: string };
      return { connected: false, error: err.message };
    }

    const auth = reply.authorize as {
      loginid: string;
      balance: number;
      currency: string;
    };

    return {
      connected: true,
      loginId: auth.loginid,
      balance: auth.balance,
      currency: auth.currency,
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
