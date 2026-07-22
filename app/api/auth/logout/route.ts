import {
  NextResponse,
} from 'next/server';

import {
  clearAppSession,
} from '@/lib/auth/app-session';

export async function POST() {
  await clearAppSession();

  return NextResponse.json({
    authenticated: false,
    user: null,
  });
}
