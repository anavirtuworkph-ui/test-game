import { describe, expect, it } from 'vitest';
import { CountdownTimer } from '../src/core/CountdownTimer';
import { GameState, computeReward } from '../src/core/GameState';
import { InputController } from '../src/core/InputController';
import { MetaProgress, type KeyValueStore } from '../src/core/MetaProgress';
import { BASE_MINUTES, DODGE_WINDOW_MS, REAL_MINUTES, Run, TIME_SCALE } from '../src/game/Run';
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

describe('CountdownTimer', () => {
  it('counts down in scaled game time and supports penalties', () => {
    const t = new CountdownTimer(7200, 20);
    t.update(1000);
    expect(t.remainingSeconds).toBe(7180);
    expect(t.formatReal()).toBe('5:59');
    t.penalize(10);
    expect(t.remainingSeconds).toBe(6580);
    t.penalize(-1000);
    expect(t.remainingSeconds).toBe(7200);
    expect(t.format()).toBe('2:00:00');
    t.update(10_000_000);
    expect(t.expired).toBe(true);
  });
});

describe('InputController', () => {
  it('maps keys to actions and repeats held movement', () => {
    const input = new InputController();
    input.handleKeyDown('KeyW');
    input.handleKeyDown('KeyR');
    input.handleKeyDown('Digit3');
    expect(input.drain()).toEqual([
      { type: 'move', dir: 'up' },
      { type: 'rewind' },
      { type: 'select', slot: 2 },
    ]);
    input.update(400);
    expect(input.drain()).toEqual([{ type: 'move', dir: 'up', repeat: true }]);
    input.handleKeyUp('KeyW');
    input.update(400);
    expect(input.drain()).toEqual([]);
  });
});

describe('Loop clock', () => {
  it('runs 2 in-game hours in 5 real minutes', () => {
    expect(BASE_MINUTES).toBe(120);
    expect(REAL_MINUTES).toBe(5);
    const run = new Run({ seed: 1, upgrades: {}, lockedBlueprints: [] });
    expect(run.timer.totalGameSeconds).toBe(2 * 3600);
    expect(run.timer.formatReal()).toBe('5:00');
    removeGuards(run);
    for (let t = 0; t < 4 * 60 * 1000 + 59_000; t += 1000) run.update(1000);
    expect(run.outcome).toBeNull();
    expect(Math.round(run.timer.remainingRealSeconds)).toBe(1);
    run.update(1000);
    expect(run.outcome?.victory).toBe(false);
    expect(TIME_SCALE).toBe(24);
  });
});

describe('Run', () => {
  it('ends in defeat when the countdown expires', () => {
    const run = new Run({ seed: 42, upgrades: {}, lockedBlueprints: [] });
    removeGuards(run);
    const realMs = (run.timer.totalGameSeconds / TIME_SCALE) * 1000;
    for (let t = 0; t < realMs + 1000; t += 100) run.update(100);
    expect(run.outcome?.victory).toBe(false);
  });

  it('ends in defeat after being caught too many times', () => {
    const run = new Run({ seed: 9, upgrades: {}, lockedBlueprints: [] });
    const guard = run.world.query('guard')[0];
    for (let i = 0; i < run.maxHearts; i++) {
      const g = run.world.req(guard, 'guard');
      g.stunnedMs = 0;
      run.invulnerableMs = 0;
      const gp = run.world.req(guard, 'position');
      const pp = run.world.req(run.player, 'position');
      pp.x = gp.x;
      pp.y = gp.y;
      run.update(1); // spotted: dodge prompt
      expect(run.dodge).not.toBeNull();
      run.update(DODGE_WINDOW_MS); // ...and the window closes
    }
    expect(run.stats.timesCaught).toBe(run.maxHearts);
    expect(run.outcome?.victory).toBe(false);
  });

  it('needs the time machine fully assembled to win', () => {
    const run = new Run({ seed: 5, upgrades: {}, lockedBlueprints: [] });
    removeGuards(run);
    run.installComponents();
    expect(run.outcome).toBeNull();
  });

  for (let seed = 100; seed < 160; seed++) {
    it(`seed ${seed}: a perfect player can rebuild the DeLorean and win`, () => {
      const run = new Run({ seed, upgrades: {}, lockedBlueprints: ['scanner'] });
      removeGuards(run);
      solve(run);
      expect(run.outcome?.victory).toBe(true);
      expect(run.installed).toHaveLength(4);
    });
  }
});

describe('GameState', () => {
  it('flows start -> playing -> victory -> start and banks meta progress', () => {
    const store = new MemoryStore();
    const gs = new GameState(new MetaProgress(store), () => 777);
    expect(gs.phase).toBe('start');
    gs.meta.data.tutorialDone = true;
    gs.handle({ type: 'confirm' });
    expect(gs.phase).toBe('playing');
    expect(gs.run!.tutorial).toBeNull();
    const run = gs.run!;
    removeGuards(run);
    solve(run);
    gs.update(16);
    expect(gs.phase).toBe('victory');
    expect(gs.summary!.chronotonsEarned).toBeGreaterThan(20);
    expect(gs.meta.data.wins).toBe(1);
    expect(gs.meta.data.blueprints.length).toBe(1);

    gs.handle({ type: 'confirm' }); // locked out briefly
    expect(gs.phase).toBe('victory');
    gs.update(1000);
    gs.handle({ type: 'confirm' });
    expect(gs.phase).toBe('start');

    // Progress survives a "reload".
    const reloaded = new MetaProgress(store);
    expect(reloaded.data.chronotons).toBe(gs.meta.data.chronotons);
    expect(reloaded.data.blueprints).toEqual(gs.meta.data.blueprints);
  });

  it('applies purchased upgrades to the next run', () => {
    const meta = new MetaProgress(new MemoryStore());
    meta.data.chronotons = 100;
    meta.unlockBlueprint('barong');
    const gs = new GameState(meta, () => 3);
    expect(gs.buy('capacitor')).toBe(true);
    expect(gs.buy('chronometer')).toBe(true);
    expect(gs.buy('barong')).toBe(true);
    expect(gs.buy('scanner')).toBe(false); // blueprint not found
    const run = gs.startRun();
    expect(run.charges).toBe(3);
    expect(run.maxHearts).toBe(4);
    expect(run.timer.totalGameSeconds).toBe(130 * 60);
    expect(run.scanner).toBe(false);
  });

  it('rewards partial progress on defeat', () => {
    const stats = { componentsCollected: 2, componentsInstalled: 1, puzzlesSolved: 1, timeShifts: 3, timesCaught: 1, dodges: 0, blueprints: [] };
    expect(computeReward(stats, false, 0)).toBe(15);
    expect(computeReward({ ...stats, componentsCollected: 0, componentsInstalled: 0, puzzlesSolved: 0 }, false, 0)).toBe(1);
  });
});
