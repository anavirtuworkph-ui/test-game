import { COMPONENT_NAMES, type ComponentId } from '../core/types';
import type { TimeState } from '../ecs/components';

export interface Item {
  uid: number;
  kind: 'component';
  componentId: ComponentId;
  name: string;
  /** Present on items that can be repaired/aged with time manipulation. */
  timeState: TimeState | null;
}

let nextUid = 1;

export function makeComponentItem(componentId: ComponentId, cracked: boolean): Item {
  return {
    uid: nextUid++,
    kind: 'component',
    componentId,
    name: COMPONENT_NAMES[componentId],
    timeState: cracked
      ? {
          timeline: [
            { id: 'pristine', label: 'Pristine' },
            { id: 'cracked', label: 'Cracked' },
          ],
          index: 1,
        }
      : null,
  };
}

/** A component is usable unless it is in a damaged time state. */
export function isPristine(item: Item): boolean {
  return !item.timeState || item.timeState.timeline[item.timeState.index].id === 'pristine';
}

export class Inventory {
  readonly items: Item[] = [];
  selected = 0;

  constructor(readonly capacity = 8) {}

  get full(): boolean {
    return this.items.length >= this.capacity;
  }

  add(item: Item): boolean {
    if (this.full) return false;
    this.items.push(item);
    return true;
  }

  remove(uid: number): Item | null {
    const idx = this.items.findIndex((i) => i.uid === uid);
    if (idx < 0) return null;
    const [item] = this.items.splice(idx, 1);
    if (this.selected >= this.items.length) this.selected = Math.max(0, this.items.length - 1);
    return item;
  }

  select(slot: number): Item | null {
    if (slot < 0 || slot >= this.capacity) return null;
    this.selected = slot;
    return this.selectedItem;
  }

  get selectedItem(): Item | null {
    return this.items[this.selected] ?? null;
  }

  components(): Item[] {
    return this.items.filter((i) => i.kind === 'component');
  }

  hasComponent(id: ComponentId): boolean {
    return this.items.some((i) => i.componentId === id);
  }
}
