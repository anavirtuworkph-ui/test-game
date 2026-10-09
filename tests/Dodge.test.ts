import { describe, expect, it } from 'vitest';
import { DIRS, DIR_LIST, type Dir } from '../src/core/types';
import type { Entity } from '../src/ecs/EntityComponentSystem';
import { CAUGHT_PENALTY_MINUTES, DODGE_COOLDOWN_MS, DODGE_STUN_MS, DODGE_WINDOW_MS, Run } from '../src/game/Run';

/** A run with a single guard, and the player standing right in front of it. */
function spottedRun(): { run: Run; guard: Entity } {
  for (let seed = 1; seed < 200; seed++) {
    const run = new Run({ seed, upgrades: {}, lockedBlueprints: [] });
    const guards = run.world.query('guard');
    for (const g of guards.slice(1)) run.world.destroy(g);
    const guard = guards[0];
    const vision = run.guardVision(guard);
    if (vision.length === 0) continue;
    const pos = run.world.req(run.player, 'position');
    pos.x = vision[0].x;
    pos.y = vision[0].y;
    run.update(1);
    if (run.dodge) return { run, guard };
  }
  throw new Error('no suitable seed');
}

const opposite = (d: Dir): Dir => DIR_LIST.find((x) => DIRS[x].x === -DIRS[d].x && DIRS[x].y === -DIRS[d].y)!;

describe('Dodging the Guardia Civil', () => {
  it('freezes the world while the prompt is up', () => {
    const { run } = spottedRun();
    const before = run.timer.remainingSeconds;
    run.update(DODGE_WINDOW_MS / 2);
    expect(run.timer.remainingSeconds).toBe(before);
    expect(run.dodge).not.toBeNull();
  });

  it('pressing the prompted direction dives clear at no cost', () => {
    const { run, guard } = spottedRun();
    const start = { ...run.playerPos };
    const dir = run.dodge!.dir;
    const path = run.dodgePath(dir);
    const time = run.timer.remainingSeconds;
    run.handle({ type: 'move', dir });
    expect(run.dodge).toBeNull();
    expect(run.playerPos).toEqual(path[path.length - 1]);
    expect(run.playerPos).not.toEqual(start);
    expect(run.hearts).toBe(run.maxHearts);
    expect(run.timer.remainingSeconds).toBe(time);
    expect(run.stats.dodges).toBe(1);
    expect(run.world.req(guard, 'guard').stunnedMs).toBe(DODGE_STUN_MS);
    expect(run.dodgeCooldownMs).toBe(DODGE_COOLDOWN_MS);
  });

  it('ignores held-key repeats, and fails on the wrong direction', () => {
    const { run } = spottedRun();
    const dir = run.dodge!.dir;
    run.handle({ type: 'move', dir, repeat: true });
    expect(run.dodge).not.toBeNull();
    run.handle({ type: 'interact' });
    expect(run.dodge).not.toBeNull();
    run.handle({ type: 'move', dir: opposite(dir) });
    expect(run.dodge).toBeNull();
    expect(run.hearts).toBe(run.maxHearts - 1);
    expect(run.stats.timesCaught).toBe(1);
  });

  it('is caught when the window runs out', () => {
    const { run } = spottedRun();
    const time = run.timer.remainingSeconds;
    run.update(DODGE_WINDOW_MS - 1);
    expect(run.hearts).toBe(run.maxHearts);
    run.update(2);
    expect(run.hearts).toBe(run.maxHearts - 1);
    expect(run.timer.remainingSeconds).toBe(time - CAUGHT_PENALTY_MINUTES * 60);
    expect(run.playerPos).toEqual(run.level.playerStart);
  });

  it('a second sighting while winded is an instant capture', () => {
    const { run, guard } = spottedRun();
    run.handle({ type: 'move', dir: run.dodge!.dir });
    // Put them straight back in sight before the cooldown ends.
    run.world.req(guard, 'guard').stunnedMs = 0;
    run.invulnerableMs = 0;
    const g = run.world.req(guard, 'position');
    const pos = run.world.req(run.player, 'position');
    pos.x = g.x;
    pos.y = g.y;
    run.update(1);
    expect(run.dodge).toBeNull();
    expect(run.hearts).toBe(run.maxHearts - 1);
  });
});
