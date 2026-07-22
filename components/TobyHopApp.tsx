'use client';

import { sdk } from '@farcaster/miniapp-sdk';
import {
  useAccount,
  useConnect,
  useSendTransaction,
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
  | 'quoting'
  | 'approving'
  | 'swapping'
  | 'verifying';

type MiniAppUser = {
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type QuoteResponse = {
  allowanceTarget: `0x${string}`;

  transaction: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: string;
    gas?: string;
  };

  buyAmount: string;
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

function getErrorMessage(
  cause: unknown,
): string {
  if (!(cause instanceof Error)) {
    return 'The pond could not complete this hop.';
  }

  const message = cause.message.toLowerCase();

  if (
    message.includes('undefined is not an object') ||
    message.includes('cannot read properties of undefined')
  ) {
    return 'The host did not provide a Farcaster profile. Reopen Toby Hop inside Farcaster.';
  }

  if (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('rejected the request')
  ) {
    return 'The hop was cancelled.';
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
    return 'You already completed todays official hop.';
  }

  if (
    message.includes('authorization') ||
    message.includes('quick auth') ||
    message.includes('unauthorized')
  ) {
    return 'Farcaster authentication is unavailable in this browser session.';
  }

  if (
    message.includes('connector') ||
    message.includes('provider')
  ) {
    return 'The Base wallet could not connect. Close and reopen Toby Hop and try again.';
  }

  return cause.message;
}

async function getSafeMiniAppUser(): Promise<
  MiniAppUser | null
> {
  try {
    /*
      Promise.resolve supports SDK versions where context is
      either a promise-like value or a resolved object.
    */
    const context = await Promise.resolve(
      sdk.context,
    );

    if (
      !context ||
      typeof context !== 'object'
    ) {
      return null;
    }

    const possibleUser = (
      context as {
        user?: MiniAppUser;
      }
    ).user;

    if (
      !possibleUser ||
      typeof possibleUser !== 'object'
    ) {
      return null;
    }

    return possibleUser;
  } catch {
    return null;
  }
}

function particleSymbol(
  type: PondParticle,
): string {
  switch (type) {
    case 'drop':
      return '';

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

  const [hasFarcasterUser, setHasFarcasterUser] =
    useState(false);

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
    useState<LeaderRow[]>([]);

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
        id: `${todaysPond.particle}-${index}`,
        type: todaysPond.particle!,
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
    isConnected,
  } = useAccount();

  const {
    connectors,
    connectAsync,
  } = useConnect();

  const {
    writeContractAsync,
  } = useWriteContract();

  const {
    sendTransactionAsync,
  } = useSendTransaction();

  const busy =
    hopState !== 'idle';

  const displayName =
    user.display_name ||
    user.username ||
    'Hopper';

  const authenticatedFetch = useCallback(
    async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      return sdk.quickAuth.fetch(
        input,
        init,
      );
    },
    [],
  );

  const loadUser = useCallback(async () => {
    const miniAppUser =
      await getSafeMiniAppUser();

    if (!miniAppUser) {
      /*
        Do not crash when opened in Safari or a Base
        session that does not expose Farcaster context.
      */
      setHasFarcasterUser(false);
      setUser(emptyUser);
      return;
    }

    setHasFarcasterUser(true);

    const response =
      await authenticatedFetch(
        '/api/me',
        {
          method: 'POST',

          headers: {
            'content-type':
              'application/json',
          },

          body: JSON.stringify({
            username:
              miniAppUser.username ??
              null,

            displayName:
              miniAppUser.displayName ??
              null,

            pfpUrl:
              miniAppUser.pfpUrl ??
              null,
          }),
        },
      );

    if (!response.ok) {
      throw new Error(
        await response.text(),
      );
    }

    const profile =
      (await response.json()) as HopUser;

    setUser(profile);
  }, [authenticatedFetch]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        setError('');

        /*
          Tell the host that the page has rendered before
          waiting on profile network requests.
        */
        try {
          await sdk.actions.ready();
        } catch {
          // Normal browser sessions may not support this.
        }

        await loadUser();
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
  }, [loadUser]);

  useEffect(() => {
    if (
      view !== 'leaders' ||
      !hasFarcasterUser
    ) {
      return;
    }

    let active = true;

    async function loadLeaderboard() {
      try {
        setError('');

        const response =
          await authenticatedFetch(
            `/api/leaderboard?kind=${leaderKind}`,
          );

        if (!response.ok) {
          throw new Error(
            await response.text(),
          );
        }

        const rows =
          (await response.json()) as LeaderRow[];

        if (active) {
          setLeaders(rows);
        }
      } catch (cause) {
        if (active) {
          setError(
            getErrorMessage(cause),
          );
        }
      }
    }

    void loadLeaderboard();

    return () => {
      active = false;
    };
  }, [
    authenticatedFetch,
    hasFarcasterUser,
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
      // Haptics are optional.
    }
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
      connectors[0];

    if (!connector) {
      throw new Error(
        'Wallet connector is unavailable.',
      );
    }

    const connection =
      await connectAsync({
        connector,
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

  async function performHop() {
    if (
      busy ||
      user.today_hopped
    ) {
      return;
    }

    setError('');

    if (!hasFarcasterUser) {
      setError(
        'Open Toby Hop inside Farcaster to make an authenticated hop. Base wallet authentication will be added separately.',
      );

      return;
    }

    await provideTapFeedback();

    try {
      const wallet =
        await getConnectedWallet();

      setHopState('quoting');

      const quoteResponse =
        await authenticatedFetch(
          `/api/hop/quote?wallet=${wallet}`,
        );

      if (!quoteResponse.ok) {
        throw new Error(
          await quoteResponse.text(),
        );
      }

      const quote =
        (await quoteResponse.json()) as QuoteResponse;

      setHopState('approving');

      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [
          quote.allowanceTarget,
          10_000n,
        ],
      });

      setHopState('swapping');

      const transactionHash =
        await sendTransactionAsync({
          to: quote.transaction.to,
          data: quote.transaction.data,

          value: BigInt(
            quote.transaction.value ??
              '0',
          ),

          gas: quote.transaction.gas
            ? BigInt(
                quote.transaction.gas,
              )
            : undefined,
        });

      setHopState('verifying');

      const verificationResponse =
        await authenticatedFetch(
          '/api/hop/verify',
          {
            method: 'POST',

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

      if (
        !verificationResponse.ok
      ) {
        throw new Error(
          await verificationResponse.text(),
        );
      }

      const completedHop =
        (await verificationResponse.json()) as HopReceipt;

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
        // Optional.
      }

      try {
        const context =
          await Promise.resolve(
            sdk.context,
          );

        if (
          context &&
          typeof context === 'object' &&
          'client' in context
        ) {
          const client = (
            context as {
              client?: {
                added?: boolean;
              };
            }
          ).client;

          if (!client?.added) {
            await sdk.actions
              .addMiniApp();
          }
        }
      } catch {
        // The hop remains valid.
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
        // Optional.
      }
    } finally {
      setHopState('idle');
    }
  }

  async function castHop() {
    if (!receipt) {
      return;
    }

    try {
      await sdk.actions.composeCast({
        text: receipt.castText,

        embeds: [
          process.env
            .NEXT_PUBLIC_APP_URL ||
            window.location.origin,
        ],
      });
    } catch (cause) {
      setError(
        getErrorMessage(cause),
      );
    }
  }

  function getHopStatus(): string {
    if (user.today_hopped) {
      return 'Todays hop is complete';
    }

    switch (hopState) {
      case 'connecting':
        return 'Connecting your wallet';

      case 'quoting':
        return 'Finding todays route';

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
      className={`shell pond-theme-${todaysPond.id} ${
        todaysPond.goldenToby
          ? 'golden-toby-day'
          : ''
      }`}
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
            <div className="wallet-pill">
              {address.slice(0, 5)}
              {'…'}
              {address.slice(-4)}
            </div>
          )}
      </header>

      {view !== 'leaders' && (
        <section className="profile">
          <img
            className="pfp"
            src={
              user.pfp_url ||
              fallbackPfp
            }
            alt={`${displayName} profile`}
          />

          <div className="profile-identity">
            <div className="profile-name">
              {displayName}
            </div>

            <div className="profile-title">
              {user.current_title}
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
                    key={particle.id}
                    className={`pond-particle particle-${particle.type}`}
                    style={{
                      left: `${particle.left}%`,
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
                  ? 'Todays hop is complete'
                  : 'Tap Toby to hop'
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
                {user.today_hopped
                  ? 'One Big Pond Energy collected'
                  : 'One cent USDC to TOBY'}
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

          {!hasFarcasterUser && (
            <div className="empty-state-card">
              Open Toby Hop inside Farcaster
              to view verified pond leaders
            </div>
          )}

          {hasFarcasterUser && (
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
                      leaderKind === kind
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setLeaderKind(kind)
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

              {leaders.map((row) => (
                <div
                  className="leader-row"
                  key={row.fid}
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
                      {row.display_name ||
                        row.username ||
                        `FID ${row.fid}`}
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
              ))}

              {!leaders.length && (
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
            aria-label="Dismiss error"
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
                onClick={castHop}
              >
                CAST MY HOP
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
