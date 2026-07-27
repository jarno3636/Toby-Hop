'use client';

import Link from 'next/link';

import {
  FALLBACK_PFP,
} from '@/lib/toby-hop-ui';

export type TobyHopView =
  | 'hop'
  | 'leaders'
  | 'me';

const ADMIN_FID =
  1121193;

type BottomNavProps = {
  view: TobyHopView;
  pfpUrl?:
    string | null;
  fid?:
    number | null;
  onChange: (
    view: TobyHopView,
  ) => void;
};

export function BottomNav({
  view,
  pfpUrl,
  fid,
  onChange,
}: BottomNavProps) {
  const isAdmin =
    Number(fid) ===
    ADMIN_FID;

  return (
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
          onChange('hop')
        }
      >
        <span aria-hidden="true">
          🐸
        </span>

        <span>
          Hop
        </span>
      </button>

      <button
        type="button"
        className={
          view === 'leaders'
            ? 'active'
            : ''
        }
        onClick={() =>
          onChange('leaders')
        }
      >
        <span aria-hidden="true">
          🏆
        </span>

        <span>
          Leaders
        </span>
      </button>

      <button
        type="button"
        className={
          view === 'me'
            ? 'active'
            : ''
        }
        onClick={() =>
          onChange('me')
        }
      >
        <img
          src={
            pfpUrl ||
            FALLBACK_PFP
          }
          alt=""
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius:
              999,
            objectFit:
              'cover',
            flex:
              '0 0 auto',
          }}
        />

        <span>
          Me
        </span>
      </button>

      {isAdmin ? (
        <Link
          href="/admin"
          className="admin-nav-link"
          aria-label="Open Toby Hop admin"
        >
          <span aria-hidden="true">
            ⚙️
          </span>

          <span>
            Admin
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
