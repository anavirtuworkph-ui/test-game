import type { Point } from '../core/types';
import { MAP_HEIGHT, MAP_WIDTH, type GeneratedLevel, type Rect } from './MapGenerator';
import { TileMap } from './TileMap';

/**
 * Hand-built tutorial map: Fort Santiago, Manila, the night of 29 December 1896,
 * the eve of José Rizal's execution. West to east: the crash site by the cell
 * block, the moat with a collapsed bridge, the padlocked chapel storeroom, then
 * a courtyard walked by a sentry.
 */

/** Where the player is returned if the tutorial patrol spots them. */
export const TUTORIAL_CHECKPOINT: Point = { x: 21, y: 11 };

function walledRect(map: TileMap, r: Rect): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
      map.set(x, y, edge ? 'wall' : 'floor');
    }
  }
}

function path(map: TileMap, a: Point, b: Point): void {
  let { x, y } = a;
  const paint = () => {
    if (map.get(x, y) === 'grass') map.set(x, y, 'path');
  };
  while (x !== b.x) {
    paint();
    x += Math.sign(b.x - x);
  }
  while (y !== b.y) {
    paint();
    y += Math.sign(b.y - y);
  }
  paint();
}

export function buildTutorialLevel(): GeneratedLevel {
  const W = MAP_WIDTH;
  const H = MAP_HEIGHT;
  const map = new TileMap(W, H, 'grass');
  for (let x = 0; x < W; x++) {
    map.set(x, 0, 'bamboo');
    map.set(x, H - 1, 'bamboo');
  }
  for (let y = 0; y < H; y++) {
    map.set(0, y, 'bamboo');
    map.set(W - 1, y, 'bamboo');
  }
  // The Pasig River and the fort's riverside walk along the top (under the lesson banner).
  for (let x = 1; x < W - 1; x++) {
    map.set(x, 1, 'water');
    map.set(x, 2, 'path');
  }
  // The moat, crossed only by a collapsed bridge.
  for (let y = 2; y < H - 1; y++) {
    map.set(10, y, 'water');
    map.set(11, y, 'water');
  }
  const bridge = [
    { x: 10, y: 10 },
    { x: 11, y: 10 },
  ];
  for (const t of bridge) map.set(t.x, t.y, 'brokenBridge');

  // The cell block, and the chapel storeroom behind a padlocked gate.
  const house: Rect = { x: 2, y: 4, w: 6, h: 4 };
  walledRect(map, house);
  map.set(4, 7, 'door');
  const garden: Rect = { x: 13, y: 4, w: 7, h: 5 };
  walledRect(map, garden);
  const gate = { x: 16, y: 8 };
  map.set(gate.x, gate.y, 'gateLocked');

  // A bamboo screen separates the storeroom side from the patrolled courtyard.
  for (let y = 3; y < H - 1; y++) if (y !== 11) map.set(20, y, 'bamboo');
  // Stop the yard being skirted on the far right of the patrol line.
  for (const y of [13, 14, 15]) map.set(28, y, 'bamboo');

  const delorean = { x: 3, y: 12 };
  const playerStart = { x: 4, y: 12 };
  path(map, { x: 4, y: 8 }, { x: 4, y: 11 });
  path(map, playerStart, { x: 9, y: 10 });
  path(map, { x: 12, y: 10 }, { x: 16, y: 9 });
  path(map, { x: 12, y: 11 }, { x: 22, y: 11 });

  const trees: [number, number][] = [
    [2, 9], [8, 4], [9, 6], [2, 16], [6, 17], [8, 15], [3, 15],
    [13, 15], [17, 16], [18, 13], [12, 17], [19, 10],
    [22, 4], [25, 5], [27, 7], [24, 9], [23, 16], [27, 17], [21, 18], [25, 12],
  ];
  for (const [x, y] of trees) map.set(x, y, (x + y) % 3 === 0 ? 'bamboo' : 'tree');

  const guardRoute: Point[] = [];
  for (let x = 21; x <= 27; x++) guardRoute.push({ x, y: 14 });

  return {
    seed: 0,
    district: 'Fort Santiago, 29 Dec 1896',
    map,
    playerStart,
    delorean,
    riverX: new Array<number>(H).fill(10),
    bridges: [bridge],
    gate,
    compound: garden,
    buildings: [house, garden],
    components: [
      { id: 'flux', strategy: 'crate', pos: { x: 15, y: 13 } },
      { id: 'coil', strategy: 'damaged', pos: { x: 16, y: 6 } },
      { id: 'gyro', strategy: 'npc', pos: { x: 6, y: 11 } },
      { id: 'cell', strategy: 'loose', pos: { x: 26, y: 17 } },
    ],
    npcs: [{ profileId: 'rizal', pos: { x: 6, y: 11 }, holds: 'gyro' }],
    decoyCrates: [],
    shards: [{ x: 7, y: 14 }],
    blueprint: null,
    guards: [guardRoute],
  };
}
