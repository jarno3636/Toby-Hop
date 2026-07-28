'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { formatAtomic } from '@/lib/format';
import type {
  HopUser,
  PondFind,
  PondJournal,
  PondJournalEntry,
} from '@/lib/types';
import { FALLBACK_PFP } from '@/lib/toby-hop-ui';

type Props = {
  authenticated: boolean;
  isFarcasterMiniApp: boolean;
  farcasterAuthLoading: boolean;
  busy: boolean;
  displayName: string;
  user: HopUser;
  profilePfp?: string | null;
  rank: number | null;
  connectButtonText: string;
  onWalletSignIn: () => void;
  onFarcasterRetry: () => void;
  onWalletLogout: () => void;
};


function isPondJournal(value: unknown): value is PondJournal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const journal = value as Partial<PondJournal>;

  return (
    typeof journal.availableDiscoveries === 'number' &&
    typeof journal.uniqueDiscoveries === 'number' &&
    typeof journal.rareDiscoveries === 'number' &&
    typeof journal.secretDiscoveries === 'number' &&
    typeof journal.totalDiscoveryXp === 'number' &&
    Array.isArray(journal.recentFinds) &&
    Array.isArray(journal.recentEntries) &&
    Array.isArray(journal.recentSecrets)
  );
}

const EMPTY_JOURNAL: PondJournal = {
  availableDiscoveries: 0,
  uniqueDiscoveries: 0,
  rareDiscoveries: 0,
  secretDiscoveries: 0,
  totalDiscoveryXp: 0,
  recentFinds: [],
  recentEntries: [],
  recentSecrets: [],
};

function findSymbol(find: Pick<PondFind, 'visualKey' | 'rarity'>): string {
  const key = find.visualKey.toLowerCase();

  if (key.includes('gold')) return '✦';
  if (key.includes('lotus') || key.includes('seed')) return '✿';
  if (key.includes('boat')) return '◢';
  if (key.includes('key')) return '⌁';
  if (key.includes('bell')) return '◌';
  if (key.includes('mist') || key.includes('rainbow')) return '≈';
  if (find.rarity === 'secret') return '?';
  if (find.rarity === 'legendary') return '✧';

  return '•';
}

function formatJournalDate(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'Recently';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function FindCard({ find }: { find: PondFind }) {
  return (
    <article
      className={`journal-find-card journal-rarity-${find.rarity}`}
    >
      <div className="journal-find-symbol" aria-hidden="true">
        {findSymbol(find)}
      </div>

      <div className="journal-find-copy">
        <strong>{find.name}</strong>
        <span>{find.rarity}</span>
      </div>

      {find.timesFound > 1 && (
        <span className="journal-find-count">×{find.timesFound}</span>
      )}
    </article>
  );
}

function TimelineEntry({ entry }: { entry: PondJournalEntry }) {
  return (
    <article className="journal-timeline-entry">
      <div
        className={`journal-timeline-mark journal-rarity-${entry.rarity}`}
        aria-hidden="true"
      >
        {findSymbol(entry)}
      </div>

      <div className="journal-timeline-copy">
        <div className="journal-timeline-title">
          <strong>{entry.name}</strong>
          <time dateTime={entry.createdAt}>
            {formatJournalDate(entry.createdAt)}
          </time>
        </div>

        <p>{entry.description}</p>

        <div className="journal-timeline-meta">
          {entry.firstDiscovery && <span>First discovery</span>}
          {entry.rewardXp > 0 && <span>+{entry.rewardXp} XP</span>}
        </div>
      </div>
    </article>
  );
}

export function MePanel(props: Props) {
  const {
    authenticated,
    isFarcasterMiniApp,
    farcasterAuthLoading,
    busy,
    displayName,
    user,
    profilePfp,
    rank,
    connectButtonText,
    onWalletSignIn,
    onFarcasterRetry,
    onWalletLogout,
  } = props;

  const [journal, setJournal] =
    useState<PondJournal>(EMPTY_JOURNAL);
  const [journalLoading, setJournalLoading] =
    useState(false);
  const [journalError, setJournalError] =
    useState<string | null>(null);

  const hasHopped = user.total_hops > 0;

  useEffect(() => {
    if (!authenticated) {
      setJournal(EMPTY_JOURNAL);
      setJournalError(null);
      return;
    }

    let active = true;

    async function loadJournal() {
      setJournalLoading(true);
      setJournalError(null);

      try {
        const response = await fetch('/api/me', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            accept: 'application/json',
          },
        });

        const payload: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof payload === 'object' &&
            payload !== null &&
            'error' in payload &&
            typeof payload.error === 'string'
              ? payload.error
              : 'Unable to open your pond journal.';

          throw new Error(message);
        }

        if (!isPondJournal(payload)) {
          throw new Error('The pond journal returned an invalid response.');
        }

        if (active) {
          setJournal(payload);
        }
      } catch (cause) {
        if (active) {
          setJournalError(
            cause instanceof Error
              ? cause.message
              : 'Unable to open your pond journal.',
          );
        }
      } finally {
        if (active) {
          setJournalLoading(false);
        }
      }
    }

    void loadJournal();

    return () => {
      active = false;
    };
  }, [authenticated, user.total_hops]);

  const discoveryProgress = useMemo(() => {
    if (journal.availableDiscoveries <= 0) {
      return 0;
    }

    return Math.min(
      100,
      Math.round(
        (journal.uniqueDiscoveries /
          journal.availableDiscoveries) *
          100,
      ),
    );
  }, [
    journal.availableDiscoveries,
    journal.uniqueDiscoveries,
  ]);

  return (
    <section className="panel pond-journal-panel">
      <div className="panel-heading journal-heading">
        <div>
          <span className="panel-eyebrow">TRAVELER&apos;S JOURNAL</span>
          <h1 className="panel-title">Your life at the pond</h1>
        </div>

        {hasHopped && rank && (
          <span className="your-rank-pill">Pond rank #{rank}</span>
        )}
      </div>

      {!authenticated && !isFarcasterMiniApp && (
        <div className="empty-state-card journal-empty-card">
          <strong>Your journal needs a wallet</strong>
          <p>
            Connect and sign in to save hops, discoveries, and pond
            memories across devices.
          </p>
          <button
            type="button"
            className="primary"
            onClick={onWalletSignIn}
            disabled={busy}
          >
            {connectButtonText}
          </button>
        </div>
      )}

      {!authenticated && isFarcasterMiniApp && (
        <div className="empty-state-card journal-empty-card">
          <strong>Link your pond journal</strong>
          <p>
            Connect your active Farcaster profile to preserve every
            discovery and streak.
          </p>
          <button
            type="button"
            className="primary"
            onClick={onFarcasterRetry}
            disabled={farcasterAuthLoading || busy}
          >
            {farcasterAuthLoading
              ? 'LINKING PROFILE'
              : 'LINK FARCASTER'}
          </button>
        </div>
      )}

      {authenticated && (
        <>
          <section className="journal-cover">
            <div className="journal-cover-topline">
              <span>POND FIELD NOTES</span>
              <span>{user.total_hops} visits</span>
            </div>

            <div className="journal-identity">
              <img
                src={profilePfp || FALLBACK_PFP}
                alt={`${displayName} profile`}
              />

              <div>
                <strong>{displayName}</strong>
                <span>{user.current_title || 'Pond Hopper'}</span>
              </div>
            </div>

            <blockquote>
              “One hop at a time, the pond remembers.”
            </blockquote>
          </section>

          {!hasHopped && (
            <div className="empty-state-card journal-first-hop">
              <strong>Your first entry is waiting</strong>
              <p>
                Complete one verified hop to begin your journal and
                enter the pond rankings.
              </p>
            </div>
          )}

          <section className="journal-summary-grid">
            <article>
              <span>Current streak</span>
              <strong>{user.current_streak}</strong>
              <small>days returning</small>
            </article>

            <article>
              <span>Best streak</span>
              <strong>{user.longest_streak}</strong>
              <small>personal record</small>
            </article>

            <article>
              <span>Discoveries</span>
              <strong>
                {journal.uniqueDiscoveries}
                {journal.availableDiscoveries > 0
                  ? `/${journal.availableDiscoveries}`
                  : ''}
              </strong>
              <small>pond finds</small>
            </article>

            <article>
              <span>Big Pond Energy</span>
              <strong>{user.big_pond_energy}</strong>
              <small>earned by hopping</small>
            </article>
          </section>

          <section className="journal-discovery-progress">
            <div className="journal-section-heading">
              <div>
                <span>DISCOVERY MAP</span>
                <strong>The pond is still revealing itself</strong>
              </div>
              <b>{discoveryProgress}%</b>
            </div>

            <div
              className="journal-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={discoveryProgress}
            >
              <span style={{ width: `${discoveryProgress}%` }} />
            </div>

            <div className="journal-progress-meta">
              <span>{journal.rareDiscoveries} rare</span>
              <span>{journal.secretDiscoveries} secrets</span>
              <span>{journal.totalDiscoveryXp} discovery XP</span>
            </div>
          </section>

          <section className="journal-section">
            <div className="journal-section-heading">
              <div>
                <span>RECENT FINDS</span>
                <strong>Things the pond has shown you</strong>
              </div>
            </div>

            {journalLoading && (
              <div className="journal-loading">Reading your field notes…</div>
            )}

            {!journalLoading && journalError && (
              <div className="journal-inline-error">{journalError}</div>
            )}

            {!journalLoading &&
              !journalError &&
              journal.recentFinds.length === 0 && (
                <div className="journal-empty-find">
                  <span aria-hidden="true">≈</span>
                  <strong>No discoveries yet</strong>
                  <p>Your next verified hop may uncover something.</p>
                </div>
              )}

            {journal.recentFinds.length > 0 && (
              <div className="journal-find-grid">
                {journal.recentFinds.map((find) => (
                  <FindCard key={find.key} find={find} />
                ))}
              </div>
            )}
          </section>

          {journal.recentSecrets.length > 0 && (
            <section className="journal-section">
              <div className="journal-section-heading">
                <div>
                  <span>POND SECRETS</span>
                  <strong>Things revealed only once</strong>
                </div>
              </div>

              <div className="journal-secret-list">
                {journal.recentSecrets.slice(0, 6).map((secret) => (
                  <article className="journal-secret-card" key={secret.key}>
                    <span className="journal-secret-mark" aria-hidden="true">◈</span>
                    <div>
                      <strong>{secret.name}</strong>
                      <p>{secret.description}</p>
                      <small>{formatJournalDate(secret.unlockedAt)}</small>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="journal-section">
            <div className="journal-section-heading">
              <div>
                <span>POND HISTORY</span>
                <strong>Your most recent encounters</strong>
              </div>
            </div>

            {journal.recentEntries.length > 0 ? (
              <div className="journal-timeline">
                {journal.recentEntries.map((entry) => (
                  <TimelineEntry key={entry.id} entry={entry} />
                ))}
              </div>
            ) : (
              <div className="journal-empty-history">
                Your first encounter will be written here.
              </div>
            )}
          </section>

          <section className="journal-token-note">
            <span>TOBY gathered</span>
            <strong>{formatAtomic(user.total_toby_atomic)}</strong>
          </section>

          {!isFarcasterMiniApp && (
            <button
              type="button"
              className="secondary sign-out-button"
              onClick={onWalletLogout}
              disabled={busy}
            >
              SIGN OUT WALLET
            </button>
          )}
        </>
      )}
    </section>
  );
}
