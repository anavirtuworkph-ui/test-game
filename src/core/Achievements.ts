/** One-time awards, checked at the end of every loop (the tutorial never counts). */

export type AchievementId =
  | 'back-to-the-present'
  | 'lost-to-time'
  | 'need-popcorn'
  | 'quick-reflexes'
  | 'speedrunner'
  | 'hardcore-looper';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
}

/** Real-time limits for the speed achievements. */
export const QUICK_REFLEXES_MS = 3 * 60 * 1000;
export const SPEEDRUNNER_MS = 90 * 1000;
export const HARDCORE_LOOPS = 50;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'back-to-the-present', title: 'Back to The Present', description: 'Win for the first time' },
  { id: 'lost-to-time', title: 'Lost to Time', description: 'Lose for the first time' },
  { id: 'need-popcorn', title: 'I Need Popcorn for This!', description: 'Lose to the timer' },
  { id: 'quick-reflexes', title: 'Quick Reflexes', description: 'Win in 3:00 or less (real time)' },
  { id: 'speedrunner', title: 'Speedrunner', description: 'Win in 1:30 or less (real time)' },
  { id: 'hardcore-looper', title: 'Hardcore Looper', description: `Reach ${HARDCORE_LOOPS} loops` },
];

export function achievementDef(id: AchievementId): AchievementDef {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown achievement ${id}`);
  return def;
}

export type OutcomeCause = 'escaped' | 'timer' | 'arrested';

export interface LoopResult {
  victory: boolean;
  cause: OutcomeCause;
  /** Real time spent in the loop, in ms. */
  realMs: number;
  /** Loops played so far, including this one. */
  totalLoops: number;
}

/** Every achievement this loop qualifies for (already-unlocked ones included). */
export function qualifyingAchievements(r: LoopResult): AchievementId[] {
  const out: AchievementId[] = [];
  if (r.victory) {
    out.push('back-to-the-present');
    if (r.realMs <= QUICK_REFLEXES_MS) out.push('quick-reflexes');
    if (r.realMs <= SPEEDRUNNER_MS) out.push('speedrunner');
  } else {
    out.push('lost-to-time');
    if (r.cause === 'timer') out.push('need-popcorn');
  }
  if (r.totalLoops >= HARDCORE_LOOPS) out.push('hardcore-looper');
  return out;
}

export function formatRealMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
