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

  if (!authorization) {
    throw new Error(
      'Missing Farcaster authorization.',
    );
  }

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    );

  const token =
    match?.[1]?.trim() ??
    '';

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

  let hostname =
    trimmed;

  try {
    const url =
      trimmed.startsWith(
        'http://',
      ) ||
      trimmed.startsWith(
        'https://',
      )
        ? new URL(trimmed)
        : new URL(
            `https://${trimmed}`,
          );

    hostname =
      url.hostname;
  } catch {
    throw new Error(
      'The configured Farcaster authentication domain is invalid.',
    );
  }

  const normalized =
    hostname
      .trim()
      .toLowerCase()
      .replace(
        /\.$/,
        '',
      );

  if (!normalized) {
    throw new Error(
      'The Farcaster authentication domain is invalid.',
    );
  }

  return normalized;
}

function getFirstHeaderValue(
  value: string | null,
): string | null {
  const first =
    value
      ?.split(',')[0]
      ?.trim();

  return first || null;
}

function getExpectedDomain(
  request: Request,
): string {
  /*
   * Production should set this to the exact hostname used
   * to launch the Mini App:
   *
   * FARCASTER_JWT_AUDIENCE=toby-hop.vercel.app
   *
   * Do not include:
   * - https://
   * - a path
   * - a trailing slash
   */
  const configuredAudience =
    process.env
      .FARCASTER_JWT_AUDIENCE;

  if (configuredAudience) {
    return normalizeDomain(
      configuredAudience,
    );
  }

  /*
   * This is a reasonable secondary option when the public
   * app URL is already configured.
   */
  const configuredAppUrl =
    process.env
      .NEXT_PUBLIC_APP_URL;

  if (configuredAppUrl) {
    return normalizeDomain(
      configuredAppUrl,
    );
  }

  /*
   * Vercel and other reverse proxies commonly provide
   * x-forwarded-host. Only use the first value.
   */
  const forwardedHost =
    getFirstHeaderValue(
      request.headers.get(
        'x-forwarded-host',
      ),
    );

  if (forwardedHost) {
    return normalizeDomain(
      forwardedHost,
    );
  }

  const host =
    getFirstHeaderValue(
      request.headers.get(
        'host',
      ),
    );

  if (host) {
    return normalizeDomain(
      host,
    );
  }

  return normalizeDomain(
    new URL(
      request.url,
    ).hostname,
  );
}

function isInvalidTokenError(
  cause: unknown,
): cause is Error {
  return (
    cause instanceof
    Errors.InvalidTokenError
  );
}

function getCauseMessage(
  cause: unknown,
): string {
  if (
    cause instanceof Error &&
    cause.message
  ) {
    return cause.message;
  }

  return String(
    cause,
  );
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
      typeof payload.sub ===
      'number'
        ? payload.sub
        : Number(
            payload.sub,
          );

    if (
      !Number.isSafeInteger(
        fid,
      ) ||
      fid <= 0
    ) {
      throw new Error(
        'The verified Farcaster token contains an invalid FID.',
      );
    }

    return {
      fid,
    };
  } catch (cause) {
    if (
      isInvalidTokenError(
        cause,
      )
    ) {
      console.warn(
        'Invalid Farcaster Quick Auth token:',
        {
          domain,
          message:
            cause.message,
        },
      );

      throw new Error(
        'Farcaster authorization is invalid or expired.',
      );
    }

    console.error(
      'Farcaster Quick Auth verification failed:',
      {
        domain,
        message:
          getCauseMessage(
            cause,
          ),
      },
    );

    if (
      cause instanceof Error
    ) {
      throw cause;
    }

    throw new Error(
      'Farcaster authorization could not be verified.',
    );
  }
}
