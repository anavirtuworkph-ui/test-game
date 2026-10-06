export interface Point {
  x: number;
  y: number;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIRS: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const DIR_LIST: Dir[] = ['up', 'down', 'left', 'right'];

export type ComponentId = 'flux' | 'coil' | 'gyro' | 'cell';

export const COMPONENT_IDS: ComponentId[] = ['flux', 'coil', 'gyro', 'cell'];

export const COMPONENT_NAMES: Record<ComponentId, string> = {
  flux: 'Flux Condenser',
  coil: 'Chrono Coil',
  gyro: 'Temporal Gyroscope',
  cell: 'Lightning Cell',
};

export function addPoint(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
