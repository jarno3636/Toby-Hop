import {
  SignJWT,
  jwtVerify,
} from 'jose';
import { cookies } from 'next/headers';
import {
  getAddress,
  type Address,
} from 'viem';

const SESSION_COOKIE =
  'toby_hop_session';

const NONCE_COOKIE =
  'toby_hop_siwe_nonce';

const SESSION_DURATION_SECONDS =
  60 * 60 * 24 * 30;

export type WalletSession = {
  address: Address;
  chainId: number;
};

function getSessionSecret(): Uint8Array {
  const value =
    process.env.TOBY_HOP_SESSION_SECRET;

  if (!value || value.length < 32) {
    throw new Error(
      'TOBY_HOP_SESSION_SECRET must contain at least 32 characters.',
    );
  }

  return new TextEncoder().encode(value);
}

export async function createWalletSession(
  session: WalletSession,
): Promise<void> {
  const token = await new SignJWT({
    address: getAddress(session.address),
    chainId: session.chainId,
  })
    .setProtectedHeader({
      alg: 'HS256',
    })
    .setIssuedAt()
    .setExpirationTime(
      `${SESSION_DURATION_SECONDS}s`,
    )
    .setIssuer('toby-hop')
    .setAudience('toby-hop-web')
    .sign(getSessionSecret());

  const cookieStore = await cookies();

  cookieStore.set(
    SESSION_COOKIE,
    token,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        'production',
      sameSite: 'lax',
      path: '/',
      maxAge:
        SESSION_DURATION_SECONDS,
    },
  );
}

export async function readWalletSession(): Promise<
  WalletSession | null
> {
  const cookieStore = await cookies();

  const token =
    cookieStore.get(
      SESSION_COOKIE,
    )?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } =
      await jwtVerify(
        token,
        getSessionSecret(),
        {
          issuer: 'toby-hop',
          audience:
            'toby-hop-web',
        },
      );

    if (
      typeof payload.address !==
        'string' ||
      typeof payload.chainId !==
        'number'
    ) {
      return null;
    }

    return {
      address: getAddress(
        payload.address,
      ),
      chainId: payload.chainId,
    };
  } catch {
    return null;
  }
}

export async function clearWalletSession(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(
    SESSION_COOKIE,
    '',
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    },
  );
}

export async function storeSiweNonce(
  nonce: string,
): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(
    NONCE_COOKIE,
    nonce,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    },
  );
}

export async function consumeSiweNonce(): Promise<
  string | null
> {
  const cookieStore = await cookies();

  const nonce =
    cookieStore.get(
      NONCE_COOKIE,
    )?.value ?? null;

  cookieStore.set(
    NONCE_COOKIE,
    '',
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    },
  );

  return nonce;
}
