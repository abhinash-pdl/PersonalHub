import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Shared PKCE exchange for Supabase email links (recovery, invites, …).
 *
 * Handles every shape GoTrue may redirect back with:
 * 1. `?code=`                    — modern PKCE link → exchangeCodeForSession
 * 2. `?token_hash=&type=`        — token-hash link → verifyOtp
 * 3. `?error=&error_description=` — expired/used link → back to login with a
 *    readable reason instead of a silent landing.
 */
export async function exchangeAuthCode(request: NextRequest, nextPath: string) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  const loginWithError = (reason: string, detail: string) =>
    NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(reason)}&msg=${encodeURIComponent(detail)}`,
    );

  // GoTrue redirects here with error params when the link is expired,
  // already used, or otherwise invalid.
  const upstreamError =
    searchParams.get('error_code') || (searchParams.get('error') && !code ? searchParams.get('error') : null);
  if (upstreamError && !code && !tokenHash) {
    const detail =
      searchParams.get('error_description') || 'This link is invalid or has expired.';
    return loginWithError('recovery_link', detail.replace(/\+/g, ' '));
  }

  if (!code && !tokenHash) {
    return loginWithError('recovery_link', 'This link is missing its credentials. Request a new reset email.');
  }

  const response = NextResponse.redirect(`${origin}${nextPath}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: (type as 'recovery' | 'email' | 'invite' | 'magiclink' | 'signup') || 'recovery',
    });
    if (error) {
      return loginWithError('recovery_link', error.message);
    }
    return response;
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code as string);
  if (error) {
    return loginWithError('recovery_link', error.message);
  }

  return response;
}
