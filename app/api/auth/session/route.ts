import {
  NextResponse,
} from 'next/server';

import {
  requireCanonicalIdentity,
} from '@/lib/auth/canonical-identity';

export const dynamic =
  'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control':
    'no-store, no-cache, must-revalidate',
};

export async function GET() {
  try {
    const identity =
      await requireCanonicalIdentity();

    return NextResponse.json(
      {
        authenticated:
          true,

        authMethod:
          identity.authMethod,

        fid:
          identity.fid,

        address:
          identity.wallet,

        user:
          identity.user,
      },
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to read session.';

    const lowered =
      message.toLowerCase();

    const authenticationError =
      lowered.includes(
        'authentication',
      ) ||
      lowered.includes(
        'session',
      ) ||
      lowered.includes(
        'unauthorized',
      );

    console.error(
      'GET /api/auth/session failed:',
      cause,
    );

    return NextResponse.json(
      {
        authenticated:
          false,

        authMethod:
          null,

        fid:
          null,

        address:
          null,

        user:
          null,

        error:
          message,
      },
      {
        status:
          authenticationError
            ? 401
            : 500,

        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}
