import type { Point } from '../core/types';

export type Tile =
  | 'grass'
  | 'path'
  | 'floor'
  | 'door'
  | 'wall'
  | 'water'
  | 'bridge'
  | 'brokenBridge'
  | 'tree'
  | 'bamboo'
  | 'gateLocked'
  | 'gateOpen';

const PASSABLE: Record<Tile, boolean> = {
  grass: true,
  path: true,
  floor: true,
  door: true,
  wall: false,
  water: false,
  bridge: true,
  brokenBridge: false,
  tree: false,
  bamboo: false,
  gateLocked: false,
  gateOpen: true,
};

/** Tiles that block a patrol's line of sight. */
const OPAQUE: Record<Tile, boolean> = {
  grass: false,
  path: false,
  floor: false,
  door: false,
  wall: true,
  water: false,
  bridge: false,
  brokenBridge: false,
  tree: true,
  bamboo: true,
  gateLocked: true,
  gateOpen: false,
};

export function isPassableTile(tile: Tile): boolean {
  return PASSABLE[tile];
}

/** Tiles that are blocked now but can be made passable by a time puzzle. */
export function isTimeLockedTile(tile: Tile): boolean {
  return tile === 'brokenBridge' || tile === 'gateLocked';
}

export class TileMap {
  readonly tiles: Tile[];

  constructor(
    readonly width: number,
    readonly height: number,
    fill: Tile = 'grass',
  ) {
    this.tiles = new Array<Tile>(width * height).fill(fill);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Tile {
    if (!this.inBounds(x, y)) return 'bamboo';
    return this.tiles[y * this.width + x];
  }

  set(x: number, y: number, tile: Tile): void {
    if (this.inBounds(x, y)) this.tiles[y * this.width + x] = tile;
  }

  isPassable(x: number, y: number): boolean {
    return this.inBounds(x, y) && PASSABLE[this.get(x, y)];
  }

  isOpaque(x: number, y: number): boolean {
    return OPAQUE[this.get(x, y)];
  }

  forEach(fn: (tile: Tile, p: Point) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) fn(this.tiles[y * this.width + x], { x, y });
    }
  }
}
