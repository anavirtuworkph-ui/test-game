import type { OutcomeCause } from '../core/Achievements';
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
import { TUTORIAL_CHECKPOINT, buildTutorialLevel } from '../world/TutorialLevel';
import { Inventory, isPristine, makeComponentItem } from './Inventory';
import { TUTORIAL_STEPS, Tutorial, type TutorialStepId } from './Tutorial';

/** In-game minutes until the Cry of Pugad Lawin. */
export const BASE_MINUTES = 120;
/** Real minutes the loop lasts at the base countdown. */
export const REAL_MINUTES = 5;
/** In-game seconds per real second: 2 in-game hours play out in 5 real minutes. */
export const TIME_SCALE = (BASE_MINUTES * 60) / (REAL_MINUTES * 60);
export const GUARD_STEP_MS = 520;
export const GUARD_VISION = 3;
export const CAUGHT_PENALTY_MINUTES = 10;
export const WRONG_ANSWER_PENALTY_MINUTES = 5;
/** Real ms the player has to hit the dodge prompt once spotted. */
export const DODGE_WINDOW_MS = 1000;
/** After a dodge the inventor is winded: a sighting in this window is an instant capture. */
export const DODGE_COOLDOWN_MS = 5000;
export const DODGE_DISTANCE = 2;
/** How long a dodged guard stands confused. */
export const DODGE_STUN_MS = 2500;

export interface RunConfig {
  seed: number;
  upgrades: UpgradeLevels;
  /** Blueprints not yet unlocked; one may appear as a pickup this run. */
  lockedBlueprints: UpgradeId[];
  /** Which pass through the two hours this is (1 = first). */
  loop?: number;
  /** Play the hand-built Fort Santiago lesson instead of a generated loop. */
  tutorial?: boolean;
}

export interface RunStats {
  componentsCollected: number;
  componentsInstalled: number;
  puzzlesSolved: number;
  timeShifts: number;
  timesCaught: number;
  dodges: number;
  blueprints: UpgradeId[];
}

export interface RunOutcome {
  victory: boolean;
  cause: OutcomeCause;
  reason: string;
}

/** A patrol has spotted the player: the world freezes until they dodge or the window closes. */
export interface DodgeChallenge {
  guard: Entity;
  dir: Dir;
  remainingMs: number;
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
  readonly tutorial: Tutorial | null;
  guide: Entity | null = null;

  charges: number;
  hearts: number;
  dialogue: Dialogue | null = null;
  outcome: RunOutcome | null = null;
  messages: LogMessage[] = [];
  /** Unpaused play time (drives the countdown and message ages). */
  elapsedMs = 0;
  /** Wall-clock time in the loop, dialogue and dodge prompts included (for speed achievements). */
  realMs = 0;
  invulnerableMs = 0;
  dodge: DodgeChallenge | null = null;
  dodgeCooldownMs = 0;
  readonly stats: RunStats = {
    componentsCollected: 0,
    componentsInstalled: 0,
    puzzlesSolved: 0,
    timeShifts: 0,
    timesCaught: 0,
    dodges: 0,
    blueprints: [],
  };

  constructor(readonly config: RunConfig) {
    // Workshop upgrades don't apply to the lesson.
    const lvl = (id: UpgradeId) => (config.tutorial ? 0 : (config.upgrades[id] ?? 0));
    this.rng = new Rng(config.seed ^ 0x5bd1e995);
    this.tutorial = config.tutorial ? new Tutorial() : null;
    this.level = config.tutorial
      ? buildTutorialLevel()
      : generateLevel(config.seed, {
          npcProfiles: NPC_PROFILES.map((p) => p.id),
          withBlueprint: config.lockedBlueprints.length > 0,
        });
    this.map = this.level.map;
    this.puzzles = new PuzzleSystem(this.world, this.map);
    this.timer = new CountdownTimer((BASE_MINUTES + 10 * lvl('chronometer')) * 60, TIME_SCALE);
    this.charges = (config.tutorial ? 1 : 2) + lvl('capacitor');
    this.maxCharges = 5 + lvl('capacitor');
    this.maxHearts = 3 + lvl('barong');
    this.hearts = this.maxHearts;
    this.scanner = lvl('scanner') > 0;
    this.almanac = lvl('almanac') > 0;
    this.guardStepMs = config.tutorial ? 700 : lvl('sundial') > 0 ? GUARD_STEP_MS * 1.35 : GUARD_STEP_MS;

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
    if (this.tutorial) {
      this.log('Fort Santiago, Manila. 29 December 1896, the night before José Rizal\'s execution.');
      this.log('Your DeLorean\'s first jump went astray, and it came down hard inside the fort.');
      this.log(`Dr. Rizal: "${TUTORIAL_STEPS[0].rizal}"`);
    } else {
      const loop = config.loop ?? 1;
      if (loop === 1) {
        this.log(`August 23, 1896, ${this.level.district}. Two hours until the Cry of Pugad Lawin.`);
        this.log('Your DeLorean is wrecked. Recover all 4 components and bring them back to it (E).');
      } else {
        this.log(`August 23, 1896, ${this.level.district}. Two hours until the Cry of Pugad Lawin. Again. (Loop ${loop})`);
        this.log('The loop has reset, and so has the DeLorean. Recover all 4 components (E to install).');
      }
    }
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
      } else if (c.strategy === 'compound' || c.strategy === 'damaged' || c.strategy === 'loose') {
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
      if (n.profileId === 'rizal') this.guide = e;
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
        .add(e, 'renderable', {
          sprite: n.profileId === 'rizal' ? 'guide' : 'npc',
          layer: 6,
          tint: profileById(n.profileId).color,
        });
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
    if (this.outcome) return;
    this.realMs += dtMs;
    if (this.dodge) {
      // Time stands still while the player reacts.
      this.dodge.remainingMs -= dtMs;
      if (this.dodge.remainingMs <= 0) this.failDodge('Too slow!');
      return;
    }
    if (this.dialogue) return;
    this.elapsedMs += dtMs;
    this.dodgeCooldownMs = Math.max(0, this.dodgeCooldownMs - dtMs);
    // The lesson has no clock.
    if (!this.tutorial) this.timer.update(dtMs);
    if (this.timer.expired) {
      this.finish(false, 'timer', 'The Cry of Pugad Lawin rings out. The two hours are spent, and the loop drags you back to their start.');
      return;
    }
    this.invulnerableMs = Math.max(0, this.invulnerableMs - dtMs);
    this.updateGuards(dtMs);
    this.checkDetection();
    this.advanceTutorial();
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
    if (this.invulnerableMs > 0 || this.outcome || this.dodge) return;
    const p = this.playerPos;
    for (const e of this.world.query('guard', 'position')) {
      const g = this.world.req(e, 'guard');
      if (g.stunnedMs > 0) continue;
      const gp = this.world.req(e, 'position');
      if (samePoint(gp, p) || this.guardVision(e).some((v) => samePoint(v, p))) {
        this.spotted(e);
        return;
      }
    }
  }

  /** A patrol sees the player: offer a dodge, unless they're still winded from the last one. */
  private spotted(guard: Entity): void {
    if (this.dodgeCooldownMs > 0) {
      this.log('Still winded from your last dive. No strength left to dodge!');
      this.caught(guard);
      return;
    }
    const dir = this.chooseDodgeDir(guard);
    if (!dir) {
      this.log('Cornered. Nowhere to dodge!');
      this.caught(guard);
      return;
    }
    this.dodge = { guard, dir, remainingMs: DODGE_WINDOW_MS };
    this.log(`¡ALTO! A Guardia Civil spots you. Press ${dir.toUpperCase()} to dodge!`);
  }

  /** Tiles a dodge in `dir` would cover, stopping at the first obstacle. */
  dodgePath(dir: Dir): Point[] {
    const path: Point[] = [];
    let p = this.playerPos;
    for (let i = 0; i < DODGE_DISTANCE; i++) {
      const n = addPoint(p, DIRS[dir]);
      if (this.isBlocked(n) || this.world.at(n, 'guard').length > 0) break;
      path.push(n);
      p = n;
    }
    return path;
  }

  /** Prefer a dive that lands out of every patrol's sight and away from the guard. */
  private chooseDodgeDir(guard: Entity): Dir | null {
    const gp = this.world.req(guard, 'position');
    const seen = new Set(
      this.world.query('guard').flatMap((g) => this.guardVision(g).map((v) => `${v.x},${v.y}`)),
    );
    let best: Dir[] = [];
    let bestScore = -Infinity;
    for (const d of DIR_LIST) {
      const path = this.dodgePath(d);
      if (path.length === 0) continue;
      const land = path[path.length - 1];
      const score =
        (seen.has(`${land.x},${land.y}`) ? 0 : 100) + path.length * 10 + Math.abs(land.x - gp.x) + Math.abs(land.y - gp.y);
      if (score > bestScore) {
        bestScore = score;
        best = [d];
      } else if (score === bestScore) {
        best.push(d);
      }
    }
    return best.length ? this.rng.pick(best) : null;
  }

  private handleDodge(action: Action): void {
    const dodge = this.dodge!;
    // Only a fresh key press counts, so a key held while walking can't dodge (or fail) by accident.
    if (action.type !== 'move' || action.repeat) return;
    if (action.dir !== dodge.dir) {
      this.failDodge('Wrong way!');
      return;
    }
    this.dodge = null;
    const path = this.dodgePath(dodge.dir);
    const pos = this.playerPos;
    for (const step of path) {
      pos.x = step.x;
      pos.y = step.y;
      for (const e of this.world.at(step, 'pickup')) this.collect(e);
    }
    this.world.req(this.player, 'facing').dir = dodge.dir;
    if (this.world.isAlive(dodge.guard)) this.world.req(dodge.guard, 'guard').stunnedMs = DODGE_STUN_MS;
    this.dodgeCooldownMs = DODGE_COOLDOWN_MS;
    this.invulnerableMs = 600;
    this.stats.dodges += 1;
    this.log('You dive aside! The guard blinks at empty air. (Winded for 5 seconds: avoid patrols.)');
  }

  private failDodge(why: string): void {
    const dodge = this.dodge;
    this.dodge = null;
    if (!dodge) return;
    this.log(why);
    this.caught(dodge.guard);
  }

  private caught(guardEntity: Entity): void {
    this.dodge = null;
    this.dodgeCooldownMs = 0;
    if (this.tutorial) {
      // The lesson never costs hearts or time; the sentry just marches you back.
      this.world.req(guardEntity, 'guard').stunnedMs = 1500;
      const pos = this.playerPos;
      pos.x = TUTORIAL_CHECKPOINT.x;
      pos.y = TUTORIAL_CHECKPOINT.y;
      this.invulnerableMs = 1500;
      this.stats.timesCaught += 1;
      this.log('¡Alto! The sentry marches you back to the bamboo. Dr. Rizal: "Behind his back, amigo. Watch the red."');
      return;
    }
    this.hearts -= 1;
    this.stats.timesCaught += 1;
    this.timer.penalize(CAUGHT_PENALTY_MINUTES);
    if (this.hearts <= 0) {
      this.finish(false, 'arrested', 'Arrested by the Guardia Civil as a suspected Katipunero. The loop resets with you in its grip.');
      return;
    }
    this.world.req(guardEntity, 'guard').stunnedMs = 2000;
    const pos = this.playerPos;
    pos.x = this.level.playerStart.x;
    pos.y = this.level.playerStart.y;
    this.invulnerableMs = 2000;
    this.log(`¡Alto! A Guardia Civil patrol drags you back to your machine. (-${CAUGHT_PENALTY_MINUTES} min, -1 heart)`);
  }

  private finish(victory: boolean, cause: OutcomeCause, reason: string): void {
    if (this.outcome) return;
    this.outcome = { victory, cause, reason };
    this.dialogue = null;
    this.dodge = null;
  }

  // ---------------------------------------------------------------- actions

  handle(action: Action): void {
    if (this.outcome) return;
    if (this.dodge) {
      this.handleDodge(action);
      return;
    }
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
    this.advanceTutorial();
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
    if (this.tutorial && e === this.guide && !npc.solved) {
      const step = this.tutorial.step;
      if (step?.id === 'talk') {
        this.tutorial.talkedToGuide = true;
        return;
      }
      if (step && step.id !== 'question') {
        this.log(`Dr. Rizal: "${step.rizal}"`);
        return;
      }
      // Cycle his questions so a wrong answer always gets a fresh try.
      if (profile.questionIds.every((id) => npc.askedQuestions.includes(id))) npc.askedQuestions = [];
    }
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
    } else if (this.tutorial) {
      dlg.result = {
        correct: false,
        text: `Dr. Rizal smiles. "Not quite. Ask me again; out there it will cost you ${WRONG_ANSWER_PENALTY_MINUTES} minutes."\n${dlg.question.fact}`,
      };
      this.log('Not quite. Talk to Dr. Rizal again for another question.');
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
    if (this.tutorial && this.charges === 0 && this.tutorial.step?.id !== 'install') {
      // Never let a lesson soft-lock on an empty capacitor.
      this.charges = 1;
      this.log('Dr. Rizal presses a pink stone into your hand: +1 charge. "I kept one. For emergencies."');
    }
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
        'escaped',
        this.tutorial
          ? 'The DeLorean roars out of Fort Santiago. Behind you, Rizal lifts a hand, as if he knows exactly where you are headed. Then the flux condenser slips.'
          : 'The Flux Condenser flares and the loop finally breaks. At 88 miles per hour the DeLorean tears through time, back to the present.',
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

  // ---------------------------------------------------------------- tutorial

  /** Whether the world already satisfies a lesson step (so steps can be done in any order). */
  tutorialStepDone(id: TutorialStepId): boolean {
    const have = (c: ComponentId, pristine = false) =>
      this.installed.includes(c) ||
      this.inventory.components().some((i) => i.componentId === c && (!pristine || isPristine(i)));
    const timeState = (kind: 'bridge' | 'gate') => {
      const e = this.world.query('timeObject').find((x) => this.world.req(x, 'timeObject').kind === kind);
      return e === undefined ? null : stateId(this.world.req(e, 'timeObject').state);
    };
    switch (id) {
      case 'talk':
        return this.tutorial?.talkedToGuide ?? false;
      case 'shard':
        return !this.world.query('pickup').some((e) => this.world.req(e, 'pickup').payload.type === 'charge');
      case 'bridge':
        return timeState('bridge') === 'intact';
      case 'crate':
        return have('flux');
      case 'gate':
        return timeState('gate') === 'rusted' || have('coil');
      case 'repair':
        return have('coil', true);
      case 'question':
        return this.guide !== null && this.world.req(this.guide, 'npc').solved;
      case 'patrol':
        return have('cell');
      case 'install':
        return this.outcome?.victory ?? false;
    }
  }

  /** Move the lesson forward past every step the world already satisfies. */
  advanceTutorial(): void {
    const t = this.tutorial;
    if (!t || this.outcome) return;
    let advanced = false;
    while (t.step && this.tutorialStepDone(t.step.id)) {
      t.index += 1;
      advanced = true;
    }
    if (!advanced || !t.step) return;
    this.log(`Dr. Rizal: "${t.step.rizal}"`);
    this.moveGuide(t.step.guidePos);
  }

  /** Move Rizal to the free tile nearest `target`. */
  private moveGuide(target: Point): void {
    if (this.guide === null) return;
    const pos = this.world.req(this.guide, 'position');
    const free = (p: Point) =>
      this.map.isPassable(p.x, p.y) &&
      !samePoint(p, this.playerPos) &&
      this.world.at(p).every((e) => e === this.guide || (!this.world.has(e, 'solid') && !this.world.has(e, 'pickup')));
    const queue = [target];
    const seen = new Set([`${target.x},${target.y}`]);
    while (queue.length) {
      const p = queue.shift()!;
      if (free(p)) {
        pos.x = p.x;
        pos.y = p.y;
        return;
      }
      for (const d of DIR_LIST) {
        const n = addPoint(p, DIRS[d]);
        const k = `${n.x},${n.y}`;
        if (!seen.has(k) && this.map.inBounds(n.x, n.y)) {
          seen.add(k);
          queue.push(n);
        }
      }
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
