import { Rng } from '../core/Rng';
import { COMPONENT_IDS, DIRS, DIR_LIST, manhattan, type ComponentId, type Point } from '../core/types';
import { TileMap, isPassableTile, isTimeLockedTile } from './TileMap';

export const MAP_WIDTH = 30;
export const MAP_HEIGHT = 20;

/** How a DeLorean component is locked away this run. */
export type ComponentStrategy = 'crate' | 'compound' | 'npc' | 'damaged' | 'loose';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ComponentPlacement {
  id: ComponentId;
  strategy: ComponentStrategy;
  /** Crate, NPC, or pickup position depending on strategy. */
  pos: Point;
}

export interface NpcPlacement {
  profileId: string;
  pos: Point;
  holds: ComponentId | null;
}

export interface GeneratedLevel {
  seed: number;
  district: string;
  map: TileMap;
  playerStart: Point;
  delorean: Point;
  riverX: number[];
  bridges: Point[][];
  gate: Point;
  compound: Rect;
  buildings: Rect[];
  components: ComponentPlacement[];
  npcs: NpcPlacement[];
  decoyCrates: Point[];
  shards: Point[];
  blueprint: Point | null;
  guards: Point[][];
}

export interface GenerateOptions {
  npcProfiles: string[];
  npcCount?: number;
  guardCount?: number;
  shardCount?: number;
  decoyCrates?: number;
  withBlueprint?: boolean;
}

const DISTRICTS = [
  'Kalookan outskirts',
  'Balintawak crossroads',
  'Tondo riverside',
  'Sampaloc fields',
  'San Juan del Monte',
  'Santa Mesa estates',
  'Bahay Toro farmlands',
  'Kangkong village',
];

const key = (p: Point) => `${p.x},${p.y}`;

function inRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}

class LevelBuilder {
  readonly map = new TileMap(MAP_WIDTH, MAP_HEIGHT, 'grass');
  readonly reserved = new Set<string>();
  /** Tiles taken by solid entities (DeLorean, crates, NPCs). */
  readonly blocked = new Set<string>();
  /** Tiles taken by any placed entity. */
  readonly used = new Set<string>();
  riverX: number[] = [];

  constructor(readonly rng: Rng) {}

  isWest(p: Point): boolean {
    return p.x < this.riverX[p.y];
  }

  isEast(p: Point): boolean {
    return p.x > this.riverX[p.y] + 1;
  }

  /**
   * Walkable tiles, ignoring solid entities. With `solved` set, tiles that a
   * time puzzle can open (collapsed bridges, locked gates) count as walkable.
   */
  private walkable(x: number, y: number, solved = true): boolean {
    const t = this.map.get(x, y);
    return (isPassableTile(t) || (solved && isTimeLockedTile(t))) && !this.blocked.has(`${x},${y}`);
  }

  flood(start: Point, solved = true): Set<string> {
    const seen = new Set<string>([key(start)]);
    const stack = [start];
    while (stack.length) {
      const p = stack.pop()!;
      for (const d of DIR_LIST) {
        const n = { x: p.x + DIRS[d].x, y: p.y + DIRS[d].y };
        const k = key(n);
        if (!seen.has(k) && this.map.inBounds(n.x, n.y) && this.walkable(n.x, n.y, solved)) {
          seen.add(k);
          stack.push(n);
        }
      }
    }
    return seen;
  }

  /** True when every walkable tile can be reached from start. */
  connected(start: Point): boolean {
    let total = 0;
    this.map.forEach((_, p) => {
      if (this.walkable(p.x, p.y)) total++;
    });
    return this.flood(start).size === total;
  }

  /**
   * Make `p` impassable (via `apply`) only if the map stays fully connected
   * once puzzles are solved AND the area reachable before any puzzle only
   * loses `p` itself, so no region gets cut off behind the river.
   */
  tryBlock(start: Point, p: Point, apply: () => void, revert: () => void): boolean {
    const before = this.flood(start, false);
    apply();
    const after = this.flood(start, false);
    const expected = before.size - (before.has(key(p)) ? 1 : 0);
    if (this.connected(start) && after.size === expected) return true;
    revert();
    return false;
  }

  drawPath(a: Point, b: Point): void {
    let { x, y } = a;
    const paint = () => {
      if (this.map.get(x, y) === 'grass') this.map.set(x, y, 'path');
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

  freeTiles(start: Point, filter: (p: Point) => boolean): Point[] {
    const reach = this.flood(start);
    const out: Point[] = [];
    this.map.forEach((t, p) => {
      const k = key(p);
      if (
        (t === 'grass' || t === 'path' || t === 'floor') &&
        reach.has(k) &&
        !this.reserved.has(k) &&
        !this.used.has(k) &&
        filter(p)
      ) {
        out.push(p);
      }
    });
    return out;
  }

  /** Place a solid entity without cutting off any part of the map. */
  placeSolid(start: Point, filter: (p: Point) => boolean): Point | null {
    for (const p of this.rng.shuffle(this.freeTiles(start, filter))) {
      const k = key(p);
      if (this.tryBlock(start, p, () => this.blocked.add(k), () => this.blocked.delete(k))) {
        this.used.add(k);
        return p;
      }
    }
    return null;
  }

  placeLoose(start: Point, filter: (p: Point) => boolean): Point | null {
    const options = this.freeTiles(start, filter);
    if (options.length === 0) return null;
    const p = this.rng.pick(options);
    this.used.add(key(p));
    return p;
  }
}

function tryGenerate(rng: Rng, seed: number, opts: Required<GenerateOptions>): GeneratedLevel | null {
  const b = new LevelBuilder(rng);
  const { map } = b;
  const W = MAP_WIDTH;
  const H = MAP_HEIGHT;

  for (let x = 0; x < W; x++) {
    map.set(x, 0, 'bamboo');
    map.set(x, H - 1, 'bamboo');
  }
  for (let y = 0; y < H; y++) {
    map.set(0, y, 'bamboo');
    map.set(W - 1, y, 'bamboo');
  }

  // A meandering two-tile river splits the district into west (arrival) and east banks.
  let rx = rng.int(13, 15);
  for (let y = 0; y < H; y++) {
    if (y > 0 && rng.chance(0.3)) rx = Math.min(16, Math.max(12, rx + rng.pick([-1, 1])));
    b.riverX[y] = rx;
    if (y > 0 && y < H - 1) {
      map.set(rx, y, 'water');
      map.set(rx + 1, y, 'water');
    }
  }

  // Collapsed bridges: the only crossings, restored by rewinding them.
  const bridgeRows = [rng.int(2, 7), rng.int(11, H - 3)];
  const bridges: Point[][] = [];
  for (const y of bridgeRows) {
    const r = b.riverX[y];
    const tiles = [
      { x: r, y },
      { x: r + 1, y },
    ];
    for (const t of tiles) map.set(t.x, t.y, 'brokenBridge');
    for (const t of [...tiles, { x: r - 1, y }, { x: r + 2, y }]) b.reserved.add(key(t));
    bridges.push(tiles);
  }

  // Bahay kubo and stone houses, each with a single door.
  const buildings: Rect[] = [];
  const doors: { door: Point; outside: Point; rect: Rect }[] = [];
  const targetBuildings = rng.int(5, 7);
  for (let i = 0; i < 160 && buildings.length < targetBuildings; i++) {
    const w = rng.int(5, 7);
    const h = rng.int(4, 5);
    const rect = { x: rng.int(2, W - w - 2), y: rng.int(2, H - h - 2), w, h };
    let clear = true;
    for (let y = rect.y - 1; y <= rect.y + h && clear; y++) {
      for (let x = rect.x - 1; x <= rect.x + w && clear; x++) {
        if (map.get(x, y) !== 'grass' || b.reserved.has(`${x},${y}`)) clear = false;
      }
    }
    if (!clear) continue;

    const sides = rng.shuffle(['up', 'down', 'left', 'right'] as const);
    const side = sides[0];
    let door: Point;
    if (side === 'up') door = { x: rng.int(rect.x + 1, rect.x + w - 2), y: rect.y };
    else if (side === 'down') door = { x: rng.int(rect.x + 1, rect.x + w - 2), y: rect.y + h - 1 };
    else if (side === 'left') door = { x: rect.x, y: rng.int(rect.y + 1, rect.y + h - 2) };
    else door = { x: rect.x + w - 1, y: rng.int(rect.y + 1, rect.y + h - 2) };
    const outside = { x: door.x + DIRS[side].x, y: door.y + DIRS[side].y };

    for (let y = rect.y; y < rect.y + h; y++) {
      for (let x = rect.x; x < rect.x + w; x++) {
        const edge = x === rect.x || y === rect.y || x === rect.x + w - 1 || y === rect.y + h - 1;
        map.set(x, y, edge ? 'wall' : 'floor');
      }
    }
    map.set(door.x, door.y, 'door');
    map.set(outside.x, outside.y, 'path');
    b.reserved.add(key(door));
    b.reserved.add(key(outside));
    buildings.push(rect);
    doors.push({ door, outside, rect });
  }

  const eastDoors = doors.filter((d) => b.isEast(d.door));
  if (eastDoors.length === 0) return null;
  const compoundDoor = rng.pick(eastDoors);
  map.set(compoundDoor.door.x, compoundDoor.door.y, 'gateLocked');
  const compound = compoundDoor.rect;

  // The DeLorean crash site on the west bank.
  const spawnOptions: Point[] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x <= 6; x++) {
      const p = { x, y };
      const right = { x: x + 1, y };
      if (
        b.isWest(right) &&
        map.get(x, y) === 'grass' &&
        map.get(right.x, right.y) === 'grass' &&
        !b.reserved.has(key(p)) &&
        !b.reserved.has(key(right))
      ) {
        spawnOptions.push(p);
      }
    }
  }
  if (spawnOptions.length === 0) return null;
  const delorean = rng.pick(spawnOptions);
  const playerStart = { x: delorean.x + 1, y: delorean.y };
  b.blocked.add(key(delorean));
  b.used.add(key(delorean));
  b.reserved.add(key(playerStart));
  if (!b.connected(playerStart)) return null;

  // Dirt roads: crash site -> bridges -> houses.
  for (const tiles of bridges) {
    const y = tiles[0].y;
    const westApproach = { x: tiles[0].x - 1, y };
    const eastApproach = { x: tiles[1].x + 1, y };
    b.drawPath(playerStart, westApproach);
    for (const d of doors) b.drawPath(b.isEast(d.outside) ? eastApproach : playerStart, d.outside);
  }

  // Trees and bamboo groves, never sealing off part of the map.
  for (const p of rng.shuffle(b.freeTiles(playerStart, () => true))) {
    if (map.get(p.x, p.y) !== 'grass' || !rng.chance(0.2)) continue;
    const plant = rng.chance(0.3) ? 'bamboo' : 'tree';
    b.tryBlock(playerStart, p, () => map.set(p.x, p.y, plant), () => map.set(p.x, p.y, 'grass'));
  }

  const inCompound = (p: Point) => inRect(p, compound);
  const outdoorsEast = (p: Point) => b.isEast(p) && !inCompound(p);
  const awayFromCrash = (p: Point) => manhattan(p, playerStart) >= 4;

  const components: ComponentPlacement[] = [];
  const strategies: ComponentStrategy[] = ['crate', 'compound', 'npc', 'damaged'];
  const order = rng.shuffle(COMPONENT_IDS);
  let npcHolder: ComponentId | null = null;
  let npcHolderPos: Point | null = null;
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const strategy = strategies[i];
    let pos: Point | null = null;
    if (strategy === 'compound') pos = b.placeLoose(playerStart, (p) => inCompound(p) && map.get(p.x, p.y) === 'floor');
    else if (strategy === 'crate' || strategy === 'npc') pos = b.placeSolid(playerStart, outdoorsEast);
    else pos = b.placeLoose(playerStart, outdoorsEast);
    if (!pos) return null;
    if (strategy === 'npc') {
      npcHolder = id;
      npcHolderPos = pos;
    }
    components.push({ id, strategy, pos });
  }

  const profiles = rng.shuffle(opts.npcProfiles);
  const npcs: NpcPlacement[] = [];
  if (npcHolder && npcHolderPos) npcs.push({ profileId: profiles[0], pos: npcHolderPos, holds: npcHolder });
  for (let i = 1; i < Math.min(opts.npcCount, profiles.length); i++) {
    const pos = b.placeSolid(playerStart, (p) => !inCompound(p) && awayFromCrash(p));
    if (!pos) return null;
    npcs.push({ profileId: profiles[i], pos, holds: null });
  }

  const decoyCrates: Point[] = [];
  for (let i = 0; i < opts.decoyCrates; i++) {
    const pos = b.placeSolid(playerStart, (p) => !inCompound(p) && awayFromCrash(p));
    if (pos) decoyCrates.push(pos);
  }

  const shards: Point[] = [];
  for (let i = 0; i < opts.shardCount; i++) {
    // At least one shard on the arrival bank so a fresh run can always cross the river.
    const pos = b.placeLoose(playerStart, i === 0 ? (p) => b.isWest(p) && awayFromCrash(p) : awayFromCrash);
    if (!pos) return null;
    shards.push(pos);
  }

  const blueprint = opts.withBlueprint
    ? b.placeLoose(playerStart, (p) => manhattan(p, playerStart) >= 6)
    : null;

  // Guardia Civil patrol routes: straight back-and-forth beats away from the crash site.
  const guards: Point[][] = [];
  const safe = (p: Point) => manhattan(p, playerStart) >= 6;
  for (let attempt = 0; attempt < 60 && guards.length < opts.guardCount; attempt++) {
    const startOptions = b.freeTiles(playerStart, (p) => safe(p) && !inCompound(p));
    if (startOptions.length === 0) break;
    const start = rng.pick(startOptions);
    const dir = DIRS[rng.pick(DIR_LIST)];
    const length = rng.int(4, 7);
    const route = [start];
    for (let i = 1; i < length; i++) {
      const prev = route[route.length - 1];
      const next = { x: prev.x + dir.x, y: prev.y + dir.y };
      if (!map.isPassable(next.x, next.y) || b.blocked.has(key(next)) || !safe(next)) break;
      route.push(next);
    }
    if (route.length >= 3) guards.push(route);
  }

  return {
    seed,
    district: rng.pick(DISTRICTS),
    map,
    playerStart,
    delorean,
    riverX: b.riverX,
    bridges,
    gate: compoundDoor.door,
    compound,
    buildings,
    components,
    npcs,
    decoyCrates,
    shards,
    blueprint,
    guards,
  };
}

export function generateLevel(seed: number, options: GenerateOptions): GeneratedLevel {
  const opts: Required<GenerateOptions> = {
    npcCount: 3,
    guardCount: 3,
    shardCount: 3,
    decoyCrates: 1,
    withBlueprint: false,
    ...options,
  };
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const level = tryGenerate(rng, seed, opts);
    if (level) return level;
  }
  throw new Error(`Could not generate a level for seed ${seed}`);
}
