import type { Rng } from '../core/Rng';
import { COMPONENT_NAMES, DIRS, DIR_LIST, samePoint, type Dir, type Point } from '../core/types';
import type { PickupPayload, TimeObject, TimeObjectKind, TimeState, TimeStateDef } from '../ecs/components';
import type { Entity, World } from '../ecs/EntityComponentSystem';
import type { Item } from '../game/Inventory';
import type { TileMap } from '../world/TileMap';
import { questionById, QUESTIONS, type HistoryQuestion } from './HistoryData';

export type TimeDirection = 'rewind' | 'forward';

export interface ShiftResult {
  /** True when the timeline actually moved (and a temporal charge is spent). */
  applied: boolean;
  message: string;
}

const TIMELINES: Record<TimeObjectKind, { states: TimeStateDef[]; start: number }> = {
  bridge: {
    states: [
      { id: 'intact', label: 'Intact bridge' },
      { id: 'collapsed', label: 'Collapsed bridge' },
      { id: 'washed', label: 'Washed-away bridge' },
    ],
    start: 1,
  },
  gate: {
    states: [
      { id: 'new', label: 'Freshly forged padlock' },
      { id: 'locked', label: 'Padlocked gate' },
      { id: 'rusted', label: 'Rusted-open gate' },
    ],
    start: 1,
  },
  crate: {
    states: [
      { id: 'unsealed', label: 'Unsealed crate' },
      { id: 'sealed', label: 'Nailed-shut crate' },
      { id: 'rotted', label: 'Rotted crate' },
    ],
    start: 1,
  },
};

export function createTimeObject(kind: TimeObjectKind, tiles: Point[], contents: PickupPayload | null = null): TimeObject {
  const { states, start } = TIMELINES[kind];
  return { kind, state: { timeline: states, index: start }, tiles, contents };
}

export function stateId(state: TimeState): string {
  return state.timeline[state.index].id;
}

/**
 * Time-state manipulation (rewind / fast-forward of world objects and items)
 * plus history-knowledge puzzle resolution.
 */
export class PuzzleSystem {
  constructor(
    private readonly world: World,
    private readonly map: TileMap,
  ) {}

  /** Write a time object's current state into the tile map / entity components. */
  sync(entity: Entity): void {
    const obj = this.world.req(entity, 'timeObject');
    const id = stateId(obj.state);
    if (obj.kind === 'bridge') {
      const tile = id === 'intact' ? 'bridge' : id === 'washed' ? 'water' : 'brokenBridge';
      for (const t of obj.tiles) this.map.set(t.x, t.y, tile);
    } else if (obj.kind === 'gate') {
      for (const t of obj.tiles) this.map.set(t.x, t.y, id === 'rusted' ? 'gateOpen' : 'gateLocked');
    } else if (obj.kind === 'crate') {
      if (id === 'unsealed') this.world.remove(entity, 'solid');
      else this.world.add(entity, 'solid', true);
    }
  }

  /** The time object next to `p`, preferring the one in the facing direction. */
  findAdjacent(p: Point, facing: Dir): Entity | null {
    const dirs = [facing, ...DIR_LIST.filter((d) => d !== facing)];
    const objects = this.world.query('timeObject');
    for (const d of dirs) {
      const n = { x: p.x + DIRS[d].x, y: p.y + DIRS[d].y };
      for (const e of objects) {
        if (this.world.req(e, 'timeObject').tiles.some((t) => samePoint(t, n))) return e;
      }
    }
    return null;
  }

  shiftObject(entity: Entity, direction: TimeDirection, playerPos: Point): ShiftResult {
    const obj = this.world.req(entity, 'timeObject');
    if (obj.tiles.some((t) => samePoint(t, playerPos))) {
      return { applied: false, message: 'You cannot shift the time of the ground beneath your own feet!' };
    }
    if (obj.kind === 'crate' && stateId(obj.state) === 'unsealed' && !obj.contents) {
      return { applied: false, message: 'The crate is empty. Its past holds nothing more for you.' };
    }
    const next = obj.state.index + (direction === 'rewind' ? -1 : 1);
    if (next < 0) {
      return { applied: false, message: `Any further back and the ${obj.kind} did not exist yet.` };
    }
    if (next >= obj.state.timeline.length) {
      return { applied: false, message: `The ${obj.kind} cannot age any further.` };
    }
    obj.state.index = next;
    this.sync(entity);
    return { applied: true, message: this.describeShift(entity, obj, direction) };
  }

  private describeShift(entity: Entity, obj: TimeObject, direction: TimeDirection): string {
    const id = stateId(obj.state);
    const arrow = direction === 'rewind' ? '⟲' : '⟳';
    switch (`${obj.kind}:${id}`) {
      case 'bridge:intact':
        return `${arrow} Planks leap out of the river and lock into place. The bridge is restored!`;
      case 'bridge:washed':
        return `${arrow} Years blur past and the river swallows the wreckage. Rewind to bring it back.`;
      case 'bridge:collapsed':
        return `${arrow} The broken bridge flickers back into view.`;
      case 'gate:rusted':
        return `${arrow} Decades of monsoon rain in seconds: the padlock rusts to flakes and the gate swings open!`;
      case 'gate:new':
        return `${arrow} The padlock gleams like new... and is still firmly locked.`;
      case 'gate:locked':
        return `${arrow} The gate settles back into its padlocked present.`;
      case 'crate:unsealed':
        return this.openCrate(entity, obj, arrow);
      case 'crate:rotted':
        return `${arrow} The crate rots and sags; its contents vanish under the debris. Rewind to recover them.`;
      case 'crate:sealed':
        return `${arrow} The crate is whole again, nailed shut.`;
      default:
        return `${arrow} Time shifts.`;
    }
  }

  private openCrate(entity: Entity, obj: TimeObject, arrow: string): string {
    const pos = this.world.req(entity, 'position');
    const contents = obj.contents;
    obj.contents = null;
    if (!contents) return `${arrow} You rewind to before the crate was nailed shut. It is empty.`;
    const pickup = this.world.create();
    this.world
      .add(pickup, 'position', { ...pos })
      .add(pickup, 'pickup', { payload: contents })
      .add(pickup, 'renderable', {
        sprite: contents.type === 'item' ? 'component' : contents.type === 'charge' ? 'shard' : 'blueprint',
        layer: 3,
      });
    const what = contents.type === 'item' ? `the ${contents.item.name}` : 'a chronoton shard';
    return `${arrow} You rewind to before the crate was nailed shut. The lid lifts free, revealing ${what}!`;
  }

  shiftItem(item: Item, direction: TimeDirection): ShiftResult {
    const state = item.timeState;
    if (!state) return { applied: false, message: `The ${item.name} is already in perfect working order.` };
    const next = state.index + (direction === 'rewind' ? -1 : 1);
    if (next < 0) return { applied: false, message: `The ${item.name} is already pristine.` };
    if (next >= state.timeline.length) {
      return { applied: false, message: `Aging the ${item.name} further would only break it more.` };
    }
    state.index = next;
    if (stateId(state) === 'pristine') {
      return { applied: true, message: `⟲ The cracks in the ${item.name} knit back together. Good as new!` };
    }
    return { applied: true, message: `⟳ The ${COMPONENT_NAMES[item.componentId]} ages and cracks.` };
  }

  /** Choose a question this NPC has not asked yet (falls back to the full bank). */
  pickQuestion(questionIds: string[], asked: string[], rng: Rng): HistoryQuestion {
    const fresh = questionIds.filter((id) => !asked.includes(id));
    if (fresh.length > 0) return questionById(rng.pick(fresh));
    const any = QUESTIONS.filter((q) => !asked.includes(q.id));
    return rng.pick(any.length > 0 ? any : QUESTIONS);
  }

  checkAnswer(question: HistoryQuestion, choice: number): boolean {
    return choice === question.answer;
  }

  /** A wrong choice to strike out (Pocket Almanac upgrade). */
  wrongChoice(question: HistoryQuestion, rng: Rng): number {
    const wrong = question.choices.map((_, i) => i).filter((i) => i !== question.answer);
    return rng.pick(wrong);
  }
}
