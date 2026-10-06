import { CountdownTimer } from '../core/CountdownTimer';
import type { Action } from '../core/InputController';
import type { UpgradeId, UpgradeLevels } from '../core/MetaProgress';
import { Rng } from '../core/Rng';
import {
  COMPONENT_IDS,
  COMPONENT_NAMES,
  DIRS,
  DIR_LIST,
  addPoint,
  samePoint,
  type ComponentId,
  type Dir,
  type Point,
} from '../core/types';
import type { PickupPayload } from '../ecs/components';
import { World, type Entity } from '../ecs/EntityComponentSystem';
import { NPC_PROFILES, profileById, type HistoryQuestion } from '../puzzles/HistoryData';
import { PuzzleSystem, createTimeObject, stateId, type TimeDirection } from '../puzzles/PuzzleSystem';
import { generateLevel, type GeneratedLevel } from '../world/MapGenerator';
import type { TileMap } from '../world/TileMap';
import { Inventory, isPristine, makeComponentItem } from './Inventory';

/** In-game minutes until the Cry of Pugad Lawin. */
export const BASE_MINUTES = 120;
/** In-game seconds per real second: 2 hours plays out in 6 real minutes. */
export const TIME_SCALE = 20;
export const GUARD_STEP_MS = 520;
export const GUARD_VISION = 3;
export const CAUGHT_PENALTY_MINUTES = 10;
export const WRONG_ANSWER_PENALTY_MINUTES = 5;

export interface RunConfig {
  seed: number;
  upgrades: UpgradeLevels;
  /** Blueprints not yet unlocked; one may appear as a pickup this run. */
  lockedBlueprints: UpgradeId[];
}

export interface RunStats {
  componentsCollected: number;
  componentsInstalled: number;
  puzzlesSolved: number;
  timeShifts: number;
  timesCaught: number;
  blueprints: UpgradeId[];
}

export interface RunOutcome {
  victory: boolean;
  reason: string;
}

export interface Dialogue {
  npc: Entity;
  question: HistoryQuestion;
  /** Choice struck out by the Pocket Almanac, if any. */
  struck: number | null;
  result: { correct: boolean; text: string } | null;
}

export interface LogMessage {
  text: string;
  at: number;
}

export class Run {
  readonly world = new World();
  readonly level: GeneratedLevel;
  readonly map: TileMap;
  readonly puzzles: PuzzleSystem;
  readonly inventory = new Inventory(8);
  readonly timer: CountdownTimer;
  readonly rng: Rng;
  readonly player: Entity;
  readonly delorean: Entity;
  readonly maxCharges: number;
  readonly maxHearts: number;
  readonly scanner: boolean;
  private readonly almanac: boolean;
  private readonly guardStepMs: number;

  charges: number;
  hearts: number;
  dialogue: Dialogue | null = null;
  outcome: RunOutcome | null = null;
  messages: LogMessage[] = [];
  elapsedMs = 0;
  invulnerableMs = 0;
  readonly stats: RunStats = {
    componentsCollected: 0,
    componentsInstalled: 0,
    puzzlesSolved: 0,
    timeShifts: 0,
    timesCaught: 0,
    blueprints: [],
  };

  constructor(readonly config: RunConfig) {
    const lvl = (id: UpgradeId) => config.upgrades[id] ?? 0;
    this.rng = new Rng(config.seed ^ 0x5bd1e995);
    this.level = generateLevel(config.seed, {
      npcProfiles: NPC_PROFILES.map((p) => p.id),
      withBlueprint: config.lockedBlueprints.length > 0,
    });
    this.map = this.level.map;
    this.puzzles = new PuzzleSystem(this.world, this.map);
    this.timer = new CountdownTimer((BASE_MINUTES + 10 * lvl('chronometer')) * 60, TIME_SCALE);
    this.charges = 2 + lvl('capacitor');
    this.maxCharges = 5 + lvl('capacitor');
    this.maxHearts = 3 + lvl('barong');
    this.hearts = this.maxHearts;
    this.scanner = lvl('scanner') > 0;
    this.almanac = lvl('almanac') > 0;
    this.guardStepMs = lvl('sundial') > 0 ? GUARD_STEP_MS * 1.35 : GUARD_STEP_MS;

    this.player = this.world.create();
    this.world
      .add(this.player, 'position', { ...this.level.playerStart })
      .add(this.player, 'facing', { dir: 'right' })
      .add(this.player, 'renderable', { sprite: 'player', layer: 10 });

    this.delorean = this.world.create();
    this.world
      .add(this.delorean, 'position', { ...this.level.delorean })
      .add(this.delorean, 'solid', true)
      .add(this.delorean, 'delorean', { installed: [] })
      .add(this.delorean, 'renderable', { sprite: 'delorean', layer: 5 });

    this.spawnLevelEntities();
    this.log(`August 23, 1896, ${this.level.district}. Two hours until the Cry of Pugad Lawin.`);
    this.log('Your DeLorean is wrecked. Recover all 4 components and bring them back to it (E).');
  }

  private spawnLevelEntities(): void {
    const { world, level } = this;
    for (const tiles of level.bridges) {
      const e = world.create();
      world
        .add(e, 'position', { ...tiles[0] })
        .add(e, 'timeObject', createTimeObject('bridge', tiles))
        .add(e, 'renderable', { sprite: 'bridge', layer: 0 });
      this.puzzles.sync(e);
    }
    const gate = world.create();
    world
      .add(gate, 'position', { ...level.gate })
      .add(gate, 'timeObject', createTimeObject('gate', [level.gate]))
      .add(gate, 'renderable', { sprite: 'gate', layer: 0 });
    this.puzzles.sync(gate);

    for (const c of level.components) {
      if (c.strategy === 'crate') {
        this.spawnCrate(c.pos, { type: 'item', item: makeComponentItem(c.id, false) });
      } else if (c.strategy === 'compound' || c.strategy === 'damaged') {
        this.spawnPickup(c.pos, { type: 'item', item: makeComponentItem(c.id, c.strategy === 'damaged') });
      }
    }
    for (const pos of level.decoyCrates) this.spawnCrate(pos, { type: 'charge', amount: 1 });
    for (const pos of level.shards) this.spawnPickup(pos, { type: 'charge', amount: 1 });
    if (level.blueprint && this.config.lockedBlueprints.length > 0) {
      this.spawnPickup(level.blueprint, { type: 'blueprint', upgrade: this.rng.pick(this.config.lockedBlueprints) });
    }

    for (const n of level.npcs) {
      const e = world.create();
      world
        .add(e, 'position', { ...n.pos })
        .add(e, 'solid', true)
        .add(e, 'npc', {
          profileId: n.profileId,
          solved: false,
          holds: n.holds,
          reward: this.rng.chance(0.5) ? 'charge' : 'time',
          askedQuestions: [],
        })
        .add(e, 'renderable', { sprite: 'npc', layer: 6, tint: profileById(n.profileId).color });
    }

    for (const route of level.guards) {
      const e = world.create();
      const facing = this.dirBetween(route[0], route[1]);
      world
        .add(e, 'position', { ...route[0] })
        .add(e, 'guard', {
          route,
          index: 0,
          step: 1,
          facing,
          stepTimer: this.guardStepMs * (1 + this.rng.next()),
          stunnedMs: 0,
        })
        .add(e, 'renderable', { sprite: 'guard', layer: 8 });
    }
  }

  private spawnCrate(pos: Point, contents: PickupPayload): void {
    const e = this.world.create();
    this.world
      .add(e, 'position', { ...pos })
      .add(e, 'timeObject', createTimeObject('crate', [pos], contents))
      .add(e, 'renderable', { sprite: 'crate', layer: 4 });
    this.puzzles.sync(e);
  }

  private spawnPickup(pos: Point, payload: PickupPayload): void {
    const e = this.world.create();
    const sprite = payload.type === 'item' ? 'component' : payload.type === 'charge' ? 'shard' : 'blueprint';
    this.world
      .add(e, 'position', { ...pos })
      .add(e, 'pickup', { payload })
      .add(e, 'renderable', { sprite, layer: 3 });
  }

  // ---------------------------------------------------------------- queries

  get playerPos(): Point {
    return this.world.req(this.player, 'position');
  }

  get facing(): Dir {
    return this.world.req(this.player, 'facing').dir;
  }

  get installed(): ComponentId[] {
    return this.world.req(this.delorean, 'delorean').installed;
  }

  isBlocked(p: Point): boolean {
    return !this.map.isPassable(p.x, p.y) || this.world.at(p, 'solid').length > 0;
  }

  /** Tiles a patrol can currently see. */
  guardVision(entity: Entity): Point[] {
    const guard = this.world.req(entity, 'guard');
    if (guard.stunnedMs > 0) return [];
    const pos = this.world.req(entity, 'position');
    const f = DIRS[guard.facing];
    const side = { x: f.y, y: f.x };
    const seen: Point[] = [];
    for (const lateral of [0, -1, 1]) {
      for (let d = 1; d <= GUARD_VISION; d++) {
        if (lateral !== 0 && d < 2) continue;
        const p = { x: pos.x + f.x * d + side.x * lateral, y: pos.y + f.y * d + side.y * lateral };
        if (!this.map.inBounds(p.x, p.y) || this.map.isOpaque(p.x, p.y)) break;
        if (this.world.at(p, 'solid').length > 0) break;
        seen.push(p);
      }
    }
    return seen;
  }

  // ---------------------------------------------------------------- loop

  update(dtMs: number): void {
    if (this.outcome || this.dialogue) return;
    this.elapsedMs += dtMs;
    this.timer.update(dtMs);
    if (this.timer.expired) {
      this.finish(false, 'The Cry of Pugad Lawin rings out. The timeline seals shut, and you are stranded in 1896.');
      return;
    }
    this.invulnerableMs = Math.max(0, this.invulnerableMs - dtMs);
    this.updateGuards(dtMs);
    this.checkDetection();
  }

  private updateGuards(dtMs: number): void {
    for (const e of this.world.query('guard', 'position')) {
      const g = this.world.req(e, 'guard');
      if (g.stunnedMs > 0) {
        g.stunnedMs = Math.max(0, g.stunnedMs - dtMs);
        continue;
      }
      g.stepTimer -= dtMs;
      if (g.stepTimer > 0) continue;
      g.stepTimer += this.guardStepMs;
      let next = g.index + g.step;
      if (next < 0 || next >= g.route.length || this.world.at(g.route[next], 'solid').length > 0) {
        g.step = g.step === 1 ? -1 : 1;
        next = g.index + g.step;
        if (next < 0 || next >= g.route.length) continue;
        g.facing = this.dirBetween(g.route[g.index], g.route[next]);
        continue; // spend this beat turning around
      }
      const pos = this.world.req(e, 'position');
      g.facing = this.dirBetween(g.route[g.index], g.route[next]);
      g.index = next;
      pos.x = g.route[next].x;
      pos.y = g.route[next].y;
    }
  }

  private checkDetection(): void {
    if (this.invulnerableMs > 0 || this.outcome) return;
    const p = this.playerPos;
    for (const e of this.world.query('guard', 'position')) {
      const g = this.world.req(e, 'guard');
      if (g.stunnedMs > 0) continue;
      const gp = this.world.req(e, 'position');
      if (samePoint(gp, p) || this.guardVision(e).some((v) => samePoint(v, p))) {
        this.caught(e);
        return;
      }
    }
  }

  private caught(guardEntity: Entity): void {
    this.hearts -= 1;
    this.stats.timesCaught += 1;
    this.timer.penalize(CAUGHT_PENALTY_MINUTES);
    if (this.hearts <= 0) {
      this.finish(false, 'Arrested by the Guardia Civil as a suspected Katipunero. Your machine is lost to history.');
      return;
    }
    this.world.req(guardEntity, 'guard').stunnedMs = 2000;
    const pos = this.playerPos;
    pos.x = this.level.playerStart.x;
    pos.y = this.level.playerStart.y;
    this.invulnerableMs = 2000;
    this.log(`¡Alto! A Guardia Civil patrol drags you back to your machine. (-${CAUGHT_PENALTY_MINUTES} min, -1 heart)`);
  }

  private finish(victory: boolean, reason: string): void {
    if (this.outcome) return;
    this.outcome = { victory, reason };
    this.dialogue = null;
  }

  // ---------------------------------------------------------------- actions

  handle(action: Action): void {
    if (this.outcome) return;
    if (this.dialogue) {
      this.handleDialogue(action);
      return;
    }
    switch (action.type) {
      case 'move':
        this.move(action.dir);
        break;
      case 'interact':
      case 'confirm':
        this.interact();
        break;
      case 'rewind':
        this.shiftTime('rewind');
        break;
      case 'forward':
        this.shiftTime('forward');
        break;
      case 'select': {
        const item = this.inventory.select(action.slot);
        if (item) {
          const cond = isPristine(item) ? 'in working order' : 'CRACKED. Press R to rewind its damage';
          this.log(`Selected ${item.name}: ${cond}.`);
        }
        break;
      }
      default:
        break;
    }
  }

  move(dir: Dir): void {
    this.world.req(this.player, 'facing').dir = dir;
    const target = addPoint(this.playerPos, DIRS[dir]);
    if (this.isBlocked(target)) {
      this.bumpHint(target);
      return;
    }
    const pos = this.playerPos;
    pos.x = target.x;
    pos.y = target.y;
    for (const e of this.world.at(target, 'pickup')) this.collect(e);
    this.checkDetection();
  }

  private bumpHint(p: Point): void {
    const tile = this.map.get(p.x, p.y);
    if (tile === 'brokenBridge') {
      this.log('The bridge has collapsed into the river. If only you could undo that... (R: rewind)');
    } else if (tile === 'gateLocked') {
      this.log('An iron padlock bars the gate. Old iron rusts quickly in the tropics... (F: fast-forward)');
    } else if (this.world.at(p, 'npc').length > 0) {
      this.log('Someone is standing here. Press E to talk.');
    } else if (this.world.at(p, 'timeObject').length > 0) {
      const obj = this.world.req(this.world.at(p, 'timeObject')[0], 'timeObject');
      this.log(`${obj.state.timeline[obj.state.index].label}. Maybe it wasn't always like this... (R / F)`);
    } else if (this.world.at(p, 'delorean').length > 0) {
      this.log('Your DeLorean. Press E to install recovered components.');
    }
  }

  private collect(e: Entity): void {
    const { payload } = this.world.req(e, 'pickup');
    if (payload.type === 'item') {
      if (!this.inventory.add(payload.item)) {
        this.log('Your satchel is full.');
        return;
      }
      this.stats.componentsCollected += 1;
      if (isPristine(payload.item)) {
        this.log(`Recovered the ${payload.item.name}! Bring it back to the DeLorean.`);
      } else {
        const slot = this.inventory.items.indexOf(payload.item) + 1;
        this.log(`Found the ${payload.item.name}, but it is cracked! Select it (${slot}) and press R to rewind it.`);
      }
    } else if (payload.type === 'charge') {
      if (this.charges >= this.maxCharges) {
        this.log('Your temporal capacitor is already full.');
        return;
      }
      this.charges = Math.min(this.maxCharges, this.charges + payload.amount);
      this.log(`Absorbed a chronoton shard: +${payload.amount} temporal charge.`);
    } else {
      this.stats.blueprints.push(payload.upgrade);
      this.log('Found a DeLorean upgrade blueprint! It will be waiting in your workshop.');
    }
    this.world.destroy(e);
  }

  private adjacentEntities(): Entity[] {
    const dirs = [this.facing, ...DIR_LIST.filter((d) => d !== this.facing)];
    return dirs.flatMap((d) => this.world.at(addPoint(this.playerPos, DIRS[d])));
  }

  interact(): void {
    for (const e of this.adjacentEntities()) {
      if (this.world.has(e, 'npc')) return this.talk(e);
      if (this.world.has(e, 'delorean')) return this.installComponents();
      if (this.world.has(e, 'timeObject')) {
        const obj = this.world.req(e, 'timeObject');
        if (obj.kind === 'crate') {
          this.log(
            stateId(obj.state) === 'unsealed'
              ? 'An open, empty crate.'
              : `${obj.state.timeline[obj.state.index].label}. You cannot pry it open, but time could. (R / F)`,
          );
          return;
        }
      }
    }
    this.log('Nothing here to interact with.');
  }

  private talk(e: Entity): void {
    const npc = this.world.req(e, 'npc');
    const profile = profileById(npc.profileId);
    if (npc.solved) {
      this.log(`${profile.name}: "Mabuhay ang Katipunan! May you find your way home."`);
      return;
    }
    const question = this.puzzles.pickQuestion(profile.questionIds, npc.askedQuestions, this.rng);
    npc.askedQuestions.push(question.id);
    this.dialogue = {
      npc: e,
      question,
      struck: this.almanac ? this.puzzles.wrongChoice(question, this.rng) : null,
      result: null,
    };
  }

  private handleDialogue(action: Action): void {
    const dlg = this.dialogue!;
    if (dlg.result) {
      if (action.type !== 'move') this.dialogue = null;
      return;
    }
    if (action.type === 'cancel') {
      this.dialogue = null;
      return;
    }
    if (action.type === 'select') this.answer(action.slot);
  }

  answer(choice: number): void {
    const dlg = this.dialogue;
    if (!dlg || dlg.result) return;
    if (choice < 0 || choice >= dlg.question.choices.length || choice === dlg.struck) return;
    const npc = this.world.req(dlg.npc, 'npc');
    const profile = profileById(npc.profileId);
    if (this.puzzles.checkAnswer(dlg.question, choice)) {
      npc.solved = true;
      this.stats.puzzlesSolved += 1;
      let reward: string;
      if (npc.holds) {
        const item = makeComponentItem(npc.holds, false);
        if (this.inventory.add(item)) {
          this.stats.componentsCollected += 1;
          reward = `Received the ${item.name}!`;
        } else {
          npc.solved = false;
          reward = 'Your satchel is full; come back when you have room.';
        }
      } else if (npc.reward === 'charge') {
        this.charges = Math.min(this.maxCharges, this.charges + 1);
        reward = 'They share a strange glowing stone: +1 temporal charge.';
      } else {
        this.timer.penalize(-8);
        reward = 'They show you a shortcut through the fields: +8 minutes.';
      }
      dlg.result = { correct: true, text: `${profile.thanks}\n${reward}\n${dlg.question.fact}` };
      this.log(`${profile.name} trusts you. ${reward}`);
    } else {
      this.timer.penalize(WRONG_ANSWER_PENALTY_MINUTES);
      dlg.result = {
        correct: false,
        text: `${profile.name} narrows their eyes. "Hmm. Come back when you know our ways." (-${WRONG_ANSWER_PENALTY_MINUTES} min)\n${dlg.question.fact}`,
      };
      this.log(`Wrong answer. ${profile.name} grows suspicious. (-${WRONG_ANSWER_PENALTY_MINUTES} min)`);
    }
  }

  shiftTime(direction: TimeDirection): void {
    if (this.charges <= 0) {
      this.log('Your temporal capacitor is drained. Find chronoton shards to recharge.');
      return;
    }
    const target = this.puzzles.findAdjacent(this.playerPos, this.facing);
    let result;
    if (target !== null) {
      result = this.puzzles.shiftObject(target, direction, this.playerPos);
    } else {
      const item = this.inventory.selectedItem;
      if (!item) {
        this.log('Nothing nearby is anchored in time. Stand by a bridge, gate or crate, or select an item (1-8).');
        return;
      }
      result = this.puzzles.shiftItem(item, direction);
    }
    if (result.applied) {
      this.charges -= 1;
      this.stats.timeShifts += 1;
    }
    this.log(result.message);
  }

  installComponents(): void {
    const d = this.world.req(this.delorean, 'delorean');
    const ready = this.inventory.components().filter(isPristine);
    const cracked = this.inventory.components().filter((i) => !isPristine(i));
    for (const item of ready) {
      d.installed.push(item.componentId);
      this.inventory.remove(item.uid);
      this.stats.componentsInstalled += 1;
    }
    if (d.installed.length === COMPONENT_IDS.length) {
      this.finish(
        true,
        'The Flux Condenser flares. At 88 miles per hour the DeLorean tears through time, back to the present.',
      );
      return;
    }
    const missing = COMPONENT_IDS.filter((c) => !d.installed.includes(c)).map((c) => COMPONENT_NAMES[c]);
    if (ready.length > 0) {
      this.log(`Installed ${ready.map((i) => i.name).join(', ')}. Still needed: ${missing.join(', ')}.`);
    } else if (cracked.length > 0) {
      this.log(`The ${cracked[0].name} is cracked and won't fit. Select it and press R to rewind the damage.`);
    } else {
      this.log(`The DeLorean still needs: ${missing.join(', ')}.`);
    }
  }

  // ---------------------------------------------------------------- helpers

  log(text: string): void {
    const last = this.messages[this.messages.length - 1];
    if (last && last.text === text) {
      last.at = this.elapsedMs;
      return;
    }
    this.messages.push({ text, at: this.elapsedMs });
    if (this.messages.length > 30) this.messages.shift();
  }

  private dirBetween(a: Point, b: Point): Dir {
    if (b.x > a.x) return 'right';
    if (b.x < a.x) return 'left';
    if (b.y > a.y) return 'down';
    return 'up';
  }
}
