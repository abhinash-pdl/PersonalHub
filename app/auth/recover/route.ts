import { NextRequest } from 'next/server';
import { exchangeAuthCode } from '@/app/auth/exchange';

export async function GET(request: NextRequest) {
  return exchangeAuthCode(request, '/reset-password');
}
