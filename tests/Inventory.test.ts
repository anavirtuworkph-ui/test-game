import { describe, expect, it } from 'vitest';
import { Inventory, isPristine, makeComponentItem } from '../src/game/Inventory';

describe('Inventory', () => {
  it('holds items up to capacity', () => {
    const inv = new Inventory(2);
    expect(inv.add(makeComponentItem('flux', false))).toBe(true);
    expect(inv.add(makeComponentItem('coil', false))).toBe(true);
    expect(inv.full).toBe(true);
    expect(inv.add(makeComponentItem('gyro', false))).toBe(false);
    expect(inv.items).toHaveLength(2);
  });

  it('selects and removes items', () => {
    const inv = new Inventory();
    const a = makeComponentItem('flux', false);
    const b = makeComponentItem('cell', true);
    inv.add(a);
    inv.add(b);
    expect(inv.select(1)).toBe(b);
    expect(inv.hasComponent('cell')).toBe(true);
    expect(inv.remove(b.uid)).toBe(b);
    expect(inv.selected).toBe(0);
    expect(inv.hasComponent('cell')).toBe(false);
    expect(inv.select(5)).toBeNull();
  });

  it('tracks damaged components through their time state', () => {
    const cracked = makeComponentItem('gyro', true);
    expect(isPristine(cracked)).toBe(false);
    cracked.timeState!.index = 0;
    expect(isPristine(cracked)).toBe(true);
    expect(isPristine(makeComponentItem('gyro', false))).toBe(true);
  });
});
