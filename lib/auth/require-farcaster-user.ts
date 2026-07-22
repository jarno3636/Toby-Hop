import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type FarcasterAuthUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  walletAddress?: `0x${string}`;
};

const jwks = createRemoteJWKSet(new URL('https://auth.farcaster.xyz/.well-known/jwks.json'));

function extractFid(payload: JWTPayload): number {
  const raw = payload.sub ?? payload.fid;
  const fid = Number(raw);
  if (!Number.isSafeInteger(fid) || fid <= 0) throw new Error('Invalid Farcaster FID.');
  return fid;
}

export async function requireFarcasterUser(request: Request): Promise<FarcasterAuthUser> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Missing Farcaster authorization.');

  const token = authorization.slice(7);
  const issuer = process.env.FARCASTER_JWT_ISSUER || 'https://auth.farcaster.xyz';
  const audience = process.env.FARCASTER_JWT_AUDIENCE || undefined;

  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    ...(audience ? { audience } : {})
  });

  const wallet = typeof payload.walletAddress === 'string' ? payload.walletAddress : undefined;
  return {
    fid: extractFid(payload),
    username: typeof payload.username === 'string' ? payload.username : undefined,
    displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined,
    pfpUrl: typeof payload.pfpUrl === 'string' ? payload.pfpUrl : undefined,
    walletAddress: wallet?.startsWith('0x') ? wallet as `0x${string}` : undefined
  };
}
