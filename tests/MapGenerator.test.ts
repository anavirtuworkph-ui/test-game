import { describe, expect, it } from 'vitest';
import { DIRS, DIR_LIST, type Point } from '../src/core/types';
import { NPC_PROFILES } from '../src/puzzles/HistoryData';
import { MAP_HEIGHT, MAP_WIDTH, generateLevel } from '../src/world/MapGenerator';
import { isPassableTile, isTimeLockedTile, type TileMap } from '../src/world/TileMap';

const opts = { npcProfiles: NPC_PROFILES.map((p) => p.id), withBlueprint: true };

function reachable(map: TileMap, start: Point, blocked: Set<string>, allowTimeLocked: boolean): Set<string> {
  const seen = new Set([`${start.x},${start.y}`]);
  const stack = [start];
  while (stack.length) {
    const p = stack.pop()!;
    for (const d of DIR_LIST) {
      const n = { x: p.x + DIRS[d].x, y: p.y + DIRS[d].y };
      const key = `${n.x},${n.y}`;
      const t = map.get(n.x, n.y);
      const ok = isPassableTile(t) || (allowTimeLocked && isTimeLockedTile(t));
      if (!seen.has(key) && map.inBounds(n.x, n.y) && ok && !blocked.has(key)) {
        seen.add(key);
        stack.push(n);
      }
    }
  }
  return seen;
}

describe('MapGenerator', () => {
  it('is deterministic for a given seed', () => {
    const a = generateLevel(1234, opts);
    const b = generateLevel(1234, opts);
    expect(a.map.tiles).toEqual(b.map.tiles);
    expect(a.components).toEqual(b.components);
    expect(a.guards).toEqual(b.guards);
  });

  it('produces different layouts for different seeds', () => {
    const a = generateLevel(1, opts);
    const b = generateLevel(2, opts);
    expect(a.map.tiles).not.toEqual(b.map.tiles);
  });

  for (let seed = 0; seed < 150; seed++) {
    it(`seed ${seed}: everything is reachable once time puzzles are solved`, () => {
      const lvl = generateLevel(seed, opts);
      expect(lvl.map.width).toBe(MAP_WIDTH);
      expect(lvl.map.height).toBe(MAP_HEIGHT);
      expect(lvl.components).toHaveLength(4);
      expect(new Set(lvl.components.map((c) => c.strategy)).size).toBe(4);
      expect(lvl.bridges).toHaveLength(2);
      expect(lvl.map.get(lvl.gate.x, lvl.gate.y)).toBe('gateLocked');
      expect(lvl.guards.length).toBeGreaterThan(0);

      const solids = new Set<string>([`${lvl.delorean.x},${lvl.delorean.y}`]);
      for (const n of lvl.npcs) solids.add(`${n.pos.x},${n.pos.y}`);
      for (const c of lvl.decoyCrates) solids.add(`${c.x},${c.y}`);
      for (const c of lvl.components) if (c.strategy === 'crate') solids.add(`${c.pos.x},${c.pos.y}`);

      const solved = reachable(lvl.map, lvl.playerStart, solids, true);
      const adjacentReachable = (p: Point) =>
        DIR_LIST.some((d) => solved.has(`${p.x + DIRS[d].x},${p.y + DIRS[d].y}`));
      for (const c of lvl.components) {
        if (c.strategy === 'crate' || c.strategy === 'npc') expect(adjacentReachable(c.pos)).toBe(true);
        else expect(solved.has(`${c.pos.x},${c.pos.y}`)).toBe(true);
      }
      for (const s of lvl.shards) expect(solved.has(`${s.x},${s.y}`)).toBe(true);

      // Without time manipulation the east bank (and the compound) is cut off.
      const now = reachable(lvl.map, lvl.playerStart, solids, false);
      for (const c of lvl.components.filter((x) => x.strategy !== 'npc' && x.strategy !== 'crate')) {
        expect(now.has(`${c.pos.x},${c.pos.y}`)).toBe(false);
      }
      // The whole arrival bank is explorable before any time puzzle is solved.
      for (const key of solved) {
        const [x, y] = key.split(',').map(Number);
        if (x < lvl.riverX[y]) expect(now.has(key), `west tile ${key} cut off`).toBe(true);
      }
      // A shard is always available before crossing the river.
      expect(lvl.shards.some((s) => now.has(`${s.x},${s.y}`)), JSON.stringify({ shards: lvl.shards, start: lvl.playerStart, size: now.size })).toBe(true);
    });
  }
});
