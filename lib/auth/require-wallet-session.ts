import {
  readWalletSession,
  type WalletSession,
} from '@/lib/auth/wallet-session';

export async function requireWalletSession(): Promise<WalletSession> {
  const session =
    await readWalletSession();

  if (!session) {
    throw new Error(
      'Wallet authentication required.',
    );
  }

  if (session.chainId !== 8453) {
    throw new Error(
      'Toby Hop requires Base mainnet.',
    );
  }

  return session;
}
