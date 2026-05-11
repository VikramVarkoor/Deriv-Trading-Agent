/**
 * GET /api/cron
 *
 * Vercel Cron Job endpoint — runs every 5 minutes (see vercel.json).
 * Vercel sends an Authorization: Bearer <CRON_SECRET> header automatically.
 *
 * This endpoint simply proxies to POST /api/agent so all logic stays there.
 * You can also hit this manually to trigger a run:
 *   curl -H "Authorization: Bearer <your-CRON_SECRET>" https://your-app.vercel.app/api/cron
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[Cron] Unauthorised request rejected.');
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  console.log('[Cron] Tick — triggering agent run…');

  // ── Call the agent endpoint ───────────────────────────────────────────────
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${request.headers.get('host')}`;

  const agentRes = await fetch(`${baseUrl}/api/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const agentData = await agentRes.json();

  return NextResponse.json({
    cron: true,
    triggeredAt: new Date().toISOString(),
    agentResult: agentData,
  });
}
