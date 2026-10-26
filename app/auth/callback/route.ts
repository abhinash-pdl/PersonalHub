import { NextRequest } from 'next/server';
import { exchangeAuthCode } from '@/app/auth/exchange';

export async function GET(request: NextRequest) {
  const next = new URL(request.url).searchParams.get('next') ?? '/dashboard';
  return exchangeAuthCode(request, next);
}
