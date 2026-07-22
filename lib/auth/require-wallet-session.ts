import {
  requireAppSession,
} from '@/lib/auth/require-app-session';

export type WalletSession = {
  address: `0x${string}`;
  chainId: 8453;
};

export async function requireWalletSession():
Promise<WalletSession> {
  const session =
    await requireAppSession();

  if (!session.address) {
    throw new Error(
      'A verified wallet address is required.',
    );
  }

  return {
    address:
      session.address,
    chainId: 8453,
  };
}
