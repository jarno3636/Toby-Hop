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
  onProfileUpdated: (profile: { displayName: string; pfpUrl: string }) => void;
};

const AVATARS = [
  { id: 'gray', label: 'Gray', src: '/avatars/gray.webp' },
  { id: 'gray-glasses', label: 'Gray Glasses', src: '/avatars/gray-glasses.webp' },
  { id: 'gray-hat', label: 'Gray Hat', src: '/avatars/gray-hat.webp' },
  { id: 'blue', label: 'Blue', src: '/avatars/blue.webp' },
  { id: 'blue-glasses', label: 'Blue Glasses', src: '/avatars/blue-glasses.webp' },
  { id: 'blue-hat', label: 'Blue Hat', src: '/avatars/blue-hat.webp' },
  { id: 'gold', label: 'Gold', src: '/avatars/gold.webp' },
  { id: 'gold-glasses', label: 'Gold Glasses', src: '/avatars/gold-glasses.webp' },
  { id: 'gold-hat', label: 'Gold Hat', src: '/avatars/gold-hat.webp' },
] as const;


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
    Array.isArray(journal.recentSecrets) &&
    Array.isArray(journal.communityDiscoveries) &&
    typeof journal.notificationHealth === 'object' &&
    journal.notificationHealth !== null
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
  conditions: null,
  communityDiscoveries: [],
  notificationHealth: { enabled: false, credentialsStored: false, status: 'unknown' },
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
    onProfileUpdated,
  } = props;

  const [profileName, setProfileName] = useState(displayName === 'Pond Hopper' ? '' : displayName);
  const [selectedAvatar, setSelectedAvatar] = useState(profilePfp && profilePfp.startsWith('/avatars/') ? profilePfp : '/avatars/gray.webp');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

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


  useEffect(() => {
    setProfileName(displayName === 'Pond Hopper' ? '' : displayName);
    if (profilePfp?.startsWith('/avatars/')) setSelectedAvatar(profilePfp);
  }, [displayName, profilePfp]);

  async function saveProfile() {
    const name = profileName.trim().slice(0, 40);
    if (!name) {
      setProfileMessage('Choose a pond name first.');
      return;
    }

    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const response = await fetch('/api/me', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          username: user.username,
          displayName: name,
          pfpUrl: selectedAvatar,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to save your pond profile.');
      onProfileUpdated({ displayName: name, pfpUrl: selectedAvatar });
      setProfileMessage('Profile saved to the pond.');
    } catch (cause) {
      setProfileMessage(cause instanceof Error ? cause.message : 'Unable to save your pond profile.');
    } finally {
      setProfileSaving(false);
    }
  }

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


          {!isFarcasterMiniApp && (
            <section className="pond-profile-editor">
              <div className="journal-section-heading">
                <div>
                  <span>POND PROFILE</span>
                  <strong>Name + avatar for the leaderboard</strong>
                </div>
              </div>

              <label className="pond-profile-name">
                <span>Display name</span>
                <input
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  maxLength={40}
                  placeholder="Your pond name"
                  autoComplete="nickname"
                />
              </label>

              <div className="pond-avatar-grid" aria-label="Choose an avatar">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    className={selectedAvatar === avatar.src ? 'selected' : ''}
                    onClick={() => setSelectedAvatar(avatar.src)}
                    aria-pressed={selectedAvatar === avatar.src}
                    aria-label={`Use ${avatar.label} avatar`}
                  >
                    <img src={avatar.src} alt="" />
                    <span>{avatar.label}</span>
                  </button>
                ))}
              </div>

              <div className="pond-profile-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => void saveProfile()}
                  disabled={profileSaving || busy}
                >
                  {profileSaving ? 'SAVING' : 'SAVE PROFILE'}
                </button>
                {profileMessage && <span role="status">{profileMessage}</span>}
              </div>
            </section>
          )}

          {journal.conditions && (
            <section className="journal-conditions-card">
              <div className="journal-conditions-current">
                <span className="journal-condition-emoji" aria-hidden="true">{journal.conditions.emoji}</span>
                <div>
                  <span>TODAY AT THE POND</span>
                  <strong>{journal.conditions.name}</strong>
                  <p>{journal.conditions.description}</p>
                </div>
              </div>
              <div className="journal-condition-tags">
                <span>{journal.conditions.weather}</span>
                <span>{journal.conditions.season}</span>
                <span>{journal.conditions.mood}</span>
                <span>{journal.conditions.moonPhase.replaceAll('-', ' ')}</span>
              </div>
              <div className="journal-forecast-line">
                <span>{journal.conditions.forecastEmoji}</span>
                <div>
                  <small>TOMORROW</small>
                  <strong>{journal.conditions.forecastName}</strong>
                  <p>{journal.conditions.forecastHint}</p>
                </div>
              </div>
            </section>
          )}

          {journal.notificationHealth.status === 'missing_credentials' && (
            <div className="journal-notification-health warning">
              <strong>Notification access needs refreshing</strong>
              <p>Farcaster reports notifications as enabled, but Toby Hop does not have a current delivery token for this profile. Removing and re-adding the Mini App refreshes it.</p>
            </div>
          )}

          {journal.notificationHealth.status === 'disabled' && isFarcasterMiniApp && (
            <div className="journal-notification-health">
              <strong>Pond alerts are off</strong>
              <p>Rare weather and visitor alerts will not reach this profile until notifications are enabled in Farcaster.</p>
            </div>
          )}

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
              <span>Pond finds</span>
              <strong>
                {journal.uniqueDiscoveries}
                {journal.availableDiscoveries > 0
                  ? `/${journal.availableDiscoveries}`
                  : ''}
              </strong>
              <small>collectible discoveries</small>
            </article>

            <article>
              <span>Big Pond Energy</span>
              <strong>{user.big_pond_energy}</strong>
              <small>hops + stillness</small>
            </article>
          </section>

          <section className="journal-discovery-progress">
            <div className="journal-section-heading">
              <div>
                <span>POND FIND MAP</span>
                <strong>Collectible finds and one-time secrets are tracked separately</strong>
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
                <span>RECENT POND FINDS</span>
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
                  <strong>No pond finds yet</strong>
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

          {journal.communityDiscoveries.length > 0 && (
            <section className="journal-section">
              <div className="journal-section-heading">
                <div>
                  <span>COMMUNITY SIGHTINGS</span>
                  <strong>What travelers spotted today</strong>
                </div>
              </div>
              <div className="journal-community-list">
                {journal.communityDiscoveries.map((discovery) => (
                  <article key={discovery.key}>
                    <span aria-hidden="true">{findSymbol(discovery)}</span>
                    <div><strong>{discovery.name}</strong><small>Seen by {discovery.travelers} {discovery.travelers === 1 ? 'traveler' : 'travelers'}</small></div>
                  </article>
                ))}
              </div>
            </section>
          )}

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
