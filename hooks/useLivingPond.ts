'use client';

import { sdk } from '@farcaster/miniapp-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseDailyWonder, type PondWonder } from '@/lib/pond/wonder';
import {
  chooseLivingPondChain,
  chooseLivingPondEvent,
  LIVING_POND_EVENTS,
  type FrogCue,
  type LivingPondContext,
  type LivingPondEventChain,
  type LivingPondEventDefinition,
  type LivingPondEventId,
} from '@/lib/living-pond';
import {
  chainMemoryPenalty,
  memoryPenalty,
  type PondEventMemoryItem,
  type PondEventMemoryResponse,
  type PondMemoryKind,
} from '@/lib/pond/event-memory';

const FIRST_EVENT_MIN_MS = 3_800;
const FIRST_EVENT_MAX_MS = 8_500;
const EVENT_GAP_MIN_MS = 16_000;
const EVENT_GAP_MAX_MS = 39_000;
const CHAIN_CHANCE = 0.14;
const CHAIN_STEP_GAP_MS = 650;
const FROG_CUE_MIN_MS = 8_000;
const FROG_CUE_MAX_MS = 19_000;
const WONDER_MIN_MS = 11_000;
const WONDER_MAX_MS = 24_000;

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

function definitionFor(id: LivingPondEventId): LivingPondEventDefinition | null {
  return LIVING_POND_EVENTS.find((event) => event.id === id) ?? null;
}

export function useLivingPond(context: LivingPondContext) {
  const [activeEvent, setActiveEvent] = useState<LivingPondEventDefinition | null>(null);
  const [activeChain, setActiveChain] = useState<LivingPondEventChain | null>(null);
  const [frogCue, setFrogCue] = useState<FrogCue>('idle');
  const [activeWonder, setActiveWonder] = useState<PondWonder | null>(null);
  const [memory, setMemory] = useState<PondEventMemoryItem[]>([]);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const memoryRef = useRef<PondEventMemoryItem[]>([]);
  const recentRef = useRef<LivingPondEventId[]>([]);
  const mountedRef = useRef(false);
  const previousTodayHoppedRef = useRef(context.todayHopped);
  const wonderShownRef = useRef(false);
  const dailyMemoryRecordedRef = useRef<string | null>(null);

  const stableContext = useMemo(() => context, [
    context.themeId, context.moonPhase, context.raining, context.snowing,
    context.fireflies, context.autumn, context.lotus, context.golden,
    context.busy, context.todayHopped, context.streak, context.hour,
    context.season, context.weather, context.mood, context.macroEventKey,
  ]);

  const memoryContext = useMemo(() => ({
    dayKey: new Date().toISOString().slice(0, 10),
    weather: stableContext.weather,
    season: stableContext.season,
    mood: stableContext.mood,
    themeId: stableContext.themeId,
    moonPhase: stableContext.moonPhase,
    macroEventKey: stableContext.macroEventKey ?? null,
  }), [stableContext]);

  const recordMemory = useCallback(async (key: string, kind: PondMemoryKind) => {
    try {
      const response = await sdk.quickAuth.fetch('/api/event-memory', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ key, kind, context: memoryContext }),
      });
      if (!response.ok) return;
      const now = new Date().toISOString();
      setMemory((current) => {
        const existing = current.find((item) => item.key === key && item.kind === kind);
        const next = !existing
          ? [{ key, kind, seenCount: 1, firstSeenAt: now, lastSeenAt: now }, ...current]
          : current.map((item) => item === existing
              ? { ...item, seenCount: item.seenCount + 1, lastSeenAt: now }
              : item);
        memoryRef.current = next;
        return next;
      });
    } catch {
      // Ambient memory should never interrupt the pond experience.
    }
  }, [memoryContext]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const response = await sdk.quickAuth.fetch('/api/event-memory', {
          method: 'GET', cache: 'no-store', headers: { accept: 'application/json' },
        });
        if (!response.ok) return;
        const body = await response.json() as PondEventMemoryResponse;
        if (!cancelled && Array.isArray(body.items)) {
          memoryRef.current = body.items;
          setMemory(body.items);
        }
      } catch {
        // The app remains fully usable outside authenticated Mini App contexts.
      } finally {
        if (!cancelled) setMemoryLoaded(true);
      }
    })();
    return () => { cancelled = true; mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!memoryLoaded || dailyMemoryRecordedRef.current === memoryContext.dayKey) return;
    dailyMemoryRecordedRef.current = memoryContext.dayKey;
    void recordMemory(`daily:${memoryContext.dayKey}`, 'day');
  }, [memoryContext.dayKey, memoryLoaded, recordMemory]);

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
    if (stableContext.busy || !memoryLoaded) {
      setActiveEvent(null);
      setActiveChain(null);
      return;
    }

    const timers: number[] = [];
    let cancelled = false;

    const later = (fn: () => void, delay: number) => {
      const timer = window.setTimeout(fn, delay);
      timers.push(timer);
    };

    const schedule = (first = false) => {
      const delay = first ? between(FIRST_EVENT_MIN_MS, FIRST_EVENT_MAX_MS) : between(EVENT_GAP_MIN_MS, EVENT_GAP_MAX_MS);
      later(() => {
        if (cancelled || !mountedRef.current) return;

        const chain = Math.random() < CHAIN_CHANCE
          ? chooseLivingPondChain(stableContext, (id) => chainMemoryPenalty(id, memoryRef.current))
          : null;

        if (chain) {
          const validSteps = chain.steps
            .map(definitionFor)
            .filter((event): event is LivingPondEventDefinition => Boolean(event?.allowed(stableContext)));

          if (validSteps.length >= 2) {
            setActiveChain(chain);
            void recordMemory(chain.id, 'chain');
            let offset = 0;

            validSteps.forEach((event) => {
              later(() => {
                if (cancelled) return;
                setActiveEvent(event);
                if (event.frogCue) setFrogCue(event.frogCue);
                recentRef.current = [event.id, ...recentRef.current].slice(0, 8);
                void recordMemory(event.id, 'event');
              }, offset);
              offset += event.durationMs + CHAIN_STEP_GAP_MS;
            });

            later(() => {
              if (cancelled) return;
              setActiveEvent(null);
              setActiveChain(null);
              setFrogCue('idle');
              schedule(false);
            }, offset);
            return;
          }
        }

        const event = chooseLivingPondEvent(
          stableContext,
          recentRef.current,
          (id) => memoryPenalty(id, memoryRef.current),
        );
        if (!event) { schedule(false); return; }

        setActiveEvent(event);
        if (event.frogCue) setFrogCue(event.frogCue);
        recentRef.current = [event.id, ...recentRef.current].slice(0, 8);
        void recordMemory(event.id, 'event');

        later(() => {
          if (cancelled || !mountedRef.current) return;
          setActiveEvent(null);
          setFrogCue('idle');
          schedule(false);
        }, event.durationMs);
      }, delay);
    };

    schedule(true);
    return () => { cancelled = true; timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [memoryLoaded, recordMemory, stableContext]);

  useEffect(() => {
    if (stableContext.busy || activeWonder || wonderShownRef.current) return;

    const wonder = chooseDailyWonder(stableContext, memoryContext.dayKey);
    if (!wonder) return;

    let clearTimer: number | undefined;
    const showTimer = window.setTimeout(() => {
      wonderShownRef.current = true;
      setActiveWonder(wonder);
      clearTimer = window.setTimeout(() => setActiveWonder(null), wonder.durationMs);
    }, between(WONDER_MIN_MS, WONDER_MAX_MS));

    return () => {
      window.clearTimeout(showTimer);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, [activeWonder, memoryContext.dayKey, stableContext]);

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

  return { activeEvent, activeChain, activeWonder, frogCue, memoryReady: memoryLoaded, memoryCount: memory.length };
}
