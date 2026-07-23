import {
  SignJWT,
  jwtVerify,
} from 'jose';
import { cookies } from 'next/headers';
import {
  getAddress,
  isAddress,
  type Address,
} from 'viem';

const SESSION_COOKIE =
  'toby_hop_session';

const NONCE_COOKIE =
  'toby_hop_siwe_nonce';

const SESSION_DURATION_SECONDS =
  60 * 60 * 24 * 30;

export type AuthMethod =
  | 'siwe'
  | 'farcaster';

export type AppSession = {
  authMethod: AuthMethod;
  address?: Address;
  fid?: number;
  chainId: 8453;
};

function getSessionSecret(): Uint8Array {
  const value =
    process.env.TOBY_HOP_SESSION_SECRET;

  if (
    !value ||
    value.length < 32
  ) {
    throw new Error(
      'TOBY_HOP_SESSION_SECRET must contain at least 32 characters.',
    );
  }

  return new TextEncoder().encode(value);
}

function getCookieSecurity() {
  const production =
    process.env.NODE_ENV === 'production';

  return {
    secure: production,
    sameSite:
      production
        ? ('none' as const)
        : ('lax' as const),
  };
}

function normalizeSession(
  session: AppSession,
): AppSession {
  const address =
    session.address &&
    isAddress(session.address)
      ? getAddress(session.address)
      : undefined;

  const fid =
    Number.isSafeInteger(session.fid) &&
    Number(session.fid) > 0
      ? Number(session.fid)
      : undefined;

  if (
    session.authMethod === 'siwe' &&
    !address
  ) {
    throw new Error(
      'A SIWE session requires a wallet address.',
    );
  }

  if (
    session.authMethod === 'farcaster' &&
    !fid
  ) {
    throw new Error(
      'A Farcaster session requires a valid FID.',
    );
  }

  return {
    authMethod: session.authMethod,
    address,
    fid,
    chainId: 8453,
  };
}

export async function createAppSession(
  value: AppSession,
): Promise<void> {
  const session =
    normalizeSession(value);

  const token =
    await new SignJWT({
      authMethod:
        session.authMethod,
      address:
        session.address,
      fid:
        session.fid,
      chainId:
        session.chainId,
    })
      .setProtectedHeader({
        alg: 'HS256',
      })
      .setIssuedAt()
      .setExpirationTime(
        `${SESSION_DURATION_SECONDS}s`,
      )
      .setIssuer('toby-hop')
      .setAudience('toby-hop-app')
      .sign(getSessionSecret());

  const cookieStore =
    await cookies();

  const security =
    getCookieSecurity();

  cookieStore.set(
    SESSION_COOKIE,
    token,
    {
      httpOnly: true,
      secure: security.secure,
      sameSite: security.sameSite,
      path: '/',
      maxAge:
        SESSION_DURATION_SECONDS,
      priority: 'high',
    },
  );
}

export async function readAppSession():
Promise<AppSession | null> {
  const cookieStore =
    await cookies();

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
            'toby-hop-app',
        },
      );

    const authMethod =
      payload.authMethod;

    if (
      authMethod !== 'siwe' &&
      authMethod !== 'farcaster'
    ) {
      return null;
    }

    const address =
      typeof payload.address ===
        'string' &&
      isAddress(payload.address)
        ? getAddress(payload.address)
        : undefined;

    const fid =
      typeof payload.fid ===
        'number' &&
      Number.isSafeInteger(
        payload.fid,
      ) &&
      payload.fid > 0
        ? payload.fid
        : undefined;

    if (payload.chainId !== 8453) {
      return null;
    }

    if (
      authMethod === 'siwe' &&
      !address
    ) {
      return null;
    }

    if (
      authMethod === 'farcaster' &&
      !fid
    ) {
      return null;
    }

    return {
      authMethod,
      address,
      fid,
      chainId: 8453,
    };
  } catch (cause) {
    console.warn(
      'Unable to restore Toby Hop session:',
      cause,
    );

    return null;
  }
}

export async function updateAppSessionAddress(
  address: Address,
): Promise<void> {
  const session =
    await readAppSession();

  if (!session) {
    throw new Error(
      'Authentication required.',
    );
  }

  await createAppSession({
    ...session,
    address:
      getAddress(address),
  });
}

export async function clearAppSession():
Promise<void> {
  const cookieStore =
    await cookies();

  const security =
    getCookieSecurity();

  cookieStore.set(
    SESSION_COOKIE,
    '',
    {
      httpOnly: true,
      secure: security.secure,
      sameSite: security.sameSite,
      path: '/',
      maxAge: 0,
      priority: 'high',
    },
  );
}

export async function storeSiweNonce(
  nonce: string,
): Promise<void> {
  const cookieStore =
    await cookies();

  const security =
    getCookieSecurity();

  cookieStore.set(
    NONCE_COOKIE,
    nonce,
    {
      httpOnly: true,
      secure: security.secure,
      sameSite: security.sameSite,
      path: '/',
      maxAge: 10 * 60,
      priority: 'high',
    },
  );
}

export async function consumeSiweNonce():
Promise<string | null> {
  const cookieStore =
    await cookies();

  const nonce =
    cookieStore.get(
      NONCE_COOKIE,
    )?.value ?? null;

  const security =
    getCookieSecurity();

  cookieStore.set(
    NONCE_COOKIE,
    '',
    {
      httpOnly: true,
      secure: security.secure,
      sameSite: security.sameSite,
      path: '/',
      maxAge: 0,
      priority: 'high',
    },
  );

  return nonce;
}
