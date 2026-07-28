'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chooseLivingPondEvent,
  type FrogCue,
  type LivingPondContext,
  type LivingPondEventDefinition,
  type LivingPondEventId,
} from '@/lib/living-pond';

const FIRST_EVENT_MIN_MS = 3_800;
const FIRST_EVENT_MAX_MS = 8_500;
const EVENT_GAP_MIN_MS = 16_000;
const EVENT_GAP_MAX_MS = 39_000;
const FROG_CUE_MIN_MS = 8_000;
const FROG_CUE_MAX_MS = 19_000;

function between(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function randomIdleCue(): FrogCue {
  const roll = Math.random();
  if (roll < 0.58) return 'blink';
  if (roll < 0.68) return 'double-blink';
  if (roll < 0.79) return 'glance-left';
  if (roll < 0.9) return 'glance-right';
  if (roll < 0.96) return 'look-up';
  return 'sleepy';
}

export function useLivingPond(context: LivingPondContext) {
  const [activeEvent, setActiveEvent] =
    useState<LivingPondEventDefinition | null>(null);
  const [frogCue, setFrogCue] = useState<FrogCue>('idle');
  const recentRef = useRef<LivingPondEventId[]>([]);
  const mountedRef = useRef(false);
  const previousTodayHoppedRef = useRef(context.todayHopped);

  const stableContext = useMemo(
    () => context,
    [
      context.themeId,
      context.moonPhase,
      context.raining,
      context.snowing,
      context.fireflies,
      context.autumn,
      context.lotus,
      context.golden,
      context.busy,
      context.todayHopped,
      context.streak,
      context.hour,
      context.season,
      context.weather,
      context.mood,
    ],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!previousTodayHoppedRef.current && stableContext.todayHopped) {
      setFrogCue('smile');
      const timer = window.setTimeout(() => setFrogCue('idle'), 3_200);
      previousTodayHoppedRef.current = true;
      return () => window.clearTimeout(timer);
    }
    previousTodayHoppedRef.current = stableContext.todayHopped;
  }, [stableContext.todayHopped]);

  useEffect(() => {
    if (stableContext.busy) {
      setActiveEvent(null);
      return;
    }

    let eventEndTimer: number | undefined;
    let nextEventTimer: number | undefined;
    let cancelled = false;

    const schedule = (first = false) => {
      const delay = first
        ? between(FIRST_EVENT_MIN_MS, FIRST_EVENT_MAX_MS)
        : between(EVENT_GAP_MIN_MS, EVENT_GAP_MAX_MS);

      nextEventTimer = window.setTimeout(() => {
        if (cancelled || !mountedRef.current) return;

        const event = chooseLivingPondEvent(stableContext, recentRef.current);
        if (!event) {
          schedule(false);
          return;
        }

        setActiveEvent(event);
        if (event.frogCue) setFrogCue(event.frogCue);

        recentRef.current = [event.id, ...recentRef.current].slice(0, 4);

        eventEndTimer = window.setTimeout(() => {
          if (cancelled || !mountedRef.current) return;
          setActiveEvent(null);
          setFrogCue('idle');
          schedule(false);
        }, event.durationMs);
      }, delay);
    };

    schedule(true);

    return () => {
      cancelled = true;
      if (nextEventTimer) window.clearTimeout(nextEventTimer);
      if (eventEndTimer) window.clearTimeout(eventEndTimer);
    };
  }, [stableContext]);

  useEffect(() => {
    if (stableContext.busy || activeEvent) return;

    let resetTimer: number | undefined;
    let cueTimer: number | undefined;
    let cancelled = false;

    const scheduleCue = () => {
      cueTimer = window.setTimeout(() => {
        if (cancelled || activeEvent) return;
        const cue = randomIdleCue();
        setFrogCue(cue);
        resetTimer = window.setTimeout(() => {
          if (cancelled) return;
          setFrogCue('idle');
          scheduleCue();
        }, cue === 'double-blink' ? 1_050 : 760);
      }, between(FROG_CUE_MIN_MS, FROG_CUE_MAX_MS));
    };

    scheduleCue();

    return () => {
      cancelled = true;
      if (cueTimer) window.clearTimeout(cueTimer);
      if (resetTimer) window.clearTimeout(resetTimer);
    };
  }, [activeEvent, stableContext.busy]);

  return {
    activeEvent,
    frogCue,
  };
}
