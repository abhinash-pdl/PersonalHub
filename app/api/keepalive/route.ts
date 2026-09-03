// Keep-alive endpoint: wakes up Supabase and Render free-tier instances.
// Trigger externally via UptimeRobot or cron every ~5 minutes.
//
//   GET https://spaceofmine.abhinash.info/api/keepalive
//
// Optionally protect with ?token=<KEEPALIVE_TOKEN> if you set that env var.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const now = Date.now();
  const base = new URL(request.url).origin;

  const token = process.env.KEEPALIVE_TOKEN;
  if (token) {
    const supplied = new URL(request.url).searchParams.get('token');
    if (supplied !== token) {
      return NextResponse.json({ ok: false, reason: 'bad token' }, { status: 401 });
    }
  }

  const results: Record<string, string> = {};

  // 1. Wake Supabase (REST ping keeps DB/realtime warm)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && anonKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/?apikey=${anonKey}`, {
        headers: { apikey: anonKey },
        cache: 'no-store',
      });
      results.supabase = `${res.status} (${Date.now() - now}ms)`;
    } catch (e) {
      results.supabase = `ERROR ${(e as Error).message}`;
    }
  }

  // 2. Wake the app itself (keeps Render from sleeping)
  try {
    const res = await fetch(base, { cache: 'no-store' });
    results.render = `${res.status} (${Date.now() - now}ms)`;
  } catch (e) {
    results.render = `ERROR ${(e as Error).message}`;
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), results });
}
