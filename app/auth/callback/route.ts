import { NextRequest } from 'next/server';
import { exchangeAuthCode } from '@/app/auth/exchange';

/**
 * Generic PKCE callback for Supabase emails (?next=... selects destination).
 * Recovery mail now uses /auth/recover instead; this stays for compatibility.
 */
export async function GET(request: NextRequest) {
  const next = new URL(request.url).searchParams.get('next') ?? '/dashboard';
  return exchangeAuthCode(request, next);
}
