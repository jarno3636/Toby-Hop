'use client';

import {
  useId,
  useMemo,
  useState,
} from 'react';

export type PondForecast = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  moonPhase: string;
  goldenToby?: boolean;
};

export type PondConditionState = {
  rainbow: boolean;
  rain: boolean;
  snow: boolean;
  shootingStars: boolean;
  fireflies: boolean;
  petals: boolean;
  autumn: boolean;
  lotus: boolean;
  golden: boolean;
};

type PondConditionsPanelProps = {
  pond: PondForecast;
  conditions: PondConditionState;
  onTap?: () => void;
};

/*
  This is currently a presentation forecast.

  When Golden Toby has real configurable odds on the backend,
  pass the backend percentage into this component instead of
  calculating it here.
*/
function getGoldenForecast(
  pond: PondForecast,
  conditions: PondConditionState,
): {
  chance: number;
  label: string;
  message: string;
} {
  if (
    pond.goldenToby ||
    conditions.golden
  ) {
    return {
      chance: 100,
      label: 'Golden Toby active',
      message:
        'The pond is glowing. Golden Toby has appeared today.',
    };
  }

  let chance = 2;

  if (conditions.rainbow) {
    chance += 6;
  }

  if (conditions.shootingStars) {
    chance += 5;
  }

  if (conditions.fireflies) {
    chance += 3;
  }

  if (conditions.lotus) {
    chance += 2;
  }

  if (
    pond.moonPhase
      .toLowerCase()
      .includes('full')
  ) {
    chance += 4;
  }

  const boundedChance =
    Math.min(
      chance,
      20,
    );

  if (boundedChance >= 12) {
    return {
      chance:
        boundedChance,

      label:
        'Strong golden signal',

      message:
        'Something rare is stirring beneath the lily pads.',
    };
  }

  if (boundedChance >= 7) {
    return {
      chance:
        boundedChance,

      label:
        'Elevated golden signal',

      message:
        'The water carries a faint golden shimmer today.',
    };
  }

  return {
    chance:
      boundedChance,

    label:
      'Quiet golden signal',

    message:
      'The pond is calm, but rare visitors never announce themselves.',
  };
}

function formatMoonPhase(
  value: string,
): string {
  return value
    .split('-')
    .map(
      (word) =>
        word
          ? `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`
          : word,
    )
    .join(' ');
}

function buildConditionItems(
  pond: PondForecast,
  conditions: PondConditionState,
): Array<{
  icon: string;
  label: string;
}> {
  const items: Array<{
    icon: string;
    label: string;
  }> = [
    {
      icon: '◐',
      label:
        formatMoonPhase(
          pond.moonPhase,
        ),
    },
  ];

  if (conditions.rainbow) {
    items.push({
      icon: '🌈',
      label: 'Rainbow',
    });
  }

  if (conditions.rain) {
    items.push({
      icon: '🌧️',
      label: 'Rain',
    });
  }

  if (conditions.snow) {
    items.push({
      icon: '❄️',
      label: 'Snow',
    });
  }

  if (conditions.shootingStars) {
    items.push({
      icon: '☄️',
      label: 'Meteor shower',
    });
  }

  if (conditions.fireflies) {
    items.push({
      icon: '✨',
      label: 'Fireflies',
    });
  }

  if (conditions.petals) {
    items.push({
      icon: '🌸',
      label: 'Falling petals',
    });
  }

  if (conditions.autumn) {
    items.push({
      icon: '🍂',
      label: 'Autumn leaves',
    });
  }

  if (conditions.lotus) {
    items.push({
      icon: '🪷',
      label: 'Lotus bloom',
    });
  }

  if (conditions.golden) {
    items.push({
      icon: '👑',
      label: 'Golden Toby',
    });
  }

  return items;
}

export function PondConditionsPanel({
  pond,
  conditions,
  onTap,
}: PondConditionsPanelProps) {
  const [expanded, setExpanded] =
    useState(false);

  const detailsId =
    useId();

  const forecast =
    useMemo(
      () =>
        getGoldenForecast(
          pond,
          conditions,
        ),
      [
        conditions,
        pond,
      ],
    );

  const conditionItems =
    useMemo(
      () =>
        buildConditionItems(
          pond,
          conditions,
        ),
      [
        conditions,
        pond,
      ],
    );

  function togglePanel() {
    setExpanded(
      (current) =>
        !current,
    );

    onTap?.();
  }

  return (
    <section
      className={[
        'pond-forecast',

        expanded
          ? 'pond-forecast-expanded'
          : '',

        conditions.golden
          ? 'pond-forecast-golden'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Today’s pond forecast"
    >
      <button
        type="button"
        className="pond-forecast-trigger"
        aria-expanded={
          expanded
        }
        aria-controls={
          detailsId
        }
        onClick={
          togglePanel
        }
      >
        <span
          className="pond-forecast-icon"
          aria-hidden="true"
        >
          {pond.emoji}
        </span>

        <span className="pond-forecast-summary">
          <span className="pond-forecast-eyebrow">
            TODAY’S POND
          </span>

          <strong>
            {pond.name}
          </strong>

          <span className="pond-forecast-description">
            {pond.description}
          </span>
        </span>

        <span className="pond-forecast-signal">
          <span className="pond-forecast-signal-value">
            {forecast.chance}%
          </span>

          <span className="pond-forecast-signal-label">
            GOLDEN
          </span>
        </span>

        <span
          className="pond-forecast-chevron"
          aria-hidden="true"
        >
          {expanded
            ? '−'
            : '+'}
        </span>
      </button>

      <div
        id={detailsId}
        className="pond-forecast-details"
        hidden={
          !expanded
        }
      >
        <div className="pond-forecast-condition-grid">
          {conditionItems.map(
            (item) => (
              <div
                key={
                  `${item.icon}-${item.label}`
                }
                className="pond-forecast-condition"
              >
                <span
                  aria-hidden="true"
                >
                  {item.icon}
                </span>

                <strong>
                  {item.label}
                </strong>
              </div>
            ),
          )}
        </div>

        <div className="pond-golden-forecast">
          <div className="pond-golden-heading">
            <div>
              <span className="pond-forecast-eyebrow">
                GOLDEN TOBY FORECAST
              </span>

              <strong>
                {forecast.label}
              </strong>
            </div>

            <span className="pond-golden-percent">
              {forecast.chance}%
            </span>
          </div>

          <div
            className="pond-golden-meter"
            aria-label={`Golden Toby forecast ${forecast.chance}%`}
          >
            <span
              style={{
                width:
                  `${forecast.chance}%`,
              }}
            />
          </div>

          <p>
            {forecast.message}
          </p>
        </div>

        <div className="pond-forecast-message">
          <span
            aria-hidden="true"
          >
            🐸
          </span>

          <p>
            Conditions rotate daily. Open the forecast each morning to see what has changed around the pond.
          </p>
        </div>
      </div>
    </section>
  );
}
