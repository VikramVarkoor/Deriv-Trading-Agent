/**
 * Local cron loop — simulates Vercel's cron job during development.
 * Calls POST /api/agent every 5 minutes and logs the result.
 *
 * Usage:
 *   npm run cron
 *
 * Keep this running in a separate terminal alongside `npm run dev`.
 * Press Ctrl+C to stop.
 */

const AGENT_URL = 'http://localhost:3000/api/agent';
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function runAgent() {
  const now = new Date().toLocaleTimeString();
  console.log(`\n[Cron] ${now} — triggering agent run…`);

  try {
    const res = await fetch(AGENT_URL, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      const { decision, latestPrice, tradeExecuted, contractId, elapsedMs } = data;
      console.log(`[Cron] ✓ ${decision.action} | price: ${latestPrice} | conf: ${(decision.confidence * 100).toFixed(0)}% | ${elapsedMs}ms`);
      console.log(`[Cron]   "${decision.reasoning}"`);
      if (tradeExecuted) {
        console.log(`[Cron]   Trade executed — contract: ${contractId}`);
      }
    } else {
      console.error(`[Cron] ✗ Agent failed: ${data.error}`);
    }
  } catch (err) {
    console.error(`[Cron] ✗ Fetch failed: ${err.message}`);
    console.error(`[Cron]   Is the dev server running? (npm run dev)`);
  }
}

// Run immediately on start, then every 5 minutes
console.log(`[Cron] Starting local cron loop — firing every 5 minutes.`);
console.log(`[Cron] Keep this running alongside: npm run dev`);
console.log(`[Cron] Press Ctrl+C to stop.\n`);

runAgent();
setInterval(runAgent, INTERVAL_MS);
