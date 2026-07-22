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
        y="61"
        text-anchor="middle"
        font-size="46"
      >
        🐸
      </text>
    </svg>
  `);

function getErrorMessage(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return 'The pond could not complete this hop.';
  }

  const message = cause.message.toLowerCase();

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
    return 'You need at least $0.01 USDC on Base plus a small amount of ETH for gas.';
  }

  if (
    message.includes('already complete') ||
    message.includes('already hopped')
  ) {
    return 'You already completed today’s official hop.';
  }

  if (
    message.includes('connector') ||
    message.includes('provider')
  ) {
    return 'The Farcaster wallet could not connect. Close and reopen Toby Hop, then try again.';
  }

  return cause.message;
}

export function TobyHopApp() {
  const [view, setView] =
    useState<View>('hop');

  const [user, setUser] =
    useState<HopUser | null>(null);

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

  const busy = hopState !== 'idle';

  const displayName =
    user?.display_name ||
    user?.username ||
    'Hopper';

  const authenticatedFetch = useCallback(
    async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      /*
        quickAuth.fetch automatically obtains a Quick Auth token
        and adds it as an Authorization Bearer token.
      */
      return sdk.quickAuth.fetch(input, init);
    },
    [],
  );

  const loadUser = useCallback(async () => {
    const context = await sdk.context;

    const response = await authenticatedFetch(
      '/api/me',
      {
        method: 'POST',

        headers: {
          'content-type': 'application/json',
        },

        body: JSON.stringify({
          username: context.user.username,
          displayName: context.user.displayName,
          pfpUrl: context.user.pfpUrl,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
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

        await loadUser();

        if (!active) {
          return;
        }

        /*
          Tell Farcaster/Base App that the Mini App is ready.
          This removes the host splash screen.
        */
        await sdk.actions.ready();
      } catch (cause) {
        if (active) {
          setError(getErrorMessage(cause));
        }

        /*
          Do not leave the Mini App frozen on its launch splash
          when profile loading fails.
        */
        try {
          await sdk.actions.ready();
        } catch {
          // Host may not support the action outside a Mini App.
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
    if (view !== 'leaders') {
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
          setError(getErrorMessage(cause));
        }
      }
    }

    void loadLeaderboard();

    return () => {
      active = false;
    };
  }, [
    authenticatedFetch,
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
        await sdk.haptics.impactOccurred(
          'medium',
        );
      }
    } catch {
      // Haptics are an enhancement, not a requirement.
    }
  }

  async function getConnectedWallet(): Promise<
    `0x${string}`
  > {
    if (isConnected && address) {
      return address;
    }

    setHopState('connecting');

    const miniAppConnector =
      connectors[0];

    if (!miniAppConnector) {
      throw new Error(
        'Farcaster wallet connector is unavailable.',
      );
    }

    const connection =
      await connectAsync({
        connector: miniAppConnector,
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
    if (busy || user?.today_hopped) {
      return;
    }

    setError('');

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

      /*
        Approve exactly one cent of USDC.
        This is intentionally not an unlimited approval.
      */
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

      /*
        Submit the provider-generated swap transaction.
      */
      setHopState('swapping');

      const transactionHash =
        await sendTransactionAsync({
          to: quote.transaction.to,
          data: quote.transaction.data,

          value: BigInt(
            quote.transaction.value || '0',
          ),

          gas: quote.transaction.gas
            ? BigInt(
                quote.transaction.gas,
              )
            : undefined,
        });

      /*
        The server independently reads the confirmed Base receipt.
        The client does not decide how much TOBY was received.
      */
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
              txHash: transactionHash,
              walletAddress: wallet,
            }),
          },
        );

      if (!verificationResponse.ok) {
        throw new Error(
          await verificationResponse.text(),
        );
      }

      const completedHop =
        (await verificationResponse.json()) as HopReceipt;

      setReceipt(completedHop);

      setUser((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,

          today_hopped: true,

          total_hops:
            completedHop.totalHops,

          current_streak:
            completedHop.streak,

          longest_streak: Math.max(
            previous.longest_streak,
            completedHop.streak,
          ),

          big_pond_energy:
            previous.big_pond_energy + 1,

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
        };
      });

      try {
        await sdk.haptics.notificationOccurred(
          'success',
        );
      } catch {
        // Optional enhancement.
      }

      /*
        Prompt the user to add Toby Hop after successful use.
        Some hosts may not currently support this action.
      */
      try {
        const context =
          await sdk.context;

        if (!context.client.added) {
          await sdk.actions.addMiniApp();
        }
      } catch {
        // The completed hop remains valid.
      }
    } catch (cause) {
      setError(getErrorMessage(cause));

      try {
        await sdk.haptics.notificationOccurred(
          'error',
        );
      } catch {
        // Optional enhancement.
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
      setError(getErrorMessage(cause));
    }
  }

  function getHopStatus(): string {
    if (user?.today_hopped) {
      return 'Today’s hop is complete';
    }

    switch (hopState) {
      case 'connecting':
        return 'Connecting your pond wallet…';

      case 'quoting':
        return 'Finding today’s route…';

      case 'approving':
        return 'Approve one cent of USDC…';

      case 'swapping':
        return 'Toby is hopping…';

      case 'verifying':
        return 'Counting your hop…';

      default:
        return 'Tap Toby to hop';
    }
  }

  if (loading) {
    return (
      <main className="shell">
        <div className="empty">
          Opening the pond…
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">
            TOBY HOP
          </div>

          <div className="tagline">
            One hop. Every day.
          </div>
        </div>

        {isConnected && address && (
          <div className="wallet-pill">
            {address.slice(0, 5)}
            …
            {address.slice(-4)}
          </div>
        )}
      </header>

      {view !== 'leaders' && (
        <section className="profile">
          <img
            className="pfp"
            src={
              user?.pfp_url ||
              fallbackPfp
            }
            alt={`${displayName} profile`}
          />

          <div>
            <div className="profile-name">
              {displayName}
            </div>

            <div className="profile-title">
              {user?.current_title ||
                'First Hopper'}
            </div>
          </div>

          <div className="streak-pill">
            <div className="streak-number">
              {user?.current_streak ?? 0}
            </div>

            <div className="streak-label">
              day streak
            </div>
          </div>
        </section>
      )}

      {view === 'hop' && (
        <>
          <section className="pond-card">
            <div className="hop-copy">
              <h1>Ready to hop?</h1>

              <p>
                Exchange one small drop
                for $TOBY.
              </p>
            </div>

            <div className="moon" />

            <div className="pond-stars">
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="reed r1" />
            <div className="reed r2" />
            <div className="reed r3" />

            <div className="water" />
            <div className="ripple" />

            <div className="lily l1" />
            <div className="lily l2" />

            <button
              type="button"
              className="frog-button"
              disabled={
                busy ||
                Boolean(
                  user?.today_hopped,
                )
              }
              onClick={performHop}
              aria-label={
                user?.today_hopped
                  ? 'Today’s hop is complete'
                  : 'Tap Toby to exchange one cent of USDC for TOBY'
              }
            >
              <div
                className={`frog ${
                  busy ? 'hopping' : ''
                }`}
              >
                <div className="frog-body" />

                <div className="eye left" />
                <div className="eye right" />

                <div className="mouth" />

                <div className="cheek c1" />
                <div className="cheek c2" />
              </div>

              {!busy &&
                !user?.today_hopped && (
                  <div className="tap-ring" />
                )}
            </button>

            <div className="hop-instruction">
              <strong>
                {getHopStatus()}
              </strong>

              <span>
                {user?.today_hopped
                  ? '+1 Big Pond Energy collected'
                  : '$0.01 USDC → $TOBY'}
              </span>
            </div>
          </section>

          <section className="stat-grid">
            <div className="stat">
              <strong>
                {compactNumber(
                  user?.big_pond_energy ??
                    0,
                )}
              </strong>

              <span>
                Big Pond Energy
              </span>
            </div>

            <div className="stat">
              <strong>
                {compactNumber(
                  user?.total_hops ?? 0,
                )}
              </strong>

              <span>Hops</span>
            </div>

            <div className="stat">
              <strong>
                {formatAtomic(
                  user?.total_toby_atomic ??
                    '0',
                )}
              </strong>

              <span>$TOBY</span>
            </div>
          </section>
        </>
      )}

      {view === 'leaders' && (
        <section className="panel">
          <h1 className="panel-title">
            Pond leaders
          </h1>

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
                  ? '$TOBY'
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
                {leaderKind === 'streak'
                  ? row.current_streak
                  : leaderKind ===
                      'hops'
                    ? row.total_hops
                    : formatAtomic(
                        row.total_toby_atomic,
                      )}

                <div className="leader-sub">
                  {leaderKind === 'streak'
                    ? 'days'
                    : leaderKind ===
                        'hops'
                      ? 'hops'
                      : '$TOBY'}
                </div>
              </div>
            </div>
          ))}

          {!leaders.length && (
            <div className="empty">
              No verified hops yet.
            </div>
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
                {user?.current_streak ??
                  0}
              </strong>
              <span>Current streak</span>
            </div>

            <div className="stat">
              <strong>
                {user?.longest_streak ??
                  0}
              </strong>
              <span>Best streak</span>
            </div>

            <div className="stat">
              <strong>
                {user?.rank
                  ? `#${user.rank}`
                  : '—'}
              </strong>
              <span>Pond rank</span>
            </div>

            <div className="stat">
              <strong>
                {user?.total_hops ?? 0}
              </strong>
              <span>Total hops</span>
            </div>

            <div className="stat">
              <strong>
                {user?.big_pond_energy ??
                  0}
              </strong>
              <span>
                Big Pond Energy
              </span>
            </div>

            <div className="stat">
              <strong>
                {formatAtomic(
                  user?.total_toby_atomic ??
                    '0',
                )}
              </strong>
              <span>$TOBY</span>
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
            onClick={() => setError('')}
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
          onClick={() => setView('hop')}
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
          onClick={() => setView('me')}
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
              +1 BIG POND ENERGY
            </div>

            <div className="success-summary">
              {receipt.tobyDisplay}{' '}
              $TOBY
              <span>·</span>
              {receipt.streak}-day
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
