'use client';

import { sdk } from '@farcaster/miniapp-sdk';
import {
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from 'viem';
import { createSiweMessage } from 'viem/siwe';
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSendTransaction,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { base } from 'wagmi/chains';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  erc20Abi,
  HOP_USDC_ATOMIC,
  USDC_ADDRESS,
} from '@/lib/contracts';
import {
  compactNumber,
  formatAtomic,
} from '@/lib/format';
import {
  getTodaysPond,
  type PondParticle,
} from '@/lib/todays-pond';
import type {
  HopReceipt,
  HopUser,
  LeaderboardKind,
  LeaderRow,
} from '@/lib/types';

type View =
  | 'hop'
  | 'leaders'
  | 'me';

type HostMode =
  | 'checking'
  | 'farcaster'
  | 'browser';

type AuthMethod =
  | 'farcaster'
  | 'siwe'
  | null;

type HopState =
  | 'idle'
  | 'connecting'
  | 'authenticating-farcaster'
  | 'signing-in'
  | 'quoting'
  | 'approving'
  | 'swapping'
  | 'confirming'
  | 'verifying';

type NoticeKind =
  | 'error'
  | 'info'
  | 'success';

type Notice = {
  kind: NoticeKind;
  message: string;
};

type MiniAppUser = {
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type StoredHopUser =
  Partial<HopUser> & {
    id?: string;
    wallet_address?: string | null;
  };

type SessionResponse = {
  authenticated: boolean;
  authMethod?: AuthMethod;
  address?: Address | null;
  fid?: number | null;
  user?: StoredHopUser | null;
  error?: string;
};

type VerifyAuthResponse = {
  authenticated: boolean;
  authMethod?: AuthMethod;
  address?: Address | null;
  fid?: number | null;
  user?: StoredHopUser | null;
  error?: string;
};

type QuoteResponse = {
  allowanceTarget: Address;
  buyAmount: string;

  transaction: {
    to: Address;
    data: Hex;
    value?: string;
    gas?: string;
  };
};

type LeaderRowWithWallet =
  LeaderRow & {
    id?: string;
    wallet_address?: string | null;
  };

type MiniAppContextResult = {
  user: MiniAppUser | null;
  added: boolean;
  available: boolean;
};

const API_TIMEOUT_MS = 15_000;
const SDK_TIMEOUT_MS = 3_000;
const CONNECT_TIMEOUT_MS = 30_000;
const TRANSACTION_TIMEOUT_MS = 120_000;
const VERIFICATION_TIMEOUT_MS = 150_000;
const INITIALIZATION_FALLBACK_MS = 12_000;

const fallbackPfp =
  'data:image/svg+xml,' +
  encodeURIComponent(`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="96"
      height="96"
      viewBox="0 0 96 96"
    >
      <rect
        width="96"
        height="96"
        rx="48"
        fill="#0b4345"
      />

      <circle
        cx="48"
        cy="48"
        r="32"
        fill="#73d7b1"
      />

      <circle
        cx="36"
        cy="39"
        r="5"
        fill="#082f31"
      />

      <circle
        cx="60"
        cy="39"
        r="5"
        fill="#082f31"
      />

      <path
        d="M34 56 Q48 68 62 56"
        fill="none"
        stroke="#082f31"
        stroke-width="4"
        stroke-linecap="round"
      />
    </svg>
  `);

const emptyUser: HopUser = {
  fid: 0,
  username: null,
  display_name: 'Hopper',
  pfp_url: null,
  current_title: 'First Hopper',
  total_hops: 0,
  current_streak: 0,
  longest_streak: 0,
  big_pond_energy: 0,
  total_toby_atomic: '0',
  total_usdc_atomic: '0',
  first_hop_at: null,
  last_hop_at: null,
  today_hopped: false,
  rank: null,
};

function safeNumber(
  value: unknown,
): number {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function safeAtomicString(
  value: unknown,
): string {
  try {
    return BigInt(
      String(value ?? '0'),
    ).toString();
  } catch {
    return '0';
  }
}

function normalizeUser(
  value?: StoredHopUser | null,
  farcasterUser?: MiniAppUser | null,
): HopUser {
  const databaseFid =
    typeof value?.fid === 'number' &&
    value.fid > 0
      ? value.fid
      : null;

  const contextFid =
    typeof farcasterUser?.fid ===
      'number' &&
    farcasterUser.fid > 0
      ? farcasterUser.fid
      : null;

  return {
    fid:
      databaseFid ??
      contextFid ??
      0,

    username:
      value?.username ??
      farcasterUser?.username ??
      null,

    display_name:
      value?.display_name ??
      farcasterUser?.displayName ??
      'Hopper',

    pfp_url:
      value?.pfp_url ??
      farcasterUser?.pfpUrl ??
      null,

    current_title:
      value?.current_title ??
      'First Hopper',

    total_hops:
      safeNumber(
        value?.total_hops,
      ),

    current_streak:
      safeNumber(
        value?.current_streak,
      ),

    longest_streak:
      safeNumber(
        value?.longest_streak,
      ),

    big_pond_energy:
      safeNumber(
        value?.big_pond_energy,
      ),

    total_toby_atomic:
      safeAtomicString(
        value?.total_toby_atomic,
      ),

    total_usdc_atomic:
      safeAtomicString(
        value?.total_usdc_atomic,
      ),

    first_hop_at:
      value?.first_hop_at ??
      null,

    last_hop_at:
      value?.last_hop_at ??
      null,

    today_hopped:
      Boolean(
        value?.today_hopped,
      ),

    rank:
      value?.rank == null
        ? null
        : safeNumber(
            value.rank,
          ),
  };
}

function parseApiError(
  raw: string,
  fallback: string,
): string {
  try {
    const parsed =
      JSON.parse(raw) as {
        error?: string;
        message?: string;
      };

    return (
      parsed.error ||
      parsed.message ||
      fallback
    );
  } catch {
    return raw.trim() || fallback;
  }
}

function getErrorMessage(
  cause: unknown,
  hostMode: HostMode = 'browser',
): string {
  if (!(cause instanceof Error)) {
    return 'The pond could not complete this hop.';
  }

  const originalMessage =
    cause.message?.trim() ||
    'The pond could not complete this hop.';

  const message =
    originalMessage.toLowerCase();

  if (
    message.includes('aborted') ||
    message.includes('timed out') ||
    message.includes('timeout')
  ) {
    return 'The pond took too long to respond. Please try again.';
  }

  if (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes(
      'rejected the request',
    ) ||
    message.includes(
      'request rejected',
    )
  ) {
    return 'The request was cancelled.';
  }

  if (
    message.includes(
      'insufficient funds',
    ) ||
    message.includes(
      'insufficient balance',
    )
  ) {
    return 'You need at least one cent of USDC on Base and a small amount of ETH for gas.';
  }

  if (
    message.includes(
      'already complete',
    ) ||
    message.includes(
      'already hopped',
    ) ||
    message.includes(
      'one official hop',
    )
  ) {
    return 'You already completed today’s official hop.';
  }

  if (
    message.includes('nonce') ||
    message.includes(
      'signature verification',
    ) ||
    message.includes(
      'invalid signature',
    )
  ) {
    return 'Your sign-in request expired. Please try again.';
  }

  if (
    message.includes(
      'missing farcaster authorization',
    ) ||
    message.includes(
      'farcaster authentication failed',
    ) ||
    message.includes(
      'invalid farcaster',
    ) ||
    message.includes(
      'quick auth',
    )
  ) {
    return 'Farcaster could not verify your pond record. Reopen Toby Hop and try again.';
  }

  if (
    message.includes(
      'wallet authentication required',
    ) ||
    message.includes(
      'not authenticated',
    ) ||
    message.includes(
      'unauthorized',
    ) ||
    message.includes(
      'authentication required',
    ) ||
    message.includes(
      'invalid session',
    ) ||
    message.includes(
      'session expired',
    )
  ) {
    return hostMode === 'farcaster'
      ? 'Your Farcaster pond session expired. Tap retry to reconnect it.'
      : 'Connect and sign in with your Base wallet to continue.';
  }

  if (
    message.includes(
      'wrong chain',
    ) ||
    message.includes(
      'chain mismatch',
    ) ||
    message.includes(
      'requires base',
    ) ||
    message.includes(
      'unsupported chain',
    )
  ) {
    return 'Switch your wallet to Base and try again.';
  }

  if (
    message.includes(
      'connector',
    ) ||
    message.includes(
      'provider',
    ) ||
    message.includes(
      'no compatible wallet',
    ) ||
    message.includes(
      'no base wallet',
    )
  ) {
    return hostMode === 'farcaster'
      ? 'Farcaster could not open your Base wallet. Close and reopen Toby Hop, then try again.'
      : 'A compatible Base wallet could not be found.';
  }

  if (
    message.includes(
      'usdc and toby contract addresses must be configured',
    )
  ) {
    return 'The Toby Hop token configuration is incomplete.';
  }

  if (
    message.includes('allowance') ||
    message.includes(
      'approval transaction failed',
    )
  ) {
    return 'USDC approval did not complete. Please try the hop again.';
  }

  if (
    message.includes(
      'transaction reverted',
    ) ||
    message.includes(
      'execution reverted',
    ) ||
    message.includes(
      'transaction failed',
    )
  ) {
    return 'The Base transaction did not complete. No hop was credited.';
  }

  return originalMessage;
}

function shortenAddress(
  address?: string | null,
): string {
  if (!address) {
    return 'Hopper';
  }

  return (
    `${address.slice(0, 6)}` +
    `…${address.slice(-4)}`
  );
}

function addressesMatch(
  first?: string | null,
  second?: string | null,
): boolean {
  if (!first || !second) {
    return false;
  }

  return (
    first.toLowerCase() ===
    second.toLowerCase()
  );
}

function isSessionError(
  message: string,
): boolean {
  const normalized =
    message.toLowerCase();

  return (
    normalized.includes(
      'authentication',
    ) ||
    normalized.includes(
      'unauthorized',
    ) ||
    normalized.includes(
      'session expired',
    ) ||
    normalized.includes(
      'invalid session',
    )
  );
}

function isFarcasterConnector(
  connector: {
    id: string;
    name: string;
  },
): boolean {
  const searchable =
    `${connector.id} ${connector.name}`
      .toLowerCase();

  return (
    searchable.includes(
      'farcaster',
    ) ||
    searchable.includes(
      'miniapp',
    ) ||
    searchable.includes(
      'mini app',
    )
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  return new Promise<T>(
    (resolve, reject) => {
      const timer =
        window.setTimeout(() => {
          reject(
            new Error(message),
          );
        }, milliseconds);

      promise.then(
        (value) => {
          window.clearTimeout(
            timer,
          );

          resolve(value);
        },
        (cause) => {
          window.clearTimeout(
            timer,
          );

          reject(cause);
        },
      );
    },
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = API_TIMEOUT_MS,
): Promise<Response> {
  const controller =
    new AbortController();

  const timer =
    window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,

      signal:
        init.signal ??
        controller.signal,
    });
  } finally {
    window.clearTimeout(
      timer,
    );
  }
}

async function readJsonResponse<T>(
  response: Response,
  fallbackError: string,
): Promise<T> {
  const raw =
    await response.text();

  if (!response.ok) {
    throw new Error(
      parseApiError(
        raw,
        fallbackError,
      ),
    );
  }

  if (!raw.trim()) {
    throw new Error(
      fallbackError,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      fallbackError,
    );
  }
}

async function getSafeMiniAppContext():
Promise<MiniAppContextResult> {
  try {
    const context =
      await withTimeout(
        Promise.resolve(
          sdk.context,
        ),
        SDK_TIMEOUT_MS,
        'Farcaster context timed out.',
      );

    if (
      !context ||
      typeof context !== 'object'
    ) {
      return {
        user: null,
        added: false,
        available: false,
      };
    }

    const typedContext =
      context as {
        user?: MiniAppUser;

        client?: {
          added?: boolean;
        };
      };

    const miniUser =
      typedContext.user &&
      typeof typedContext.user ===
        'object' &&
      typeof typedContext.user.fid ===
        'number' &&
      typedContext.user.fid > 0
        ? typedContext.user
        : null;

    return {
      user:
        miniUser,

      added:
        Boolean(
          typedContext.client?.added,
        ),

      available:
        Boolean(miniUser),
    };
  } catch {
    return {
      user: null,
      added: false,
      available: false,
    };
  }
}

function particleSymbol(
  type: PondParticle,
): string {
  switch (type) {
    case 'drop':
    case 'firefly':
      return '';

    case 'petal':
      return '🌸';

    case 'snow':
      return '•';

    case 'leaf':
      return '🍂';
  }
}

export function TobyHopApp() {
  const [view, setView] =
    useState<View>('hop');

  const [
    hostMode,
    setHostMode,
  ] =
    useState<HostMode>(
      'checking',
    );

  const [user, setUser] =
    useState<HopUser>(
      emptyUser,
    );

  const [
    authenticated,
    setAuthenticated,
  ] = useState(false);

  const [
    authMethod,
    setAuthMethod,
  ] =
    useState<AuthMethod>(
      null,
    );

  const [
    authenticatedAddress,
    setAuthenticatedAddress,
  ] =
    useState<Address | null>(
      null,
    );

  const [
    authenticatedFid,
    setAuthenticatedFid,
  ] =
    useState<number | null>(
      null,
    );

  const [
    farcasterUser,
    setFarcasterUser,
  ] =
    useState<MiniAppUser | null>(
      null,
    );

  const [
    farcasterAvailable,
    setFarcasterAvailable,
  ] = useState(false);

  const [
    miniAppAdded,
    setMiniAppAdded,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    hopState,
    setHopState,
  ] =
    useState<HopState>(
      'idle',
    );

  const [
    receipt,
    setReceipt,
  ] =
    useState<HopReceipt | null>(
      null,
    );

  const [
    notice,
    setNotice,
  ] =
    useState<Notice | null>(
      null,
    );

  const [
    leaderKind,
    setLeaderKind,
  ] =
    useState<LeaderboardKind>(
      'streak',
    );

  const [
    leaders,
    setLeaders,
  ] =
    useState<
      LeaderRowWithWallet[]
    >([]);

  const [
    leaderLoading,
    setLeaderLoading,
  ] = useState(false);

  const [
    farcasterAuthLoading,
    setFarcasterAuthLoading,
  ] = useState(false);

  const browserAuthRef =
    useRef(false);

  const farcasterAuthRef =
    useRef(false);

  const hopInProgressRef =
    useRef(false);

  const leaderboardRequestRef =
    useRef(0);

  const todaysPond =
    useMemo(
      () => getTodaysPond(),
      [],
    );

  const particles =
    useMemo(() => {
      if (!todaysPond.particle) {
        return [];
      }

      return Array.from(
        {
          length:
            todaysPond
              .particleCount,
        },
        (_, index) => ({
          id:
            `${todaysPond.particle}-${index}`,

          type:
            todaysPond
              .particle!,

          left:
            4 +
            ((index * 37 +
              11) %
              92),

          delay:
            ((index * 23) %
              31) /
            10,

          duration:
            3.4 +
            ((index * 17) %
              25) /
              10,

          scale:
            0.65 +
            ((index * 13) %
              9) /
              10,
        }),
      );
    }, [todaysPond]);

  const {
    address,
    chainId,
    isConnected,
  } = useAccount();

  const {
    connectors,
    connectAsync,
    isPending:
      connectPending,
  } = useConnect();

  const {
    disconnect,
  } = useDisconnect();

  const {
    signMessageAsync,
  } = useSignMessage();

  const {
    switchChainAsync,
  } = useSwitchChain();

  const {
    writeContractAsync,
  } = useWriteContract();

  const {
    sendTransactionAsync,
  } = useSendTransaction();

  const publicClient =
    usePublicClient({
      chainId: base.id,
    });

  const isFarcasterMiniApp =
    hostMode ===
    'farcaster';

  const busy =
    hopState !== 'idle';

  const displayName =
    user.display_name ||
    user.username ||
    farcasterUser?.displayName ||
    farcasterUser?.username ||
    shortenAddress(
      authenticatedAddress ??
      address,
    );

  const canCast =
    isFarcasterMiniApp &&
    Boolean(farcasterUser);

  const walletMatchesSession =
    addressesMatch(
      address,
      authenticatedAddress,
    );

  const setErrorNotice =
    useCallback(
      (
        cause: unknown,
        currentHostMode:
          HostMode = 'browser',
      ) => {
        setNotice({
          kind: 'error',

          message:
            getErrorMessage(
              cause,
              currentHostMode,
            ),
        });
      },
      [],
    );

  const resetAppSession =
    useCallback(
      (
        currentFarcasterUser:
          MiniAppUser | null =
          null,
      ) => {
        setAuthenticated(false);
        setAuthMethod(null);

        setAuthenticatedAddress(
          null,
        );

        setAuthenticatedFid(
          currentFarcasterUser?.fid ??
          null,
        );

        setUser(
          normalizeUser(
            undefined,
            currentFarcasterUser,
          ),
        );
      },
      [],
    );

  const applySessionResult =
    useCallback(
      (
        result: SessionResponse,
        currentFarcasterUser:
          MiniAppUser | null =
          null,
      ): boolean => {
        if (!result.authenticated) {
          resetAppSession(
            currentFarcasterUser,
          );

          return false;
        }

        const normalizedAddress =
          result.address &&
          isAddress(
            result.address,
          )
            ? getAddress(
                result.address,
              )
            : null;

        const responseFid =
          typeof result.fid ===
            'number' &&
          result.fid > 0
            ? result.fid
            : null;

        const databaseFid =
          typeof result.user
            ?.fid === 'number' &&
          result.user.fid > 0
            ? result.user.fid
            : null;

        const contextFid =
          typeof currentFarcasterUser
            ?.fid === 'number' &&
          currentFarcasterUser.fid > 0
            ? currentFarcasterUser.fid
            : null;

        const sessionFid =
          responseFid ??
          databaseFid ??
          contextFid;

        setAuthenticated(true);

        setAuthMethod(
          result.authMethod ??
          (
            sessionFid
              ? 'farcaster'
              : normalizedAddress
                ? 'siwe'
                : null
          ),
        );

        setAuthenticatedAddress(
          normalizedAddress,
        );

        setAuthenticatedFid(
          sessionFid,
        );

        setUser(
          normalizeUser(
            result.user,
            currentFarcasterUser,
          ),
        );

        return true;
      },
      [resetAppSession],
    );

  const loadAppSession =
    useCallback(
      async (
        currentFarcasterUser:
          MiniAppUser | null =
          null,
      ): Promise<boolean> => {
        const response =
          await fetchWithTimeout(
            '/api/auth/session',
            {
              method: 'GET',
              credentials:
                'include',
              cache: 'no-store',
            },
          );

        const result =
          await readJsonResponse<
            SessionResponse
          >(
            response,
            'Unable to check your Toby Hop session.',
          );

        return applySessionResult(
          result,
          currentFarcasterUser,
        );
      },
      [applySessionResult],
    );

  const authenticateWithFarcaster =
    useCallback(
      async (
        miniUser: MiniAppUser,
        walletAddress:
          Address | null = null,
      ): Promise<
        SessionResponse | null
      > => {
        if (
          !miniUser.fid ||
          miniUser.fid <= 0
        ) {
          throw new Error(
            'Invalid Farcaster user.',
          );
        }

        if (
          farcasterAuthRef.current
        ) {
          return null;
        }

        farcasterAuthRef.current =
          true;

        setFarcasterAuthLoading(
          true,
        );

        try {
          const response =
            await withTimeout(
              sdk.quickAuth.fetch(
                '/api/auth/farcaster',
                {
                  method: 'POST',

                  headers: {
                    'content-type':
                      'application/json',
                  },

                  body:
                    JSON.stringify({
                      username:
                        miniUser.username ??
                        null,

                      displayName:
                        miniUser.displayName ??
                        null,

                      pfpUrl:
                        miniUser.pfpUrl ??
                        null,

                      walletAddress:
                        walletAddress ??
                        null,
                    }),
                },
              ),
              API_TIMEOUT_MS,
              'Farcaster authentication timed out.',
            );

          const result =
            await readJsonResponse<
              SessionResponse
            >(
              response,
              'Farcaster authentication failed.',
            );

          if (
            !result.authenticated
          ) {
            throw new Error(
              result.error ||
              'Farcaster authentication failed.',
            );
          }

          applySessionResult(
            result,
            miniUser,
          );

          return result;
        } finally {
          farcasterAuthRef.current =
            false;

          setFarcasterAuthLoading(
            false,
          );
        }
      },
      [applySessionResult],
    );

  const syncProfile =
    useCallback(
      async (
        miniUser: MiniAppUser,
      ) => {
        try {
          const response =
            await fetchWithTimeout(
              '/api/me',
              {
                method: 'POST',
                credentials:
                  'include',

                headers: {
                  'content-type':
                    'application/json',
                },

                body:
                  JSON.stringify({
                    username:
                      miniUser.username ??
                      null,

                    displayName:
                      miniUser.displayName ??
                      null,

                    pfpUrl:
                      miniUser.pfpUrl ??
                      null,
                  }),
              },
            );

          if (!response.ok) {
            return;
          }

          const raw =
            await response.text();

          if (!raw.trim()) {
            return;
          }

          const profile =
            JSON.parse(
              raw,
            ) as StoredHopUser;

          setUser(
            normalizeUser(
              profile,
              miniUser,
            ),
          );
        } catch {
          /*
            Profile information is optional.
          */
        }
      },
      [],
    );

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        setNotice(null);

        try {
          await withTimeout(
            sdk.actions.ready(),
            SDK_TIMEOUT_MS,
            'Farcaster ready timed out.',
          );
        } catch {
          /*
            Normal browser sessions can continue.
          */
        }

        const context =
          await getSafeMiniAppContext();

        if (!active) {
          return;
        }

        const detectedHostMode:
          HostMode =
          context.available &&
          context.user?.fid
            ? 'farcaster'
            : 'browser';

        setHostMode(
          detectedHostMode,
        );

        setFarcasterUser(
          context.user,
        );

        setFarcasterAvailable(
          detectedHostMode ===
            'farcaster',
        );

        setMiniAppAdded(
          context.added,
        );

        let hasSession =
          false;

        try {
          hasSession =
            await loadAppSession(
              context.user,
            );
        } catch {
          resetAppSession(
            context.user,
          );
        }

        if (!active) {
          return;
        }

        if (
          detectedHostMode ===
            'farcaster' &&
          context.user &&
          !hasSession
        ) {
          try {
            await authenticateWithFarcaster(
              context.user,
              null,
            );
          } catch (cause) {
            if (active) {
              setErrorNotice(
                cause,
                'farcaster',
              );
            }
          }
        }
      } catch (cause) {
        if (active) {
          setHostMode(
            'browser',
          );

          setErrorNotice(
            cause,
            'browser',
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [
    authenticateWithFarcaster,
    loadAppSession,
    resetAppSession,
    setErrorNotice,
  ]);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const fallbackTimer =
      window.setTimeout(() => {
        setLoading(false);

        setHostMode(
          (current) =>
            current === 'checking'
              ? 'browser'
              : current,
        );

        setNotice(
          (current) =>
            current ?? {
              kind: 'error',

              message:
                'The pond took too long to open. You can still retry from the app.',
            },
        );
      }, INITIALIZATION_FALLBACK_MS);

    return () => {
      window.clearTimeout(
        fallbackTimer,
      );
    };
  }, [loading]);

  useEffect(() => {
    if (
      !authenticated ||
      !farcasterUser
    ) {
      return;
    }

    void syncProfile(
      farcasterUser,
    );
  }, [
    authenticated,
    farcasterUser,
    syncProfile,
  ]);

  useEffect(() => {
    if (
      hostMode !== 'browser' ||
      !authenticated ||
      authMethod !== 'siwe' ||
      !authenticatedAddress ||
      !address
    ) {
      return;
    }

    if (
      addressesMatch(
        address,
        authenticatedAddress,
      )
    ) {
      return;
    }

    resetAppSession(null);

    setNotice({
      kind: 'error',

      message:
        'The connected wallet changed. Sign in again to protect your pond record.',
    });
  }, [
    address,
    authenticated,
    authenticatedAddress,
    authMethod,
    hostMode,
    resetAppSession,
  ]);

  const loadLeaderboard =
    useCallback(
      async (
        kind:
          LeaderboardKind,
      ) => {
        const requestId =
          leaderboardRequestRef
            .current +
          1;

        leaderboardRequestRef
          .current =
          requestId;

        setLeaderLoading(true);

        try {
          const response =
            await fetchWithTimeout(
              `/api/leaderboard?kind=${encodeURIComponent(
                kind,
              )}`,
              {
                method: 'GET',
                cache: 'no-store',
              },
            );

          const rows =
            await readJsonResponse<
              LeaderRowWithWallet[]
            >(
              response,
              'Unable to load the leaderboard.',
            );

          if (
            leaderboardRequestRef
              .current ===
            requestId
          ) {
            setLeaders(
              Array.isArray(rows)
                ? rows
                : [],
            );
          }
        } catch (cause) {
          if (
            leaderboardRequestRef
              .current ===
            requestId
          ) {
            setErrorNotice(
              cause,
            );
          }
        } finally {
          if (
            leaderboardRequestRef
              .current ===
            requestId
          ) {
            setLeaderLoading(
              false,
            );
          }
        }
      },
      [setErrorNotice],
    );

  useEffect(() => {
    if (view !== 'leaders') {
      return;
    }

    void loadLeaderboard(
      leaderKind,
    );
  }, [
    leaderKind,
    loadLeaderboard,
    view,
  ]);

  async function provideTapFeedback() {
    if (!farcasterAvailable) {
      return;
    }

    try {
      const capabilities =
        await withTimeout(
          sdk.getCapabilities(),
          SDK_TIMEOUT_MS,
          'Capabilities timed out.',
        );

      if (
        capabilities.includes(
          'haptics.impactOccurred',
        )
      ) {
        await sdk.haptics
          .impactOccurred(
            'medium',
          );
      }
    } catch {
      /*
        Haptics are optional.
      */
    }
  }

  function chooseConnector() {
    if (!connectors.length) {
      return null;
    }

    if (isFarcasterMiniApp) {
      const farcasterConnector =
        connectors.find(
          isFarcasterConnector,
        );

      if (
        farcasterConnector
      ) {
        return farcasterConnector;
      }
    }

    const injectedConnector =
      connectors.find(
        (connector) => {
          const searchable =
            `${connector.id} ${connector.name}`
              .toLowerCase();

          return (
            connector.id ===
              'injected' ||
            searchable.includes(
              'injected',
            ) ||
            searchable.includes(
              'browser wallet',
            )
          );
        },
      );

    return (
      injectedConnector ??
      connectors[0]
    );
  }

  async function getConnectedWallet():
  Promise<Address> {
    if (
      isConnected &&
      address
    ) {
      return getAddress(
        address,
      );
    }

    setHopState(
      'connecting',
    );

    const connector =
      chooseConnector();

    if (!connector) {
      throw new Error(
        isFarcasterMiniApp
          ? 'No Farcaster wallet connector was found.'
          : 'No compatible wallet connector was found.',
      );
    }

    const connection =
      await withTimeout(
        connectAsync({
          connector,
          chainId: base.id,
        }),
        CONNECT_TIMEOUT_MS,
        'Wallet connection timed out.',
      );

    const wallet =
      connection.accounts[0];

    if (
      !wallet ||
      !isAddress(wallet)
    ) {
      throw new Error(
        'No Base wallet was returned.',
      );
    }

    return getAddress(
      wallet,
    );
  }

  async function ensureBaseChain() {
    if (chainId === base.id) {
      return;
    }

    try {
      await switchChainAsync({
        chainId: base.id,
      });
    } catch (cause) {
      /*
        Farcaster embedded wallets can already be locked
        to Base while not supporting switch-chain.
      */
      if (
        isFarcasterMiniApp
      ) {
        return;
      }

      throw cause;
    }
  }

  async function signInWithWallet():
  Promise<Address | null> {
    if (
      browserAuthRef.current
    ) {
      return null;
    }

    browserAuthRef.current =
      true;

    setNotice(null);

    try {
      const wallet =
        await getConnectedWallet();

      setHopState(
        'signing-in',
      );

      await ensureBaseChain();

      const nonceResponse =
        await fetchWithTimeout(
          '/api/auth/nonce',
          {
            method: 'GET',
            credentials:
              'include',
            cache: 'no-store',
          },
        );

      const nonceResult =
        await readJsonResponse<{
          nonce?: string;
        }>(
          nonceResponse,
          'Unable to create a sign-in request.',
        );

      if (!nonceResult.nonce) {
        throw new Error(
          'The server did not return a sign-in nonce.',
        );
      }

      const message =
        createSiweMessage({
          address:
            wallet,

          chainId:
            base.id,

          domain:
            window.location.host,

          uri:
            window.location.origin,

          version:
            '1',

          nonce:
            nonceResult.nonce,

          statement:
            'Sign in to Toby Hop and protect your daily pond record.',

          issuedAt:
            new Date(),
        });

      const signature =
        await signMessageAsync({
          message,
        });

      const verifyResponse =
        await fetchWithTimeout(
          '/api/auth/verify',
          {
            method: 'POST',
            credentials:
              'include',

            headers: {
              'content-type':
                'application/json',
            },

            body:
              JSON.stringify({
                message,
                signature,
              }),
          },
        );

      const result =
        await readJsonResponse<
          VerifyAuthResponse
        >(
          verifyResponse,
          'Wallet authentication failed.',
        );

      if (
        !result.authenticated ||
        !result.address ||
        !isAddress(
          result.address,
        )
      ) {
        throw new Error(
          result.error ||
          'Wallet authentication failed.',
        );
      }

      const verifiedAddress =
        getAddress(
          result.address,
        );

      if (
        !addressesMatch(
          wallet,
          verifiedAddress,
        )
      ) {
        throw new Error(
          'The authenticated wallet did not match the connected wallet.',
        );
      }

      applySessionResult(
        {
          ...result,

          authMethod:
            'siwe',

          address:
            verifiedAddress,
        },
        null,
      );

      return verifiedAddress;
    } catch (cause) {
      setErrorNotice(
        cause,
        'browser',
      );

      return null;
    } finally {
      browserAuthRef.current =
        false;

      setHopState(
        'idle',
      );
    }
  }

  async function ensureFarcasterHopSession(
    wallet: Address,
  ): Promise<boolean> {
    if (!farcasterUser) {
      throw new Error(
        'Farcaster user context is unavailable.',
      );
    }

    if (
      authenticated &&
      authMethod ===
        'farcaster' &&
      addressesMatch(
        authenticatedAddress,
        wallet,
      )
    ) {
      return true;
    }

    setHopState(
      'authenticating-farcaster',
    );

    const result =
      await authenticateWithFarcaster(
        farcasterUser,
        wallet,
      );

    return Boolean(
      result?.authenticated &&
      result.address &&
      addressesMatch(
        result.address,
        wallet,
      ),
    );
  }

  async function retryFarcasterAuthentication() {
    if (!farcasterUser) {
      setNotice({
        kind: 'error',

        message:
          'Farcaster context is unavailable. Close and reopen Toby Hop.',
      });

      return;
    }

    setNotice(null);

    try {
      await authenticateWithFarcaster(
        farcasterUser,
        address &&
        isAddress(address)
          ? getAddress(address)
          : null,
      );
    } catch (cause) {
      setErrorNotice(
        cause,
        'farcaster',
      );
    }
  }

  async function logoutWallet() {
    if (isFarcasterMiniApp) {
      return;
    }

    setNotice(null);

    try {
      await fetchWithTimeout(
        '/api/auth/logout',
        {
          method: 'POST',
          credentials:
            'include',
        },
      );
    } catch {
      /*
        Local state still needs to clear.
      */
    } finally {
      resetAppSession(null);

      setReceipt(null);
      setLeaders([]);

      disconnect();
    }
  }

  async function ensureUsdcAllowance(
    wallet: Address,
    allowanceTarget: Address,
  ) {
    if (!publicClient) {
      throw new Error(
        'The Base network client is unavailable.',
      );
    }

    const currentAllowance =
      await publicClient
        .readContract({
          address:
            USDC_ADDRESS,

          abi:
            erc20Abi,

          functionName:
            'allowance',

          args: [
            wallet,
            allowanceTarget,
          ],
        });

    if (
      BigInt(
        currentAllowance,
      ) >=
      BigInt(
        HOP_USDC_ATOMIC,
      )
    ) {
      return;
    }

    setHopState(
      'approving',
    );

    const approvalHash =
      await writeContractAsync({
        address:
          USDC_ADDRESS,

        abi:
          erc20Abi,

        functionName:
          'approve',

        args: [
          allowanceTarget,
          HOP_USDC_ATOMIC,
        ],

        chainId:
          base.id,
      });

    const approvalReceipt =
      await publicClient
        .waitForTransactionReceipt({
          hash:
            approvalHash,

          confirmations:
            1,

          timeout:
            TRANSACTION_TIMEOUT_MS,
        });

    if (
      approvalReceipt.status !==
      'success'
    ) {
      throw new Error(
        'The USDC approval transaction failed.',
      );
    }
  }

  async function performHop() {
    if (
      hopInProgressRef.current ||
      busy ||
      user.today_hopped
    ) {
      return;
    }

    hopInProgressRef.current =
      true;

    setNotice(null);

    await provideTapFeedback();

    try {
      const wallet =
        await getConnectedWallet();

      await ensureBaseChain();

      if (isFarcasterMiniApp) {
        const sessionReady =
          await ensureFarcasterHopSession(
            wallet,
          );

        if (!sessionReady) {
          throw new Error(
            'Farcaster authentication did not link the connected wallet.',
          );
        }
      } else if (
        !authenticated ||
        authMethod !== 'siwe' ||
        !walletMatchesSession
      ) {
        const signedInWallet =
          await signInWithWallet();

        if (!signedInWallet) {
          return;
        }

        if (
          !addressesMatch(
            wallet,
            signedInWallet,
          )
        ) {
          throw new Error(
            'The connected wallet does not match the signed-in wallet.',
          );
        }
      }

      setHopState(
        'quoting',
      );

      const quoteResponse =
        await fetchWithTimeout(
          `/api/hop/quote?wallet=${encodeURIComponent(
            wallet,
          )}`,
          {
            method: 'GET',
            credentials:
              'include',
            cache: 'no-store',
          },
        );

      const quote =
        await readJsonResponse<
          QuoteResponse
        >(
          quoteResponse,
          'Unable to prepare today’s hop.',
        );

      if (
        !isAddress(
          quote.allowanceTarget,
        )
      ) {
        throw new Error(
          'The hop quote returned an invalid allowance target.',
        );
      }

      if (
        !isAddress(
          quote.transaction.to,
        )
      ) {
        throw new Error(
          'The hop quote returned an invalid swap target.',
        );
      }

      if (
        !quote.transaction.data ||
        !quote.transaction.data
          .startsWith('0x')
      ) {
        throw new Error(
          'The hop quote returned invalid transaction data.',
        );
      }

      const allowanceTarget =
        getAddress(
          quote.allowanceTarget,
        );

      await ensureUsdcAllowance(
        wallet,
        allowanceTarget,
      );

      setHopState(
        'swapping',
      );

      const transactionHash =
        await sendTransactionAsync({
          to:
            getAddress(
              quote.transaction.to,
            ),

          data:
            quote.transaction.data,

          value:
            BigInt(
              quote.transaction
                .value ??
              '0',
            ),

          gas:
            quote.transaction.gas
              ? BigInt(
                  quote.transaction
                    .gas,
                )
              : undefined,

          chainId:
            base.id,
        });

      if (!publicClient) {
        throw new Error(
          'The Base network client is unavailable.',
        );
      }

      setHopState(
        'confirming',
      );

      const swapReceipt =
        await publicClient
          .waitForTransactionReceipt({
            hash:
              transactionHash,

            confirmations:
              1,

            timeout:
              TRANSACTION_TIMEOUT_MS,
          });

      if (
        swapReceipt.status !==
        'success'
      ) {
        throw new Error(
          'The hop transaction failed.',
        );
      }

      setHopState(
        'verifying',
      );

      const verificationResponse =
        await fetchWithTimeout(
          '/api/hop/verify',
          {
            method: 'POST',
            credentials:
              'include',

            headers: {
              'content-type':
                'application/json',
            },

            body:
              JSON.stringify({
                txHash:
                  transactionHash,

                walletAddress:
                  wallet,
              }),
          },
          VERIFICATION_TIMEOUT_MS,
        );

      const completedHop =
        await readJsonResponse<
          HopReceipt
        >(
          verificationResponse,
          'Unable to verify the completed hop.',
        );

      setReceipt(
        completedHop,
      );

      setUser(
        (previous) => ({
          ...previous,

          today_hopped:
            true,

          total_hops:
            completedHop
              .totalHops,

          current_streak:
            completedHop
              .streak,

          longest_streak:
            Math.max(
              previous
                .longest_streak,
              completedHop
                .streak,
            ),

          big_pond_energy:
            previous
              .big_pond_energy +
            1,

          current_title:
            completedHop
              .title,

          total_toby_atomic:
            (
              BigInt(
                safeAtomicString(
                  previous
                    .total_toby_atomic,
                ),
              ) +
              BigInt(
                completedHop
                  .tobyAtomic,
              )
            ).toString(),
        }),
      );

      setNotice({
        kind: 'success',

        message:
          'Today’s hop is safely recorded.',
      });

      try {
        await loadAppSession(
          farcasterUser,
        );
      } catch {
        /*
          The optimistic update above is enough.
        */
      }

      if (
        farcasterAvailable
      ) {
        try {
          await sdk.haptics
            .notificationOccurred(
              'success',
            );
        } catch {
          /*
            Optional.
          */
        }
      }

      if (
        farcasterUser &&
        !miniAppAdded
      ) {
        try {
          await withTimeout(
            sdk.actions
              .addMiniApp(),
            SDK_TIMEOUT_MS * 2,
            'Add Mini App timed out.',
          );

          setMiniAppAdded(
            true,
          );
        } catch {
          /*
            The hop remains valid.
          */
        }
      }
    } catch (cause) {
      const message =
        getErrorMessage(
          cause,
          hostMode,
        );

      setNotice({
        kind: 'error',
        message,
      });

      if (
        isSessionError(
          message,
        )
      ) {
        if (
          isFarcasterMiniApp
        ) {
          setAuthenticated(
            false,
          );

          setAuthenticatedAddress(
            null,
          );

          setAuthMethod(
            null,
          );
        } else {
          resetAppSession(
            null,
          );
        }
      }

      if (
        farcasterAvailable
      ) {
        try {
          await sdk.haptics
            .notificationOccurred(
              'error',
            );
        } catch {
          /*
            Optional.
          */
        }
      }
    } finally {
      hopInProgressRef.current =
        false;

      setHopState(
        'idle',
      );
    }
  }

  async function shareHop() {
    if (!receipt) {
      return;
    }

    setNotice(null);

    const appUrl =
      process.env
        .NEXT_PUBLIC_APP_URL ||
      window.location.origin;

    if (canCast) {
      try {
        await withTimeout(
          sdk.actions
            .composeCast({
              text:
                receipt.castText,

              embeds: [
                appUrl,
              ],
            }),
          SDK_TIMEOUT_MS * 4,
          'Cast composer timed out.',
        );

        return;
      } catch {
        /*
          Fall back to device share.
        */
      }
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title:
            'Toby Hop',

          text:
            receipt.castText,

          url:
            appUrl,
        });

        return;
      }

      await navigator.clipboard
        .writeText(
          `${receipt.castText}\n\n${appUrl}`,
        );

      setNotice({
        kind: 'success',

        message:
          'Your hop message was copied.',
      });
    } catch (cause) {
      if (
        cause instanceof
          DOMException &&
        cause.name ===
          'AbortError'
      ) {
        return;
      }

      setErrorNotice(
        cause,
      );
    }
  }

  function getHopStatus():
  string {
    if (
      user.today_hopped
    ) {
      return 'Today’s hop is complete';
    }

    switch (hopState) {
      case 'connecting':
        return isFarcasterMiniApp
          ? 'Opening your Farcaster wallet'
          : 'Connecting your wallet';

      case 'authenticating-farcaster':
        return 'Linking your Farcaster pond record';

      case 'signing-in':
        return 'Protecting your pond record';

      case 'quoting':
        return 'Finding today’s route';

      case 'approving':
        return 'Approving one cent of USDC';

      case 'swapping':
        return 'Toby is hopping';

      case 'confirming':
        return 'Waiting for the ripple';

      case 'verifying':
        return 'Counting your hop';

      default:
        if (
          isFarcasterMiniApp &&
          !authenticated
        ) {
          return 'Tap Toby to enter the pond';
        }

        return authenticated
          ? 'Tap Toby to hop'
          : 'Tap Toby to join the pond';
    }
  }

  function getHopSubtext():
  string {
    if (
      user.today_hopped
    ) {
      return 'One Big Pond Energy collected';
    }

    switch (hopState) {
      case 'connecting':
        return isFarcasterMiniApp
          ? 'Using your Farcaster wallet'
          : 'Choose a Base wallet';

      case 'authenticating-farcaster':
        return 'Verifying your Farcaster identity';

      case 'signing-in':
        return 'Sign once to protect your progress';

      case 'quoting':
        return 'Preparing one cent USDC to TOBY';

      case 'approving':
        return 'Confirm the USDC approval';

      case 'swapping':
        return 'Confirm today’s hop';

      case 'confirming':
        return 'Waiting for Base confirmation';

      case 'verifying':
        return 'Recording your verified hop';

      default:
        if (
          isFarcasterMiniApp &&
          !authenticated
        ) {
          return 'Your Farcaster profile will link automatically';
        }

        if (!authenticated) {
          return 'Connect and sign in with a Base wallet';
        }

        return 'One cent USDC to TOBY';
    }
  }

  function getConnectButtonText():
  string {
    if (
      hopState ===
      'signing-in'
    ) {
      return 'SIGNING IN';
    }

    if (
      hopState ===
        'connecting' ||
      connectPending
    ) {
      return 'CONNECTING';
    }

    return 'CONNECT WALLET';
  }

  const currentUserFid =
    authenticatedFid ??
    farcasterUser?.fid ??
    (
      typeof user.fid ===
        'number' &&
      user.fid > 0
        ? user.fid
        : null
    );

  if (loading) {
    return (
      <main className="shell">
        <div
          className="empty"
          role="status"
          aria-live="polite"
        >
          <strong>
            Opening the pond
          </strong>

          <span>
            Waking Toby up…
          </span>
        </div>
      </main>
    );
  }

  return (
    <main
      className={[
        'shell',

        `pond-theme-${todaysPond.id}`,

        todaysPond.goldenToby
          ? 'golden-toby-day'
          : '',

        busy
          ? 'hop-is-busy'
          : '',

        isFarcasterMiniApp
          ? 'host-farcaster'
          : 'host-browser',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="topbar">
        <div>
          <div className="brand">
            TOBY HOP
          </div>

          <div className="tagline">
            One hop. Every day.
          </div>
        </div>

        {!isFarcasterMiniApp &&
          isConnected &&
          address && (
            <button
              type="button"
              className="wallet-pill"
              onClick={
                authenticated
                  ? logoutWallet
                  : signInWithWallet
              }
              disabled={busy}
              aria-label={
                authenticated
                  ? 'Sign out wallet'
                  : 'Sign in wallet'
              }
            >
              <span
                className={[
                  'wallet-dot',

                  authenticated
                    ? 'connected'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden="true"
              />

              {shortenAddress(
                address,
              )}
            </button>
          )}

        {isFarcasterMiniApp &&
          authenticated && (
            <div
              className="wallet-pill"
              aria-label="Farcaster connected"
            >
              <span
                className="wallet-dot connected"
                aria-hidden="true"
              />

              Farcaster
            </div>
          )}
      </header>

      {view !== 'leaders' && (
        <section className="profile">
          <img
            className="pfp"
            src={
              user.pfp_url ||
              farcasterUser
                ?.pfpUrl ||
              fallbackPfp
            }
            alt={`${displayName} profile`}
          />

          <div className="profile-identity">
            <div className="profile-name">
              {displayName}
            </div>

            <div className="profile-title">
              {authenticated
                ? user.current_title
                : isFarcasterMiniApp
                  ? 'Farcaster Hopper'
                  : 'New to the Pond'}
            </div>
          </div>

          <div className="streak-pill">
            <div className="streak-number">
              {user.current_streak}
            </div>

            <div className="streak-label">
              day streak
            </div>
          </div>
        </section>
      )}

      {!authenticated &&
        !isFarcasterMiniApp &&
        view === 'hop' && (
          <section className="empty-state-card join-pond-card">
            <div
              className="join-pond-icon"
              aria-hidden="true"
            >
              🐸
            </div>

            <div>
              <strong>
                Join the pond
              </strong>

              <p>
                Connect a Base wallet and
                sign once to save your
                hops, streak, Big Pond
                Energy and leaderboard
                position.
              </p>
            </div>

            <button
              type="button"
              className="primary"
              onClick={
                signInWithWallet
              }
              disabled={
                busy ||
                connectPending
              }
            >
              {getConnectButtonText()}
            </button>
          </section>
        )}

      {!authenticated &&
        isFarcasterMiniApp &&
        view === 'hop' && (
          <section className="empty-state-card join-pond-card">
            <div
              className="join-pond-icon"
              aria-hidden="true"
            >
              🐸
            </div>

            <div>
              <strong>
                Entering the pond
              </strong>

              <p>
                Toby Hop uses your
                verified Farcaster
                profile. No separate
                wallet sign-in is
                required.
              </p>
            </div>

            <button
              type="button"
              className="primary"
              onClick={
                retryFarcasterAuthentication
              }
              disabled={
                farcasterAuthLoading ||
                busy
              }
            >
              {farcasterAuthLoading
                ? 'LINKING PROFILE'
                : 'RETRY FARCASTER'}
            </button>
          </section>
        )}

      {view === 'hop' && (
        <>
          <section className="todays-pond-card">
            <span className="today-label">
              TODAY’S POND
            </span>

            <strong>
              {todaysPond.emoji}{' '}
              {todaysPond.name}
            </strong>

            <span>
              {todaysPond.description}
            </span>
          </section>

          <section
            className={[
              'pond-card',

              busy
                ? 'pond-card-busy'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="hop-copy">
              <h1>
                {user.today_hopped
                  ? 'The ripple remains'
                  : 'Ready to hop'}
              </h1>

              <p>
                {user.today_hopped
                  ? 'Return tomorrow for another hop'
                  : 'Exchange one small drop for TOBY'}
              </p>
            </div>

            <div
              className={`moon moon-${todaysPond.moonPhase}`}
            />

            {todaysPond.id ===
              'rainbow' && (
              <div className="pond-rainbow" />
            )}

            {todaysPond.id ===
              'shooting-star' && (
              <div className="shooting-star" />
            )}

            {todaysPond.id ===
              'lotus' && (
              <>
                <div className="lotus-bloom lotus-bloom-one">
                  🪷
                </div>

                <div className="lotus-bloom lotus-bloom-two">
                  🪷
                </div>
              </>
            )}

            <div
              className="pond-particles"
              aria-hidden="true"
            >
              {particles.map(
                (particle) => (
                  <span
                    key={
                      particle.id
                    }
                    className={`pond-particle particle-${particle.type}`}
                    style={{
                      left:
                        `${particle.left}%`,

                      animationDelay:
                        `${particle.delay}s`,

                      animationDuration:
                        `${particle.duration}s`,

                      transform:
                        `scale(${particle.scale})`,
                    }}
                  >
                    {particleSymbol(
                      particle.type,
                    )}
                  </span>
                ),
              )}
            </div>

            <div className="reed r1" />
            <div className="reed r2" />
            <div className="reed r3" />

            <div className="water" />

            <div className="ripple ripple-one" />
            <div className="ripple ripple-two" />
            <div className="ripple ripple-three" />

            <div className="lily l1" />
            <div className="lily l2" />

            <button
              type="button"
              className="frog-button"
              disabled={
                busy ||
                user.today_hopped
              }
              onClick={performHop}
              aria-label={
                user.today_hopped
                  ? 'Today’s hop is complete'
                  : 'Tap Toby to hop'
              }
            >
              <div
                className={[
                  'frog',

                  busy
                    ? 'hopping'
                    : '',

                  user.today_hopped
                    ? 'frog-resting'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="frog-body" />

                <div className="eye left" />
                <div className="eye right" />

                <div className="mouth" />

                <div className="cheek c1" />
                <div className="cheek c2" />

                {todaysPond.goldenToby && (
                  <div className="golden-crown">
                    👑
                  </div>
                )}
              </div>

              {!busy &&
                !user.today_hopped && (
                  <div className="tap-ring" />
                )}
            </button>

            <div
              className="hop-instruction"
              aria-live="polite"
            >
              <strong>
                {getHopStatus()}
              </strong>

              <span>
                {getHopSubtext()}
              </span>
            </div>

            {busy && (
              <div
                className="hop-progress"
                role="status"
              >
                <span
                  className="hop-progress-dot"
                  aria-hidden="true"
                />

                <span>
                  Keep Toby Hop open
                </span>
              </div>
            )}
          </section>

          <section className="stat-grid">
            <div className="stat">
              <strong>
                {compactNumber(
                  user.big_pond_energy,
                )}
              </strong>

              <span>
                Big Pond Energy
              </span>
            </div>

            <div className="stat">
              <strong>
                {compactNumber(
                  user.total_hops,
                )}
              </strong>

              <span>
                Hops
              </span>
            </div>

            <div className="stat">
              <strong>
                {formatAtomic(
                  user.total_toby_atomic,
                )}
              </strong>

              <span>
                TOBY
              </span>
            </div>
          </section>
        </>
      )}

      {view === 'leaders' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-eyebrow">
                THE POND
              </span>

              <h1 className="panel-title">
                Pond leaders
              </h1>
            </div>

            {authenticated &&
              user.rank && (
                <div className="your-rank-pill">
                  Your rank #{user.rank}
                </div>
              )}
          </div>

          <div className="tabs">
            {(
              [
                'streak',
                'hops',
                'toby',
              ] as const
            ).map((kind) => (
              <button
                key={kind}
                type="button"
                className={
                  leaderKind ===
                  kind
                    ? 'active'
                    : ''
                }
                disabled={
                  leaderLoading
                }
                onClick={() =>
                  setLeaderKind(
                    kind,
                  )
                }
              >
                {kind === 'toby'
                  ? 'TOBY'
                  : kind
                      .charAt(0)
                      .toUpperCase() +
                    kind.slice(1)}
              </button>
            ))}
          </div>

          {leaderLoading && (
            <div
              className="empty"
              role="status"
            >
              <strong>
                Reading the pond
              </strong>

              <span>
                Gathering today’s
                leaders…
              </span>
            </div>
          )}

          {!leaderLoading &&
            leaders.map(
              (row) => {
                const rowName =
                  row.display_name ||
                  row.username ||
                  shortenAddress(
                    row.wallet_address,
                  );

                const validRowFid =
                  typeof row.fid ===
                    'number' &&
                  row.fid > 0
                    ? row.fid
                    : null;

                const rowKey =
                  row.id ||
                  row.wallet_address ||
                  (
                    validRowFid
                      ? `fid-${validRowFid}`
                      : `${row.rank}-${rowName}`
                  );

                const sameWallet =
                  addressesMatch(
                    row.wallet_address,
                    authenticatedAddress,
                  );

                const sameFid =
                  Boolean(
                    currentUserFid &&
                    validRowFid &&
                    validRowFid ===
                      currentUserFid,
                  );

                const isCurrentUser =
                  sameWallet ||
                  sameFid;

                return (
                  <div
                    className={[
                      'leader-row',

                      isCurrentUser
                        ? 'leader-row-you'
                        : '',

                      row.rank <= 3
                        ? `leader-rank-${row.rank}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={rowKey}
                  >
                    <div className="rank">
                      {row.rank === 1
                        ? '🥇'
                        : row.rank === 2
                          ? '🥈'
                          : row.rank === 3
                            ? '🥉'
                            : `#${row.rank}`}
                    </div>

                    <img
                      src={
                        row.pfp_url ||
                        fallbackPfp
                      }
                      alt=""
                    />

                    <div className="leader-identity">
                      <div className="leader-name">
                        {rowName}

                        {isCurrentUser && (
                          <span className="you-label">
                            YOU
                          </span>
                        )}
                      </div>

                      <div className="leader-title">
                        {row.current_title}
                      </div>
                    </div>

                    <div className="leader-value">
                      {leaderKind ===
                      'streak'
                        ? row.current_streak
                        : leaderKind ===
                            'hops'
                          ? row.total_hops
                          : formatAtomic(
                              row.total_toby_atomic,
                            )}

                      <div className="leader-sub">
                        {leaderKind ===
                        'streak'
                          ? 'days'
                          : leaderKind ===
                              'hops'
                            ? 'hops'
                            : 'TOBY'}
                      </div>
                    </div>
                  </div>
                );
              },
            )}

          {!leaderLoading &&
            !leaders.length && (
              <div className="empty">
                <strong>
                  The pond is quiet
                </strong>

                <span>
                  Complete the first
                  verified hop.
                </span>
              </div>
            )}
        </section>
      )}

      {view === 'me' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-eyebrow">
                HOPPER RECORD
              </span>

              <h1 className="panel-title">
                Your pond record
              </h1>
            </div>
          </div>

          {!authenticated &&
            !isFarcasterMiniApp && (
              <div className="empty-state-card">
                <strong>
                  Your record needs a wallet
                </strong>

                <p>
                  Connect and sign in to
                  save your progress
                  across devices.
                </p>

                <button
                  type="button"
                  className="primary"
                  onClick={
                    signInWithWallet
                  }
                  disabled={busy}
                >
                  {getConnectButtonText()}
                </button>
              </div>
            )}

          {!authenticated &&
            isFarcasterMiniApp && (
              <div className="empty-state-card">
                <strong>
                  Linking your record
                </strong>

                <p>
                  Toby Hop is connecting
                  your verified Farcaster
                  profile to the pond.
                </p>

                <button
                  type="button"
                  className="primary"
                  onClick={
                    retryFarcasterAuthentication
                  }
                  disabled={
                    farcasterAuthLoading ||
                    busy
                  }
                >
                  {farcasterAuthLoading
                    ? 'LINKING PROFILE'
                    : 'RETRY FARCASTER'}
                </button>
              </div>
            )}

          {authenticated && (
            <>
              <section className="record-hero">
                <img
                  src={
                    user.pfp_url ||
                    farcasterUser
                      ?.pfpUrl ||
                    fallbackPfp
                  }
                  alt=""
                />

                <div>
                  <strong>
                    {displayName}
                  </strong>

                  <span>
                    {user.current_title}
                  </span>
                </div>

                <div className="record-rank">
                  {user.rank
                    ? `#${user.rank}`
                    : '—'}

                  <span>
                    pond rank
                  </span>
                </div>
              </section>

              <div className="stat-grid profile-stats">
                <div className="stat">
                  <strong>
                    {user.current_streak}
                  </strong>

                  <span>
                    Current streak
                  </span>
                </div>

                <div className="stat">
                  <strong>
                    {user.longest_streak}
                  </strong>

                  <span>
                    Best streak
                  </span>
                </div>

                <div className="stat">
                  <strong>
                    {user.rank
                      ? `#${user.rank}`
                      : '—'}
                  </strong>

                  <span>
                    Pond rank
                  </span>
                </div>

                <div className="stat">
                  <strong>
                    {user.total_hops}
                  </strong>

                  <span>
                    Total hops
                  </span>
                </div>

                <div className="stat">
                  <strong>
                    {user.big_pond_energy}
                  </strong>

                  <span>
                    Big Pond Energy
                  </span>
                </div>

                <div className="stat">
                  <strong>
                    {formatAtomic(
                      user.total_toby_atomic,
                    )}
                  </strong>

                  <span>
                    TOBY
                  </span>
                </div>
              </div>

              {!isFarcasterMiniApp && (
                <button
                  type="button"
                  className="secondary sign-out-button"
                  onClick={
                    logoutWallet
                  }
                  disabled={busy}
                >
                  SIGN OUT WALLET
                </button>
              )}
            </>
          )}
        </section>
      )}

      {notice && (
        <div
          className={[
            'error-card',
            `notice-${notice.kind}`,
          ].join(' ')}
          role={
            notice.kind === 'error'
              ? 'alert'
              : 'status'
          }
          aria-live={
            notice.kind === 'error'
              ? 'assertive'
              : 'polite'
          }
        >
          <span>
            {notice.message}
          </span>

          <button
            type="button"
            onClick={() =>
              setNotice(null)
            }
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <nav
        className="nav"
        aria-label="Toby Hop navigation"
      >
        <button
          type="button"
          className={
            view === 'hop'
              ? 'active'
              : ''
          }
          onClick={() =>
            setView('hop')
          }
        >
          <span aria-hidden="true">
            🐸
          </span>

          Hop
        </button>

        <button
          type="button"
          className={
            view === 'leaders'
              ? 'active'
              : ''
          }
          onClick={() =>
            setView('leaders')
          }
        >
          <span aria-hidden="true">
            🏆
          </span>

          Leaders
        </button>

        <button
          type="button"
          className={
            view === 'me'
              ? 'active'
              : ''
          }
          onClick={() =>
            setView('me')
          }
        >
          <span aria-hidden="true">
            ◉
          </span>

          Me
        </button>
      </nav>

      {receipt && (
        <div
          className="success"
          role="dialog"
          aria-modal="true"
          aria-label="Hop complete"
        >
          <div className="success-card">
            <div
              className="success-frog"
              aria-hidden="true"
            >
              🐸
            </div>

            <div className="success-eyebrow">
              HOP COMPLETE
            </div>

            <div className="energy">
              +1 BIG POND ENERGY
            </div>

            <div className="success-summary">
              <strong>
                {receipt.tobyDisplay}{' '}
                TOBY
              </strong>

              <span>
                {receipt.streak} day
                streak
              </span>

              {receipt.dailyPosition >
                0 && (
                <span>
                  Hopper #
                  {receipt.dailyPosition}{' '}
                  today
                </span>
              )}
            </div>

            <div className="success-actions">
              <button
                type="button"
                className="primary"
                onClick={shareHop}
              >
                {canCast
                  ? 'CAST MY HOP'
                  : 'SHARE MY HOP'}
              </button>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setReceipt(null)
                }
              >
                BACK TO THE POND
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
