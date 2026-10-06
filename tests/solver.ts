import { DIRS, DIR_LIST, samePoint, type Dir, type Point } from '../src/core/types';
import type { Entity } from '../src/ecs/EntityComponentSystem';
import { isPristine } from '../src/game/Inventory';
import type { Run } from '../src/game/Run';
import { stateId } from '../src/puzzles/PuzzleSystem';

const k = (p: Point) => `${p.x},${p.y}`;

/** BFS from the player to any goal tile; returns the move directions. */
export function pathTo(run: Run, goals: Point[]): Dir[] | null {
  const goalSet = new Set(goals.map(k));
  const start = run.playerPos;
  if (goalSet.has(k(start))) return [];
  const prev = new Map<string, { from: string; dir: Dir }>();
  const queue: Point[] = [start];
  const seen = new Set([k(start)]);
  while (queue.length) {
    const p = queue.shift()!;
    for (const d of DIR_LIST) {
      const n = { x: p.x + DIRS[d].x, y: p.y + DIRS[d].y };
      const nk = k(n);
      if (seen.has(nk) || run.isBlocked(n)) continue;
      seen.add(nk);
      prev.set(nk, { from: k(p), dir: d });
      if (goalSet.has(nk)) {
        const dirs: Dir[] = [];
        let cur = nk;
        while (cur !== k(start)) {
          const step = prev.get(cur)!;
          dirs.unshift(step.dir);
          cur = step.from;
        }
        return dirs;
      }
      queue.push(n);
    }
  }
  return null;
}

/** Walk next to `target` and face it. */
function approach(run: Run, target: Point[]): boolean {
  const spots: Point[] = [];
  for (const t of target) {
    for (const d of DIR_LIST) spots.push({ x: t.x + DIRS[d].x, y: t.y + DIRS[d].y });
  }
  const route = pathTo(run, spots.filter((s) => !target.some((t) => samePoint(t, s))));
  if (!route) return false;
  for (const d of route) run.move(d);
  for (const d of DIR_LIST) {
    const n = { x: run.playerPos.x + DIRS[d].x, y: run.playerPos.y + DIRS[d].y };
    if (target.some((t) => samePoint(t, n))) {
      run.move(d); // blocked tile: just turns to face it
      return true;
    }
  }
  return false;
}

/** Plays a run to completion with perfect knowledge. Guards should be removed first. */
export function solve(run: Run, maxRounds = 40): void {
  for (let round = 0; round < maxRounds && !run.outcome; round++) {
    // 1. Grab every reachable pickup (shards first so we can afford time shifts).
    const pickups = run.world
      .query('pickup', 'position')
      .sort((a, b) => Number(run.world.req(b, 'pickup').payload.type === 'charge') - Number(run.world.req(a, 'pickup').payload.type === 'charge'));
    for (const e of pickups) {
      if (!run.world.isAlive(e)) continue;
      const route = pathTo(run, [run.world.req(e, 'position')]);
      if (route) for (const d of route) run.move(d);
    }

    // 2. Talk to every reachable NPC and answer correctly.
    for (const e of run.world.query('npc', 'position')) {
      if (run.world.req(e, 'npc').solved) continue;
      if (!approach(run, [run.world.req(e, 'position')])) continue;
      run.interact();
      if (run.dialogue) {
        run.answer(run.dialogue.question.answer);
        run.handle({ type: 'confirm' });
      }
    }

    // 3. Solve time puzzles that block progress.
    for (const e of run.world.query('timeObject', 'position') as Entity[]) {
      const obj = run.world.req(e, 'timeObject');
      const id = stateId(obj.state);
      let dir: 'rewind' | 'forward' | null = null;
      if (obj.kind === 'bridge' && id !== 'intact') dir = 'rewind';
      if (obj.kind === 'gate' && id !== 'rusted') dir = 'forward';
      if (obj.kind === 'crate' && obj.contents?.type === 'item') dir = id === 'rotted' ? 'rewind' : 'rewind';
      if (!dir || run.charges <= 0) continue;
      if (!approach(run, obj.tiles)) continue;
      run.shiftTime(dir);
    }

    // 4. Repair cracked components and install everything at the DeLorean.
    if (run.inventory.components().length > 0 && approach(run, [run.world.req(run.delorean, 'position')])) {
      run.inventory.items.forEach((item, slot) => {
        if (!isPristine(item) && run.charges > 0 && run.puzzles.findAdjacent(run.playerPos, run.facing) === null) {
          run.inventory.select(slot);
          run.shiftTime('rewind');
        }
      });
      run.installComponents();
    }
  }
}

export function removeGuards(run: Run): void {
  for (const e of run.world.query('guard')) run.world.destroy(e);
}
