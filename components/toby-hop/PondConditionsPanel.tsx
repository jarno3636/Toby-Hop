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

  /*
    The global daily Golden Toby chance.

    The default of 0.1 matches odds of 1 in 1,000 UTC days.
    Pass a different value later if these odds become configurable.
  */
  goldenTobyChancePercent?: number;
};

type ConditionItem = {
  icon: string;
  label: string;
};

type GoldenWatch = {
  active: boolean;
  chance: number;
  chanceLabel: string;
  activityLabel: string;
  activityScore: number;
  message: string;
};

const DEFAULT_GOLDEN_TOBY_CHANCE_PERCENT = 0.1;
const MAX_ACTIVITY_SCORE = 5;

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    Math.max(value, minimum),
    maximum,
  );
}

function formatPercentage(
  value: number,
): string {
  if (value >= 100) {
    return '100%';
  }

  if (value >= 10) {
    return `${value.toFixed(0)}%`;
  }

  if (value >= 1) {
    return `${value.toFixed(1)}%`;
  }

  return `${value.toFixed(2)}%`;
}

function formatMoonPhase(
  value: string,
): string {
  return value
    .split('-')
    .map((word) =>
      word
        ? `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`
        : word,
    )
    .join(' ');
}

function getMoonIcon(
  moonPhase: string,
): string {
  switch (
    moonPhase
      .trim()
      .toLowerCase()
  ) {
    case 'new':
      return '🌑';

    case 'waxing-crescent':
      return '🌒';

    case 'first-quarter':
      return '🌓';

    case 'waxing-gibbous':
      return '🌔';

    case 'full':
      return '🌕';

    case 'waning-gibbous':
      return '🌖';

    case 'last-quarter':
      return '🌗';

    case 'waning-crescent':
      return '🌘';

    default:
      return '◐';
  }
}

function getGoldenWatch(
  pond: PondForecast,
  conditions: PondConditionState,
  baseChancePercent: number,
): GoldenWatch {
  const active =
    Boolean(pond.goldenToby) ||
    conditions.golden;

  if (active) {
    return {
      active: true,
      chance: 100,
      chanceLabel: '100%',
      activityLabel: 'Golden Toby spotted',
      activityScore: MAX_ACTIVITY_SCORE,
      message:
        'The pond is glowing. A Golden Toby has appeared somewhere in the water today.',
    };
  }

  let activityScore = 1;

  if (conditions.rainbow) {
    activityScore += 1;
  }

  if (conditions.shootingStars) {
    activityScore += 1;
  }

  if (conditions.fireflies) {
    activityScore += 1;
  }

  if (conditions.lotus) {
    activityScore += 1;
  }

  if (
    pond.moonPhase
      .trim()
      .toLowerCase() === 'full'
  ) {
    activityScore += 1;
  }

  const boundedActivityScore =
    clamp(
      activityScore,
      1,
      MAX_ACTIVITY_SCORE,
    );

  if (boundedActivityScore >= 5) {
    return {
      active: false,
      chance: baseChancePercent,
      chanceLabel:
        formatPercentage(
          baseChancePercent,
        ),
      activityLabel:
        'Exceptional activity',
      activityScore:
        boundedActivityScore,
      message:
        'Rare conditions are gathering around the pond, but the Golden Toby odds remain unchanged.',
    };
  }

  if (boundedActivityScore >= 4) {
    return {
      active: false,
      chance: baseChancePercent,
      chanceLabel:
        formatPercentage(
          baseChancePercent,
        ),
      activityLabel:
        'Strong activity',
      activityScore:
        boundedActivityScore,
      message:
        'The reeds are unusually lively today. Watch the lily pads closely.',
    };
  }

  if (boundedActivityScore >= 3) {
    return {
      active: false,
      chance: baseChancePercent,
      chanceLabel:
        formatPercentage(
          baseChancePercent,
        ),
      activityLabel:
        'Moderate activity',
      activityScore:
        boundedActivityScore,
      message:
        'The water carries a faint shimmer, though rare visitors never announce themselves.',
    };
  }

  if (boundedActivityScore >= 2) {
    return {
      active: false,
      chance: baseChancePercent,
      chanceLabel:
        formatPercentage(
          baseChancePercent,
        ),
      activityLabel:
        'Gentle activity',
      activityScore:
        boundedActivityScore,
      message:
        'Small signs of life are moving through the reeds and beneath the water.',
    };
  }

  return {
    active: false,
    chance: baseChancePercent,
    chanceLabel:
      formatPercentage(
        baseChancePercent,
      ),
    activityLabel:
      'Quiet activity',
    activityScore:
      boundedActivityScore,
    message:
      'The pond is peaceful today. Rare visitors may still be hiding below the surface.',
  };
}

function buildConditionItems(
  pond: PondForecast,
  conditions: PondConditionState,
): ConditionItem[] {
  const items: ConditionItem[] = [
    {
      icon:
        getMoonIcon(
          pond.moonPhase,
        ),
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
      label: 'Starfall',
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

  if (
    conditions.golden ||
    pond.goldenToby
  ) {
    items.push({
      icon: '👑',
      label: 'Golden Toby',
    });
  }

  return items;
}

function buildPondReading(
  conditions: PondConditionState,
): {
  water: string;
  sky: string;
  nature: string;
} {
  let water = 'Calm';

  if (conditions.rain) {
    water = 'Rippled';
  }

  if (conditions.snow) {
    water = 'Cold and still';
  }

  if (conditions.lotus) {
    water = 'Blooming';
  }

  let sky = 'Clear';

  if (conditions.rain) {
    sky = 'Overcast';
  }

  if (conditions.snow) {
    sky = 'Frosted';
  }

  if (conditions.rainbow) {
    sky = 'Prismatic';
  }

  if (conditions.shootingStars) {
    sky = 'Star-filled';
  }

  let nature = 'Resting';

  if (
    conditions.fireflies ||
    conditions.petals ||
    conditions.autumn
  ) {
    nature = 'Active';
  }

  if (
    conditions.fireflies &&
    conditions.lotus
  ) {
    nature = 'Flourishing';
  }

  if (
    conditions.golden
  ) {
    nature = 'Radiant';
  }

  return {
    water,
    sky,
    nature,
  };
}

function ActivityStars({
  score,
}: {
  score: number;
}) {
  return (
    <span
      className="pond-golden-stars"
      aria-label={`${score} out of ${MAX_ACTIVITY_SCORE} activity`}
    >
      {Array.from(
        {
          length:
            MAX_ACTIVITY_SCORE,
        },
        (_, index) => {
          const active =
            index < score;

          return (
            <span
              key={index}
              className={
                active
                  ? 'pond-golden-star pond-golden-star-active'
                  : 'pond-golden-star'
              }
              aria-hidden="true"
            >
              {active
                ? '★'
                : '☆'}
            </span>
          );
        },
      )}
    </span>
  );
}

export function PondConditionsPanel({
  pond,
  conditions,
  onTap,
  goldenTobyChancePercent =
    DEFAULT_GOLDEN_TOBY_CHANCE_PERCENT,
}: PondConditionsPanelProps) {
  const [expanded, setExpanded] =
    useState(false);

  const detailsId =
    useId();

  const normalizedChance =
    useMemo(
      () =>
        clamp(
          goldenTobyChancePercent,
          0,
          100,
        ),
      [
        goldenTobyChancePercent,
      ],
    );

  const goldenWatch =
    useMemo(
      () =>
        getGoldenWatch(
          pond,
          conditions,
          normalizedChance,
        ),
      [
        conditions,
        normalizedChance,
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

  const pondReading =
    useMemo(
      () =>
        buildPondReading(
          conditions,
        ),
      [
        conditions,
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

        goldenWatch.active
          ? 'pond-forecast-golden'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Today’s pond conditions"
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
          {goldenWatch.active
            ? '👑'
            : pond.emoji}
        </span>

        <span className="pond-forecast-summary">
          <span className="pond-forecast-eyebrow">
            TODAY’S POND
          </span>

          <strong>
            {goldenWatch.active
              ? 'Golden Toby Day'
              : pond.name}
          </strong>

          <span className="pond-forecast-description">
            {goldenWatch.active
              ? 'A rare golden visitor has surfaced.'
              : pond.description}
          </span>
        </span>

        <span className="pond-forecast-signal">
          <span className="pond-forecast-signal-value">
            {goldenWatch.chanceLabel}
          </span>

          <span className="pond-forecast-signal-label">
            {goldenWatch.active
              ? 'ACTIVE'
              : 'GOLDEN'}
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
        <div className="pond-almanac-heading">
          <div>
            <span className="pond-forecast-eyebrow">
              POND ALMANAC
            </span>

            <strong>
              Daily field report
            </strong>
          </div>

          <span
            className="pond-almanac-badge"
            aria-hidden="true"
          >
            🐸
          </span>
        </div>

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

        <div className="pond-reading-grid">
          <div className="pond-reading-card">
            <span className="pond-forecast-eyebrow">
              WATER
            </span>

            <strong>
              {pondReading.water}
            </strong>
          </div>

          <div className="pond-reading-card">
            <span className="pond-forecast-eyebrow">
              SKY
            </span>

            <strong>
              {pondReading.sky}
            </strong>
          </div>

          <div className="pond-reading-card">
            <span className="pond-forecast-eyebrow">
              NATURE
            </span>

            <strong>
              {pondReading.nature}
            </strong>
          </div>
        </div>

        <div
          className={[
            'pond-golden-forecast',

            goldenWatch.active
              ? 'pond-golden-forecast-active'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="pond-golden-heading">
            <div>
              <span className="pond-forecast-eyebrow">
                RARE CREATURE WATCH
              </span>

              <strong>
                {goldenWatch.activityLabel}
              </strong>
            </div>

            <span className="pond-golden-percent">
              {goldenWatch.chanceLabel}
            </span>
          </div>

          <div className="pond-golden-activity-row">
            <span>
              Pond activity
            </span>

            <ActivityStars
              score={
                goldenWatch.activityScore
              }
            />
          </div>

          <div
            className="pond-golden-meter"
            role="meter"
            aria-label={`Golden Toby daily chance ${goldenWatch.chanceLabel}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              goldenWatch.chance
            }
          >
            <span
              style={{
                width:
                  goldenWatch.active
                    ? '100%'
                    : `${Math.max(
                        goldenWatch.chance,
                        1,
                      )}%`,
              }}
            />
          </div>

          <p>
            {goldenWatch.message}
          </p>

          {!goldenWatch.active ? (
            <small className="pond-golden-disclaimer">
              The activity reading reflects today’s pond conditions. The actual global Golden Toby chance remains{' '}
              <strong>
                {goldenWatch.chanceLabel}
              </strong>
              .
            </small>
          ) : null}
        </div>

        <div className="pond-forecast-message">
          <span
            aria-hidden="true"
          >
            📖
          </span>

          <p>
            Conditions rotate once per UTC day. Return each morning to inspect the pond, record unusual activity, and watch for rare visitors.
          </p>
        </div>
      </div>
    </section>
  );
}
