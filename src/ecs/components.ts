import type { ComponentId, Dir, Point } from '../core/types';
import type { UpgradeId } from '../core/MetaProgress';
import type { Item } from '../game/Inventory';

export type SpriteKind =
  | 'player'
  | 'delorean'
  | 'guard'
  | 'npc'
  | 'crate'
  | 'component'
  | 'shard'
  | 'blueprint'
  | 'bridge'
  | 'gate';

export interface Renderable {
  sprite: SpriteKind;
  /** Draw order; higher draws on top. */
  layer: number;
  tint?: string;
}

export type PickupPayload =
  | { type: 'item'; item: Item }
  | { type: 'charge'; amount: number }
  | { type: 'blueprint'; upgrade: UpgradeId };

export interface Pickup {
  payload: PickupPayload;
}

export interface TimeStateDef {
  id: string;
  label: string;
}

/** An object whose state can be scrubbed along its own timeline. */
export interface TimeState {
  timeline: TimeStateDef[];
  index: number;
}

export type TimeObjectKind = 'bridge' | 'gate' | 'crate';

export interface TimeObject {
  kind: TimeObjectKind;
  state: TimeState;
  /** Map tiles this object occupies (bridges span several). */
  tiles: Point[];
  /** Crate contents released when it is unsealed. */
  contents: PickupPayload | null;
}

export interface Npc {
  profileId: string;
  solved: boolean;
  /** DeLorean component handed over when their puzzle is solved. */
  holds: ComponentId | null;
  reward: 'charge' | 'time';
  askedQuestions: string[];
}

export interface Guard {
  route: Point[];
  index: number;
  step: 1 | -1;
  facing: Dir;
  stepTimer: number;
  stunnedMs: number;
}

export interface Facing {
  dir: Dir;
}

export interface Delorean {
  installed: ComponentId[];
}

/** Every component type the ECS knows about. */
export interface ComponentMap {
  position: Point;
  renderable: Renderable;
  solid: true;
  pickup: Pickup;
  timeObject: TimeObject;
  npc: Npc;
  guard: Guard;
  facing: Facing;
  delorean: Delorean;
}
