import type { LivingPondEventId } from '@/lib/living-pond';

export type PondMemoryKind = 'event' | 'chain';

export type PondEventMemoryItem = {
  key: string;
  kind: PondMemoryKind;
  seenCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type PondEventMemoryResponse = {
  items: PondEventMemoryItem[];
};

export function memoryPenalty(
  eventId: LivingPondEventId,
  memory: readonly PondEventMemoryItem[],
  now = Date.now(),
): number {
  const item = memory.find((candidate) => candidate.kind === 'event' && candidate.key === eventId);
  if (!item) return 1;

  const lastSeen = Date.parse(item.lastSeenAt);
  if (!Number.isFinite(lastSeen)) return 1;

  const ageDays = Math.max(0, (now - lastSeen) / 86_400_000);

  // Strongly discourage immediate repetition, then smoothly recover.
  if (ageDays < 0.25) return 0.08;
  if (ageDays < 1) return 0.18;
  if (ageDays < 3) return 0.42;
  if (ageDays < 7) return 0.72;
  return 1;
}

export function chainMemoryPenalty(
  chainId: string,
  memory: readonly PondEventMemoryItem[],
  now = Date.now(),
): number {
  const item = memory.find((candidate) => candidate.kind === 'chain' && candidate.key === chainId);
  if (!item) return 1;

  const lastSeen = Date.parse(item.lastSeenAt);
  if (!Number.isFinite(lastSeen)) return 1;

  const ageDays = Math.max(0, (now - lastSeen) / 86_400_000);
  if (ageDays < 1) return 0.04;
  if (ageDays < 3) return 0.2;
  if (ageDays < 7) return 0.55;
  return 1;
}
