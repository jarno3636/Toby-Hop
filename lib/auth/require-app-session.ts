import {
  readAppSession,
  type AppSession,
} from '@/lib/auth/app-session';

export async function requireAppSession():
Promise<AppSession> {
  const session =
    await readAppSession();

  if (!session) {
    throw new Error(
      'Authentication required.',
    );
  }

  if (
    session.chainId !== 8453
  ) {
    throw new Error(
      'Toby Hop requires Base mainnet.',
    );
  }

  return session;
}
