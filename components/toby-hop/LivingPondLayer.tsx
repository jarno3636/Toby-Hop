'use client';

import { useEffect, type CSSProperties } from 'react';
import { useLivingPond } from '@/hooks/useLivingPond';
import type { FrogCue, LivingPondContext } from '@/lib/living-pond';
import type { PondEncounter } from '@/lib/types';

type LivingPondLayerProps = LivingPondContext & {
  encounter?: PondEncounter | null;
  onFrogCueChange: (cue: FrogCue) => void;
};

function getEncounterFrogCue(
  encounter: PondEncounter,
): FrogCue {
  switch (encounter.category) {
    case 'golden':
      return 'double-blink';

    case 'secret':
      return 'look-up';

    case 'rare':
      return 'curious';

    case 'find':
      return 'smile';

    case 'ambient':
      return 'glance-right';
  }
}

function getEncounterSymbol(
  encounter: PondEncounter,
): string {
  const key = `${encounter.key} ${encounter.visualKey}`.toLowerCase();

  if (encounter.category === 'golden' || key.includes('golden')) {
    return '✦';
  }

  if (key.includes('lotus') || key.includes('seed')) {
    return '✿';
  }

  if (key.includes('key')) {
    return '⌑';
  }

  if (key.includes('bell')) {
    return '◌';
  }

  if (key.includes('boat')) {
    return '△';
  }

  if (key.includes('bottle') || key.includes('note')) {
    return '◇';
  }

  if (key.includes('shadow')) {
    return '◐';
  }

  if (key.includes('rainbow')) {
    return '⌒';
  }

  return encounter.category === 'secret' ? '✧' : '•';
}

export function LivingPondLayer({
  encounter = null,
  onFrogCueChange,
  ...context
}: LivingPondLayerProps) {
  const { activeEvent, frogCue } = useLivingPond(context);

  useEffect(() => {
    onFrogCueChange(
      encounter
        ? getEncounterFrogCue(encounter)
        : frogCue,
    );
  }, [encounter, frogCue, onFrogCueChange]);

  if (encounter) {
    return (
      <div
        className={[
          'living-pond-layer',
          'living-encounter-layer',
          `living-encounter-${encounter.category}`,
          `living-encounter-rarity-${encounter.rarity}`,
        ].join(' ')}
        aria-hidden="true"
        data-encounter-key={encounter.key}
        data-visual-key={encounter.visualKey}
      >
        <span className="living-encounter-wash" />
        <span className="living-encounter-ripple living-encounter-ripple-one" />
        <span className="living-encounter-ripple living-encounter-ripple-two" />
        <span className="living-encounter-beam" />

        <span className="living-encounter-symbol">
          {getEncounterSymbol(encounter)}
        </span>

        <span className="living-encounter-spark living-encounter-spark-one" />
        <span className="living-encounter-spark living-encounter-spark-two" />
        <span className="living-encounter-spark living-encounter-spark-three" />
        <span className="living-encounter-spark living-encounter-spark-four" />
        <span className="living-encounter-spark living-encounter-spark-five" />

        {encounter.category === 'golden' && (
          <>
            <span className="living-golden-ring living-golden-ring-one" />
            <span className="living-golden-ring living-golden-ring-two" />
            <span className="living-golden-crown">♛</span>
          </>
        )}

        {encounter.category === 'secret' && (
          <span className="living-secret-shadow" />
        )}
      </div>
    );
  }

  if (!activeEvent) {
    return null;
  }

  return (
    <div
      className={`living-pond-layer living-event-${activeEvent.id}`}
      aria-hidden="true"
      data-living-event={activeEvent.id}
    >
      {activeEvent.id === 'butterfly' && (
        <span className="living-butterfly">✦</span>
      )}

      {activeEvent.id === 'golden-butterfly' && (
        <span className="living-butterfly living-butterfly-golden">✦</span>
      )}

      {activeEvent.id === 'dragonfly' && (
        <span className="living-dragonfly">
          <i className="living-wing living-wing-left" />
          <i className="living-wing living-wing-right" />
          <i className="living-dragonfly-body" />
        </span>
      )}

      {activeEvent.id === 'fish-jump' && (
        <>
          <span className="living-fish">◖</span>
          <span className="living-fish-ripple" />
          <span className="living-splash living-splash-one" />
          <span className="living-splash living-splash-two" />
        </>
      )}

      {activeEvent.id === 'turtle' && (
        <span className="living-turtle">
          <i className="living-turtle-shell" />
          <i className="living-turtle-head" />
          <i className="living-turtle-foot foot-one" />
          <i className="living-turtle-foot foot-two" />
        </span>
      )}

      {activeEvent.id === 'drifting-leaf' && (
        <>
          <span className="living-leaf">◆</span>
          <span className="living-leaf-ripple" />
        </>
      )}

      {activeEvent.id === 'owl' && (
        <span className="living-owl">
          <i className="living-owl-wing wing-left" />
          <i className="living-owl-body" />
          <i className="living-owl-wing wing-right" />
        </span>
      )}

      {activeEvent.id === 'water-sparkle' && (
        <div className="living-sparkles">
          {Array.from({ length: 7 }, (_, index) => (
            <span
              key={index}
              style={{ '--spark-index': index } as CSSProperties}
            />
          ))}
        </div>
      )}

      {activeEvent.id === 'pond-breath' && (
        <span className="living-pond-breath" />
      )}

      {activeEvent.id === 'tiny-toby' && (
        <span className="living-tiny-toby">
          <i className="tiny-eye tiny-eye-left" />
          <i className="tiny-eye tiny-eye-right" />
        </span>
      )}

      {activeEvent.id === 'moon-gaze' && (
        <span className="living-moon-thread" />
      )}

      {activeEvent.id === 'lotus-whisper' && (
        <span className="living-lotus-whisper">✦</span>
      )}
    </div>
  );
}
