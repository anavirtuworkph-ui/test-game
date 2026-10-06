import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { World } from '../src/ecs/EntityComponentSystem';
import { makeComponentItem, isPristine } from '../src/game/Inventory';
import { QUESTIONS } from '../src/puzzles/HistoryData';
import { PuzzleSystem, createTimeObject, stateId } from '../src/puzzles/PuzzleSystem';
import { TileMap } from '../src/world/TileMap';

function setup() {
  const world = new World();
  const map = new TileMap(10, 10, 'grass');
  const puzzles = new PuzzleSystem(world, map);
  return { world, map, puzzles };
}

describe('PuzzleSystem: time-state manipulation', () => {
  it('rewinding a collapsed bridge restores it; fast-forwarding washes it away', () => {
    const { world, map, puzzles } = setup();
    const tiles = [
      { x: 4, y: 2 },
      { x: 5, y: 2 },
    ];
    const bridge = world.create();
    world.add(bridge, 'position', tiles[0]).add(bridge, 'timeObject', createTimeObject('bridge', tiles));
    puzzles.sync(bridge);
    expect(map.isPassable(4, 2)).toBe(false);

    expect(puzzles.findAdjacent({ x: 3, y: 2 }, 'right')).toBe(bridge);
    const fwd = puzzles.shiftObject(bridge, 'forward', { x: 3, y: 2 });
    expect(fwd.applied).toBe(true);
    expect(map.get(4, 2)).toBe('water');

    puzzles.shiftObject(bridge, 'rewind', { x: 3, y: 2 });
    const r = puzzles.shiftObject(bridge, 'rewind', { x: 3, y: 2 });
    expect(r.applied).toBe(true);
    expect(map.isPassable(4, 2) && map.isPassable(5, 2)).toBe(true);

    expect(puzzles.shiftObject(bridge, 'rewind', { x: 3, y: 2 }).applied).toBe(false);
    expect(puzzles.shiftObject(bridge, 'forward', { x: 4, y: 2 }).applied).toBe(false);
  });

  it('fast-forwarding a padlocked gate rusts it open; rewinding does not', () => {
    const { world, map, puzzles } = setup();
    const gate = world.create();
    world.add(gate, 'position', { x: 2, y: 2 }).add(gate, 'timeObject', createTimeObject('gate', [{ x: 2, y: 2 }]));
    puzzles.sync(gate);
    puzzles.shiftObject(gate, 'rewind', { x: 1, y: 2 });
    expect(map.get(2, 2)).toBe('gateLocked');
    puzzles.shiftObject(gate, 'forward', { x: 1, y: 2 });
    puzzles.shiftObject(gate, 'forward', { x: 1, y: 2 });
    expect(map.get(2, 2)).toBe('gateOpen');
  });

  it('rewinding a sealed crate releases its contents as a pickup', () => {
    const { world, puzzles } = setup();
    const crate = world.create();
    const item = makeComponentItem('flux', false);
    world
      .add(crate, 'position', { x: 3, y: 3 })
      .add(crate, 'timeObject', createTimeObject('crate', [{ x: 3, y: 3 }], { type: 'item', item }));
    puzzles.sync(crate);
    expect(world.has(crate, 'solid')).toBe(true);

    puzzles.shiftObject(crate, 'forward', { x: 2, y: 3 });
    expect(stateId(world.req(crate, 'timeObject').state)).toBe('rotted');
    expect(world.at({ x: 3, y: 3 }, 'pickup')).toHaveLength(0);

    puzzles.shiftObject(crate, 'rewind', { x: 2, y: 3 });
    const res = puzzles.shiftObject(crate, 'rewind', { x: 2, y: 3 });
    expect(res.applied).toBe(true);
    expect(world.has(crate, 'solid')).toBe(false);
    const pickups = world.at({ x: 3, y: 3 }, 'pickup');
    expect(pickups).toHaveLength(1);
    expect(world.req(pickups[0], 'pickup').payload).toEqual({ type: 'item', item });

    expect(puzzles.shiftObject(crate, 'forward', { x: 2, y: 3 }).applied).toBe(false);
  });

  it('rewinding a cracked inventory component repairs it', () => {
    const { puzzles } = setup();
    const item = makeComponentItem('coil', true);
    expect(puzzles.shiftItem(item, 'forward').applied).toBe(false);
    expect(puzzles.shiftItem(item, 'rewind').applied).toBe(true);
    expect(isPristine(item)).toBe(true);
    expect(puzzles.shiftItem(item, 'rewind').applied).toBe(false);
  });
});

describe('PuzzleSystem: history knowledge', () => {
  it('every question has a valid answer and distinct choices', () => {
    const ids = new Set<string>();
    for (const q of QUESTIONS) {
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
      expect(new Set(q.choices).size).toBe(q.choices.length);
    }
  });

  it('checks answers and never strikes out the correct one', () => {
    const { puzzles } = setup();
    const rng = new Rng(7);
    for (const q of QUESTIONS) {
      expect(puzzles.checkAnswer(q, q.answer)).toBe(true);
      expect(puzzles.checkAnswer(q, (q.answer + 1) % q.choices.length)).toBe(false);
      for (let i = 0; i < 10; i++) expect(puzzles.wrongChoice(q, rng)).not.toBe(q.answer);
    }
  });

  it('prefers questions the NPC has not asked yet', () => {
    const { puzzles } = setup();
    const rng = new Rng(3);
    const q = puzzles.pickQuestion(['cedula', 'betrayal'], ['cedula'], rng);
    expect(q.id).toBe('betrayal');
  });
});
