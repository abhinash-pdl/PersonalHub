import React from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server-data';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getAuthenticatedUser();
  if (user) redirect('/dashboard');
  return <LoginForm />;
}
