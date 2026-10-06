import type { ComponentMap } from './components';
import type { Point } from '../core/types';

export type Entity = number;
export type ComponentKey = keyof ComponentMap;

type Stores = { [K in ComponentKey]: Map<Entity, ComponentMap[K]> };

/** Minimal sparse-set style ECS: entities are ids, components live in per-type maps. */
export class World {
  private nextId: Entity = 1;
  private readonly alive = new Set<Entity>();
  private readonly stores: Stores = {
    position: new Map(),
    renderable: new Map(),
    solid: new Map(),
    pickup: new Map(),
    timeObject: new Map(),
    npc: new Map(),
    guard: new Map(),
    facing: new Map(),
    delorean: new Map(),
  };

  create(): Entity {
    const id = this.nextId++;
    this.alive.add(id);
    return id;
  }

  destroy(entity: Entity): void {
    this.alive.delete(entity);
    for (const store of Object.values(this.stores)) store.delete(entity);
  }

  isAlive(entity: Entity): boolean {
    return this.alive.has(entity);
  }

  add<K extends ComponentKey>(entity: Entity, key: K, value: ComponentMap[K]): this {
    if (!this.alive.has(entity)) throw new Error(`Entity ${entity} is not alive`);
    (this.stores[key] as Map<Entity, ComponentMap[K]>).set(entity, value);
    return this;
  }

  remove(entity: Entity, key: ComponentKey): void {
    this.stores[key].delete(entity);
  }

  get<K extends ComponentKey>(entity: Entity, key: K): ComponentMap[K] | undefined {
    return (this.stores[key] as Map<Entity, ComponentMap[K]>).get(entity);
  }

  /** Like get(), but throws when the component is missing. */
  req<K extends ComponentKey>(entity: Entity, key: K): ComponentMap[K] {
    const value = this.get(entity, key);
    if (value === undefined) throw new Error(`Entity ${entity} has no ${key}`);
    return value;
  }

  has(entity: Entity, key: ComponentKey): boolean {
    return this.stores[key].has(entity);
  }

  /** Entities that have every listed component. */
  query(...keys: ComponentKey[]): Entity[] {
    if (keys.length === 0) return [...this.alive];
    const [first, ...rest] = keys;
    const out: Entity[] = [];
    for (const entity of this.stores[first].keys()) {
      if (rest.every((k) => this.stores[k].has(entity))) out.push(entity);
    }
    return out;
  }

  /** Entities with a position at the given tile, optionally filtered by component. */
  at(p: Point, ...keys: ComponentKey[]): Entity[] {
    return this.query('position', ...keys).filter((e) => {
      const pos = this.stores.position.get(e)!;
      return pos.x === p.x && pos.y === p.y;
    });
  }
}
