import { NextRequest } from 'next/server';
import { exchangeAuthCode } from '@/app/auth/exchange';

/**
 * Password-recovery callback. Kept query-free on purpose: the exact URL
 * `…/auth/recover` is allow-listed in Supabase, so GoTrue always honours it
 * and lands the user on the enter-new-password page.
 */
export async function GET(request: NextRequest) {
  return exchangeAuthCode(request, '/reset-password');
}
