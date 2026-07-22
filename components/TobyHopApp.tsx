'use client';

import { sdk } from '@farcaster/miniapp-sdk';
import { createSiweMessage } from 'viem/siwe';
import { base } from 'wagmi/chains';
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
import {
  useCallback,
  useEffect,
  useMemo,
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

type View = 'hop' | 'leaders' | 'me';

type HopState =
  | 'idle'
  | 'connecting'
  | 'signing-in'
  | 'quoting'
  | 'approving'
  | 'swapping'
  | 'verifying';

type MiniAppUser = {
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type SessionResponse = {
  authenticated: boolean;
  address?: `0x${string}`;
  user?: Partial<HopUser> & {
    id?: string;
    wallet_address?: string | null;
  };
  error?: string;
};

type VerifyAuthResponse = {
  authenticated: boolean;
  address: `0x${string}`;
  user?: Partial<HopUser> & {
    id?: string;
    wallet_address?: string | null;
  };
  error?: string;
};

type QuoteResponse = {
  allowanceTarget: `0x${string}`;
  buyAmount: string;
  transaction: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: string;
    gas?: string;
  };
};

type LeaderRowWithWallet = LeaderRow & {
  id?: string;
  wallet_address?: string | null;
};

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
      <text
        x="48"
        y="62"
        text-anchor="middle"
        font-size="46"
      >
        🐸
      </text>
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

function normalizeUser(
  value?: SessionResponse['user'],
  farcasterUser?: MiniAppUser | null,
): HopUser {
  return {
    fid:
      typeof value?.fid === 'number'
        ? value.fid
        : farcasterUser?.fid ?? 0,

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
      Number(value?.total_hops ?? 0),

    current_streak:
      Number(value?.current_streak ?? 0),

    longest_streak:
      Number(value?.longest_streak ?? 0),

    big_pond_energy:
      Number(value?.big_pond_energy ?? 0),

    total_toby_atomic:
      String(value?.total_toby_atomic ?? '0'),

    total_usdc_atomic:
      String(value?.total_usdc_atomic ?? '0'),

    first_hop_at:
      value?.first_hop_at ?? null,

    last_hop_at:
      value?.last_hop_at ?? null,

    today_hopped:
      Boolean(value?.today_hopped),

    rank:
      value?.rank == null
        ? null
        : Number(value.rank),
  };
}

function parseApiError(
  raw: string,
  fallback: string,
): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: string;
      message?: string;
    };

    return (
      parsed.error ||
      parsed.message ||
      fallback
    );
  } catch {
    return raw || fallback;
  }
}

function getErrorMessage(
  cause: unknown,
): string {
  if (!(cause instanceof Error)) {
    return 'The pond could not complete this hop.';
  }

  const originalMessage =
    cause.message || '';

  const message =
    originalMessage.toLowerCase();

  if (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('rejected the request')
  ) {
    return 'The request was cancelled.';
  }

  if (
    message.includes('insufficient funds') ||
    message.includes('insufficient balance')
  ) {
    return 'You need at least one cent of USDC on Base and a small amount of ETH for gas.';
  }

  if (
    message.includes('already complete') ||
    message.includes('already hopped')
  ) {
    return 'You already completed today’s official hop.';
  }

  if (
    message.includes('nonce') ||
    message.includes('signature verification')
  ) {
    return 'Your sign-in request expired. Please sign in again.';
  }

  if (
    message.includes('wallet authentication required') ||
    message.includes('unauthorized') ||
    message.includes('session')
  ) {
    return 'Connect and sign in with your Base wallet to continue.';
  }

  if (
    message.includes('wrong chain') ||
    message.includes('chain mismatch') ||
    message.includes('requires base')
  ) {
    return 'Switch your wallet to Base and try again.';
  }

  if (
    message.includes('connector') ||
    message.includes('provider')
  ) {
    return 'The Base wallet could not connect. Close and reopen Toby Hop, then try again.';
  }

  if (
    message.includes(
      'usdc and toby contract addresses must be configured',
    )
  ) {
    return 'The Toby Hop token configuration is incomplete.';
  }

  return originalMessage;
}

function shortenAddress(
  address?: string | null,
): string {
  if (!address) {
    return 'Hopper';
  }

  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function getSafeMiniAppContext(): Promise<{
  user: MiniAppUser | null;
  added: boolean;
}> {
  try {
    const context =
      await Promise.resolve(sdk.context);

    if (
      !context ||
      typeof context !== 'object'
    ) {
      return {
        user: null,
        added: false,
      };
    }

    const typedContext =
      context as {
        user?: MiniAppUser;
        client?: {
          added?: boolean;
        };
      };

    return {
      user:
        typedContext.user &&
        typeof typedContext.user === 'object'
          ? typedContext.user
          : null,

      added:
        Boolean(
          typedContext.client?.added,
        ),
    };
  } catch {
    return {
      user: null,
      added: false,
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

  const [user, setUser] =
    useState<HopUser>(emptyUser);

  const [authenticated, setAuthenticated] =
    useState(false);

  const [
    authenticatedAddress,
    setAuthenticatedAddress,
  ] = useState<`0x${string}` | null>(
    null,
  );

  const [
    farcasterUser,
    setFarcasterUser,
  ] = useState<MiniAppUser | null>(
    null,
  );

  const [
    miniAppAdded,
    setMiniAppAdded,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [hopState, setHopState] =
    useState<HopState>('idle');

  const [receipt, setReceipt] =
    useState<HopReceipt | null>(null);

  const [error, setError] =
    useState('');

  const [leaderKind, setLeaderKind] =
    useState<LeaderboardKind>('streak');

  const [leaders, setLeaders] =
    useState<LeaderRowWithWallet[]>([]);

  const [leaderLoading, setLeaderLoading] =
    useState(false);

  const todaysPond = useMemo(
    () => getTodaysPond(),
    [],
  );

  const particles = useMemo(() => {
    if (!todaysPond.particle) {
      return [];
    }

    return Array.from(
      {
        length:
          todaysPond.particleCount,
      },
      (_, index) => ({
        id:
          `${todaysPond.particle}-${index}`,

        type:
          todaysPond.particle!,

        left:
          4 +
          ((index * 37 + 11) % 92),

        delay:
          ((index * 23) % 31) / 10,

        duration:
          3.4 +
          ((index * 17) % 25) / 10,

        scale:
          0.65 +
          ((index * 13) % 9) / 10,
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
    isPending: connectPending,
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

  const busy =
    hopState !== 'idle';

  const displayName =
    user.display_name ||
    user.username ||
    shortenAddress(
      authenticatedAddress,
    );

  const canCast =
    Boolean(farcasterUser);

  const walletMatchesSession =
    Boolean(
      address &&
      authenticatedAddress &&
      address.toLowerCase() ===
        authenticatedAddress.toLowerCase(),
    );

  const loadWalletSession =
    useCallback(
      async (
        currentFarcasterUser?: MiniAppUser | null,
      ) => {
        const response =
          await fetch(
            '/api/auth/session',
            {
              method: 'GET',
              credentials: 'include',
              cache: 'no-store',
            },
          );

        const result =
          (await response.json()) as SessionResponse;

        if (
          !response.ok ||
          !result.authenticated ||
          !result.address
        ) {
          setAuthenticated(false);
          setAuthenticatedAddress(null);

          setUser(
            normalizeUser(
              undefined,
              currentFarcasterUser ??
                farcasterUser,
            ),
          );

          return false;
        }

        setAuthenticated(true);

        setAuthenticatedAddress(
          result.address,
        );

        setUser(
          normalizeUser(
            result.user,
            currentFarcasterUser ??
              farcasterUser,
          ),
        );

        return true;
      },
      [farcasterUser],
    );

  const syncFarcasterProfile =
    useCallback(
      async (
        miniUser: MiniAppUser,
      ) => {
        /*
          Profile sync is optional. Wallet SIWE remains the
          authentication source of truth.
        */
        try {
          const response =
            await sdk.quickAuth.fetch(
              '/api/me',
              {
                method: 'POST',
                headers: {
                  'content-type':
                    'application/json',
                },
                body: JSON.stringify({
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
                    authenticatedAddress ??
                    address ??
                    null,
                }),
              },
            );

          if (!response.ok) {
            return;
          }

          const profile =
            (await response.json()) as Partial<HopUser>;

          setUser((previous) => ({
            ...previous,

            username:
              profile.username ??
              miniUser.username ??
              previous.username,

            display_name:
              profile.display_name ??
              miniUser.displayName ??
              previous.display_name,

            pfp_url:
              profile.pfp_url ??
              miniUser.pfpUrl ??
              previous.pfp_url,
          }));
        } catch {
          /*
            Toby Hop still works if the host does not support
            Farcaster Quick Auth.
          */
        }
      },
      [
        address,
        authenticatedAddress,
      ],
    );

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        setError('');

        try {
          await sdk.actions.ready();
        } catch {
          /*
            Standard web browsers do not need this.
          */
        }

        const context =
          await getSafeMiniAppContext();

        if (!active) {
          return;
        }

        setFarcasterUser(
          context.user,
        );

        setMiniAppAdded(
          context.added,
        );

        await loadWalletSession(
          context.user,
        );
      } catch (cause) {
        if (active) {
          setError(
            getErrorMessage(cause),
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
  }, [loadWalletSession]);

  useEffect(() => {
    if (
      authenticated &&
      farcasterUser
    ) {
      void syncFarcasterProfile(
        farcasterUser,
      );
    }
  }, [
    authenticated,
    farcasterUser,
    syncFarcasterProfile,
  ]);

  useEffect(() => {
    if (
      !authenticated ||
      !authenticatedAddress ||
      !address
    ) {
      return;
    }

    if (
      address.toLowerCase() !==
      authenticatedAddress.toLowerCase()
    ) {
      setAuthenticated(false);

      setError(
        'The connected wallet changed. Sign in again to protect your pond record.',
      );
    }
  }, [
    address,
    authenticated,
    authenticatedAddress,
  ]);

  useEffect(() => {
    if (
      view !== 'leaders' ||
      !authenticated
    ) {
      return;
    }

    let active = true;

    async function loadLeaderboard() {
      setLeaderLoading(true);

      try {
        setError('');

        const response =
          await fetch(
            `/api/leaderboard?kind=${leaderKind}`,
            {
              method: 'GET',
              credentials: 'include',
              cache: 'no-store',
            },
          );

        const raw =
          await response.text();

        if (!response.ok) {
          throw new Error(
            parseApiError(
              raw,
              'Unable to load the leaderboard.',
            ),
          );
        }

        const rows =
          JSON.parse(
            raw,
          ) as LeaderRowWithWallet[];

        if (active) {
          setLeaders(rows);
        }
      } catch (cause) {
        if (active) {
          setError(
            getErrorMessage(cause),
          );
        }
      } finally {
        if (active) {
          setLeaderLoading(false);
        }
      }
    }

    void loadLeaderboard();

    return () => {
      active = false;
    };
  }, [
    authenticated,
    leaderKind,
    view,
  ]);

  async function provideTapFeedback() {
    try {
      const capabilities =
        await sdk.getCapabilities();

      if (
        capabilities.includes(
          'haptics.impactOccurred',
        )
      ) {
        await sdk.haptics
          .impactOccurred('medium');
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

    const wantsFarcaster =
      Boolean(farcasterUser);

    if (wantsFarcaster) {
      const farcasterConnector =
        connectors.find(
          (connector) => {
            const searchable =
              `${connector.id} ${connector.name}`
                .toLowerCase();

            return (
              searchable.includes(
                'farcaster',
              ) ||
              searchable.includes(
                'miniapp',
              )
            );
          },
        );

      if (farcasterConnector) {
        return farcasterConnector;
      }
    }

    const baseConnector =
      connectors.find(
        (connector) => {
          const searchable =
            `${connector.id} ${connector.name}`
              .toLowerCase();

          return (
            searchable.includes(
              'base',
            ) ||
            searchable.includes(
              'coinbase',
            )
          );
        },
      );

    if (baseConnector) {
      return baseConnector;
    }

    const injectedConnector =
      connectors.find(
        (connector) =>
          connector.id ===
            'injected' ||
          connector.name
            .toLowerCase()
            .includes('injected'),
      );

    return (
      injectedConnector ??
      connectors[0]
    );
  }

  async function getConnectedWallet(): Promise<
    `0x${string}`
  > {
    if (
      isConnected &&
      address
    ) {
      return address;
    }

    setHopState('connecting');

    const connector =
      chooseConnector();

    if (!connector) {
      throw new Error(
        'No compatible Base wallet connector was found.',
      );
    }

    const connection =
      await connectAsync({
        connector,
        chainId: base.id,
      });

    const wallet =
      connection.accounts[0];

    if (!wallet) {
      throw new Error(
        'No Base wallet was returned.',
      );
    }

    return wallet;
  }

  async function ensureBaseChain() {
    if (chainId === base.id) {
      return;
    }

    await switchChainAsync({
      chainId: base.id,
    });
  }

  async function signInWithWallet() {
    setError('');

    try {
      const wallet =
        await getConnectedWallet();

      setHopState('signing-in');

      await ensureBaseChain();

      const nonceResponse =
        await fetch(
          '/api/auth/nonce',
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          },
        );

      const nonceRaw =
        await nonceResponse.text();

      if (!nonceResponse.ok) {
        throw new Error(
          parseApiError(
            nonceRaw,
            'Unable to create a sign-in request.',
          ),
        );
      }

      const {
        nonce,
      } = JSON.parse(
        nonceRaw,
      ) as {
        nonce: string;
      };

      const message =
        createSiweMessage({
          address: wallet,
          chainId: base.id,
          domain:
            window.location.host,
          uri:
            window.location.origin,
          version: '1',
          nonce,
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
        await fetch(
          '/api/auth/verify',
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'content-type':
                'application/json',
            },
            body: JSON.stringify({
              message,
              signature,
            }),
          },
        );

      const verifyRaw =
        await verifyResponse.text();

      if (!verifyResponse.ok) {
        throw new Error(
          parseApiError(
            verifyRaw,
            'Wallet authentication failed.',
          ),
        );
      }

      const result =
        JSON.parse(
          verifyRaw,
        ) as VerifyAuthResponse;

      if (
        !result.authenticated ||
        !result.address
      ) {
        throw new Error(
          result.error ||
            'Wallet authentication failed.',
        );
      }

      setAuthenticated(true);

      setAuthenticatedAddress(
        result.address,
      );

      setUser(
        normalizeUser(
          result.user,
          farcasterUser,
        ),
      );

      if (farcasterUser) {
        await syncFarcasterProfile(
          farcasterUser,
        );
      }

      return result.address;
    } catch (cause) {
      setError(
        getErrorMessage(cause),
      );

      return null;
    } finally {
      setHopState('idle');
    }
  }

  async function logoutWallet() {
    try {
      await fetch(
        '/api/auth/logout',
        {
          method: 'POST',
          credentials: 'include',
        },
      );
    } finally {
      setAuthenticated(false);
      setAuthenticatedAddress(null);

      setUser(
        normalizeUser(
          undefined,
          farcasterUser,
        ),
      );

      disconnect();
    }
  }

  async function performHop() {
    if (
      busy ||
      user.today_hopped
    ) {
      return;
    }

    setError('');

    await provideTapFeedback();

    try {
      let wallet =
        address ?? null;

      if (
        !authenticated ||
        !authenticatedAddress ||
        !walletMatchesSession
      ) {
        wallet =
          await signInWithWallet();

        if (!wallet) {
          return;
        }
      }

      if (!wallet) {
        throw new Error(
          'A connected Base wallet is required.',
        );
      }

      await ensureBaseChain();

      setHopState('quoting');

      const quoteResponse =
        await fetch(
          `/api/hop/quote?wallet=${wallet}`,
          {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          },
        );

      const quoteRaw =
        await quoteResponse.text();

      if (!quoteResponse.ok) {
        throw new Error(
          parseApiError(
            quoteRaw,
            'Unable to prepare today’s hop.',
          ),
        );
      }

      const quote =
        JSON.parse(
          quoteRaw,
        ) as QuoteResponse;

      setHopState('approving');

      const approvalHash =
        await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [
            quote.allowanceTarget,
            HOP_USDC_ATOMIC,
          ],
          chainId: base.id,
        });

      if (!publicClient) {
        throw new Error(
          'The Base network client is unavailable.',
        );
      }

      const approvalReceipt =
        await publicClient
          .waitForTransactionReceipt({
            hash: approvalHash,
            confirmations: 1,
            timeout: 120_000,
          });

      if (
        approvalReceipt.status !==
        'success'
      ) {
        throw new Error(
          'The USDC approval transaction failed.',
        );
      }

      setHopState('swapping');

      const transactionHash =
        await sendTransactionAsync({
          to:
            quote.transaction.to,
          data:
            quote.transaction.data,
          value: BigInt(
            quote.transaction.value ??
              '0',
          ),
          gas:
            quote.transaction.gas
              ? BigInt(
                  quote.transaction.gas,
                )
              : undefined,
          chainId: base.id,
        });

      setHopState('verifying');

      const verificationResponse =
        await fetch(
          '/api/hop/verify',
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'content-type':
                'application/json',
            },
            body: JSON.stringify({
              txHash:
                transactionHash,

              walletAddress:
                wallet,
            }),
          },
        );

      const verificationRaw =
        await verificationResponse.text();

      if (
        !verificationResponse.ok
      ) {
        throw new Error(
          parseApiError(
            verificationRaw,
            'Unable to verify the completed hop.',
          ),
        );
      }

      const completedHop =
        JSON.parse(
          verificationRaw,
        ) as HopReceipt;

      setReceipt(completedHop);

      setUser((previous) => ({
        ...previous,

        today_hopped: true,

        total_hops:
          completedHop.totalHops,

        current_streak:
          completedHop.streak,

        longest_streak:
          Math.max(
            previous.longest_streak,
            completedHop.streak,
          ),

        big_pond_energy:
          previous.big_pond_energy +
          1,

        current_title:
          completedHop.title,

        total_toby_atomic: (
          BigInt(
            previous.total_toby_atomic,
          ) +
          BigInt(
            completedHop.tobyAtomic,
          )
        ).toString(),
      }));

      try {
        await sdk.haptics
          .notificationOccurred(
            'success',
          );
      } catch {
        /*
          Optional outside Mini App hosts.
        */
      }

      if (
        farcasterUser &&
        !miniAppAdded
      ) {
        try {
          await sdk.actions
            .addMiniApp();

          setMiniAppAdded(true);
        } catch {
          /*
            The completed hop remains valid.
          */
        }
      }
    } catch (cause) {
      setError(
        getErrorMessage(cause),
      );

      try {
        await sdk.haptics
          .notificationOccurred(
            'error',
          );
      } catch {
        /*
          Optional outside Mini App hosts.
        */
      }
    } finally {
      setHopState('idle');
    }
  }

  async function shareHop() {
    if (!receipt) {
      return;
    }

    setError('');

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      window.location.origin;

    if (canCast) {
      try {
        await sdk.actions.composeCast({
          text:
            receipt.castText,
          embeds: [appUrl],
        });

        return;
      } catch {
        /*
          Fall through to web share.
        */
      }
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Toby Hop',
          text:
            receipt.castText,
          url: appUrl,
        });

        return;
      }

      await navigator.clipboard.writeText(
        `${receipt.castText}\n\n${appUrl}`,
      );

      setError(
        'Your hop message was copied.',
      );
    } catch (cause) {
      setError(
        getErrorMessage(cause),
      );
    }
  }

  function getHopStatus(): string {
    if (user.today_hopped) {
      return 'Today’s hop is complete';
    }

    if (!authenticated) {
      return 'Tap Toby to join the pond';
    }

    switch (hopState) {
      case 'connecting':
        return 'Connecting your wallet';

      case 'signing-in':
        return 'Protecting your pond record';

      case 'quoting':
        return 'Finding today’s route';

      case 'approving':
        return 'Approve one cent of USDC';

      case 'swapping':
        return 'Toby is hopping';

      case 'verifying':
        return 'Counting your hop';

      default:
        return 'Tap Toby to hop';
    }
  }

  function getHopSubtext(): string {
    if (user.today_hopped) {
      return 'One Big Pond Energy collected';
    }

    if (!authenticated) {
      return 'Connect and sign in with a Base wallet';
    }

    return 'One cent USDC to TOBY';
  }

  if (loading) {
    return (
      <main className="shell">
        <div className="empty">
          Opening the pond
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
            One hop every day
          </div>
        </div>

        {isConnected &&
          address && (
            <button
              type="button"
              className="wallet-pill"
              onClick={
                authenticated
                  ? logoutWallet
                  : signInWithWallet
              }
              aria-label={
                authenticated
                  ? 'Sign out wallet'
                  : 'Sign in wallet'
              }
            >
              {shortenAddress(
                address,
              )}
            </button>
          )}
      </header>

      {view !== 'leaders' && (
        <section className="profile">
          <img
            className="pfp"
            src={
              user.pfp_url ||
              farcasterUser?.pfpUrl ||
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
        view === 'hop' && (
          <section className="empty-state-card">
            <strong>
              Join the pond
            </strong>

            <p>
              Connect a Base wallet and
              sign once to save your hops,
              streak, Big Pond Energy and
              leaderboard position.
            </p>

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
              {hopState ===
              'signing-in'
                ? 'SIGNING IN'
                : hopState ===
                    'connecting' ||
                  connectPending
                  ? 'CONNECTING'
                  : 'CONNECT WALLET'}
            </button>
          </section>
        )}

      {view === 'hop' && (
        <>
          <section className="todays-pond-card">
            <span className="today-label">
              TODAYS POND
            </span>

            <strong>
              {todaysPond.emoji}{' '}
              {todaysPond.name}
            </strong>

            <span>
              {todaysPond.description}
            </span>
          </section>

          <section className="pond-card">
            <div className="hop-copy">
              <h1>
                Ready to hop
              </h1>

              <p>
                Exchange one small drop
                for TOBY
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
                  : authenticated
                    ? 'Tap Toby to hop'
                    : 'Tap Toby to connect your wallet'
              }
            >
              <div
                className={`frog ${
                  busy
                    ? 'hopping'
                    : ''
                }`}
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

            <div className="hop-instruction">
              <strong>
                {getHopStatus()}
              </strong>

              <span>
                {getHopSubtext()}
              </span>
            </div>
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

              <span>Hops</span>
            </div>

            <div className="stat">
              <strong>
                {formatAtomic(
                  user.total_toby_atomic,
                )}
              </strong>

              <span>TOBY</span>
            </div>
          </section>
        </>
      )}

      {view === 'leaders' && (
        <section className="panel">
          <h1 className="panel-title">
            Pond leaders
          </h1>

          {!authenticated && (
            <div className="empty-state-card">
              <strong>
                Join to view the pond
              </strong>

              <p>
                Sign in with a Base wallet
                to view verified streak,
                hop and TOBY rankings.
              </p>

              <button
                type="button"
                className="primary"
                onClick={
                  signInWithWallet
                }
                disabled={busy}
              >
                CONNECT WALLET
              </button>
            </div>
          )}

          {authenticated && (
            <>
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
                <div className="empty">
                  Reading the pond
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

                    const rowKey =
                      row.id ||
                      row.wallet_address ||
                      String(row.fid);

                    return (
                      <div
                        className="leader-row"
                        key={rowKey}
                      >
                        <div className="rank">
                          #{row.rank}
                        </div>

                        <img
                          src={
                            row.pfp_url ||
                            fallbackPfp
                          }
                          alt=""
                        />

                        <div>
                          <div className="leader-name">
                            {rowName}
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
                    No verified hops yet
                  </div>
                )}
            </>
          )}
        </section>
      )}

      {view === 'me' && (
        <section className="panel">
          <h1 className="panel-title">
            Your pond record
          </h1>

          {!authenticated && (
            <div className="empty-state-card">
              <strong>
                Your record needs a wallet
              </strong>

              <p>
                Connect and sign in to save
                your progress across devices.
              </p>

              <button
                type="button"
                className="primary"
                onClick={
                  signInWithWallet
                }
                disabled={busy}
              >
                CONNECT WALLET
              </button>
            </div>
          )}

          {authenticated && (
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

                <span>Pond rank</span>
              </div>

              <div className="stat">
                <strong>
                  {user.total_hops}
                </strong>

                <span>Total hops</span>
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

                <span>TOBY</span>
              </div>
            </div>
          )}
        </section>
      )}

      {error && (
        <div
          className="error-card"
          role="alert"
        >
          <span>{error}</span>

          <button
            type="button"
            onClick={() =>
              setError('')
            }
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <nav className="nav">
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
          Me
        </button>
      </nav>

      {receipt && (
        <div className="success">
          <div className="success-card">
            <div className="success-eyebrow">
              HOP COMPLETE
            </div>

            <div className="energy">
              ONE BIG POND ENERGY
            </div>

            <div className="success-summary">
              {receipt.tobyDisplay}{' '}
              TOBY

              <span>·</span>

              {receipt.streak} day
              streak
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
