import {
  createClient,
  Errors,
} from '@farcaster/quick-auth';

export type FarcasterAuthUser = {
  fid: number;
};

const quickAuthClient =
  createClient();

function getAuthorizationToken(
  request: Request,
): string {
  const authorization =
    request.headers.get(
      'authorization',
    );

  if (
    !authorization ||
    !authorization
      .toLowerCase()
      .startsWith('bearer ')
  ) {
    throw new Error(
      'Missing Farcaster authorization.',
    );
  }

  const token =
    authorization
      .slice(7)
      .trim();

  if (!token) {
    throw new Error(
      'Missing Farcaster authorization token.',
    );
  }

  return token;
}

function normalizeDomain(
  value: string,
): string {
  const trimmed =
    value.trim();

  if (!trimmed) {
    throw new Error(
      'The Farcaster authentication domain is not configured.',
    );
  }

  /*
    Accept either:
      toby-hop.vercel.app

    or:
      https://toby-hop.vercel.app

    The Quick Auth verifier needs only the hostname.
  */
  if (
    trimmed.startsWith(
      'http://',
    ) ||
    trimmed.startsWith(
      'https://',
    )
  ) {
    return new URL(
      trimmed,
    ).host;
  }

  return trimmed
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function getExpectedDomain(
  request: Request,
): string {
  /*
    This should be your permanent production Mini App
    hostname, with no protocol and no trailing slash.
  */
  const configuredAudience =
    process.env
      .FARCASTER_JWT_AUDIENCE;

  if (configuredAudience) {
    return normalizeDomain(
      configuredAudience,
    );
  }

  const configuredAppUrl =
    process.env
      .NEXT_PUBLIC_APP_URL;

  if (configuredAppUrl) {
    return normalizeDomain(
      configuredAppUrl,
    );
  }

  /*
    This fallback helps local development, but production
    should always set FARCASTER_JWT_AUDIENCE explicitly.
  */
  const forwardedHost =
    request.headers
      .get('x-forwarded-host')
      ?.split(',')[0]
      ?.trim();

  if (forwardedHost) {
    return normalizeDomain(
      forwardedHost,
    );
  }

  return new URL(
    request.url,
  ).host;
}

export async function requireFarcasterUser(
  request: Request,
): Promise<FarcasterAuthUser> {
  const token =
    getAuthorizationToken(
      request,
    );

  const domain =
    getExpectedDomain(
      request,
    );

  try {
    const payload =
      await quickAuthClient
        .verifyJwt({
          token,
          domain,
        });

    const fid =
      Number(payload.sub);

    if (
      !Number.isSafeInteger(fid) ||
      fid <= 0
    ) {
      throw new Error(
        'The Farcaster token contains an invalid FID.',
      );
    }

    return {
      fid,
    };
  } catch (cause) {
    if (
      cause instanceof
      Errors.InvalidTokenError
    ) {
      console.error(
        'Invalid Farcaster Quick Auth token:',
        {
          domain,
          message:
            cause.message,
        },
      );

      throw new Error(
        `Invalid Farcaster token for ${domain}.`,
      );
    }

    console.error(
      'Farcaster Quick Auth verification failed:',
      {
        domain,
        cause,
      },
    );

    throw cause;
  }
}
