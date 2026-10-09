import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  HARDCORE_LOOPS,
  QUICK_REFLEXES_MS,
  SPEEDRUNNER_MS,
  formatRealMs,
  qualifyingAchievements,
} from '../src/core/Achievements';
import { GameState } from '../src/core/GameState';
import { MetaProgress, type KeyValueStore } from '../src/core/MetaProgress';
import { removeGuards, solve } from './solver';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('Achievement rules', () => {
  it('has the six achievements with their titles', () => {
    expect(ACHIEVEMENTS.map((a) => a.title)).toEqual([
      'Back to The Present',
      'Lost to Time',
      'I Need Popcorn for This!',
      'Quick Reflexes',
      'Speedrunner',
      'Hardcore Looper',
    ]);
  });

  it('awards wins by speed', () => {
    const win = (realMs: number) => qualifyingAchievements({ victory: true, cause: 'escaped', realMs, totalLoops: 1 });
    expect(win(QUICK_REFLEXES_MS + 1)).toEqual(['back-to-the-present']);
    expect(win(QUICK_REFLEXES_MS)).toEqual(['back-to-the-present', 'quick-reflexes']);
    expect(win(SPEEDRUNNER_MS + 1)).toEqual(['back-to-the-present', 'quick-reflexes']);
    expect(win(SPEEDRUNNER_MS)).toEqual(['back-to-the-present', 'quick-reflexes', 'speedrunner']);
  });

  it('awards losses, and the popcorn only for the timer', () => {
    expect(qualifyingAchievements({ victory: false, cause: 'arrested', realMs: 1, totalLoops: 1 })).toEqual(['lost-to-time']);
    expect(qualifyingAchievements({ victory: false, cause: 'timer', realMs: 1, totalLoops: 1 })).toEqual([
      'lost-to-time',
      'need-popcorn',
    ]);
  });

  it('awards Hardcore Looper at 50 loops, win or lose', () => {
    const at = (n: number) => qualifyingAchievements({ victory: false, cause: 'arrested', realMs: 1, totalLoops: n });
    expect(at(HARDCORE_LOOPS - 1)).not.toContain('hardcore-looper');
    expect(at(HARDCORE_LOOPS)).toContain('hardcore-looper');
  });

  it('formats real times', () => {
    expect(formatRealMs(89_999)).toBe('1:29');
    expect(formatRealMs(180_000)).toBe('3:00');
  });
});

describe('Achievements in play', () => {
  it('unlocks once, persists, and reports only new ones', () => {
    const store = new MemoryStore();
    const gs = new GameState(new MetaProgress(store), () => 42);
    gs.meta.data.tutorialDone = true;

    // A quick win.
    gs.handle({ type: 'newRun' });
    removeGuards(gs.run!);
    solve(gs.run!);
    gs.run!.realMs = 80_000;
    gs.update(16);
    expect(gs.summary!.newAchievements).toEqual(['back-to-the-present', 'quick-reflexes', 'speedrunner']);
    expect(gs.meta.data.bestWinMs).toBe(80_000);

    // A second win earns nothing new.
    gs.update(1000);
    gs.handle({ type: 'cancel' });
    gs.handle({ type: 'newRun' });
    removeGuards(gs.run!);
    solve(gs.run!);
    gs.update(16);
    expect(gs.summary!.newAchievements).toEqual([]);

    // Running out the clock.
    gs.update(1000);
    gs.handle({ type: 'cancel' });
    gs.handle({ type: 'newRun' });
    removeGuards(gs.run!);
    for (let i = 0; i < 400; i++) gs.update(1000);
    expect(gs.phase).toBe('defeat');
    expect(gs.summary!.newAchievements).toEqual(['lost-to-time', 'need-popcorn']);

    expect(new MetaProgress(store).data.achievements).toHaveLength(5);
  });

  it('the tutorial never awards achievements', () => {
    const gs = new GameState(new MetaProgress(null), () => 1);
    gs.handle({ type: 'tutorial' });
    removeGuards(gs.run!);
    solve(gs.run!);
    gs.update(16);
    expect(gs.summary!.tutorial).toBe(true);
    expect(gs.meta.data.achievements).toEqual([]);
  });

  it('counts loops toward Hardcore Looper', () => {
    const gs = new GameState(new MetaProgress(null), () => 7);
    gs.meta.data.runs = HARDCORE_LOOPS - 1;
    gs.handle({ type: 'newRun' });
    removeGuards(gs.run!);
    for (let i = 0; i < 400; i++) gs.update(1000);
    expect(gs.summary!.newAchievements).toContain('hardcore-looper');
  });
});
