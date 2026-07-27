'use client';

import { useEffect, type CSSProperties } from 'react';
import { useLivingPond } from '@/hooks/useLivingPond';
import type { FrogCue, LivingPondContext } from '@/lib/living-pond';

type LivingPondLayerProps = LivingPondContext & {
  onFrogCueChange: (cue: FrogCue) => void;
};

export function LivingPondLayer({
  onFrogCueChange,
  ...context
}: LivingPondLayerProps) {
  const { activeEvent, frogCue } = useLivingPond(context);

  useEffect(() => {
    onFrogCueChange(frogCue);
  }, [frogCue, onFrogCueChange]);

  if (!activeEvent) return null;

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
            <span key={index} style={{ '--spark-index': index } as CSSProperties} />
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
