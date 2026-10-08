import { Run, type RunOutcome, type RunStats } from '../game/Run';
import type { Action } from './InputController';
import { MetaProgress, UPGRADES, upgradeDef, type UpgradeId } from './MetaProgress';
import { randomSeed } from './Rng';

export type Phase = 'start' | 'playing' | 'victory' | 'defeat';

export interface RunSummary {
  outcome: RunOutcome;
  stats: RunStats;
  chronotonsEarned: number;
  timeLeft: string;
  seed: number;
  district: string;
  tutorial: boolean;
}

/** Chronotons awarded at the end of a run; failed runs still pay out. */
export function computeReward(stats: RunStats, victory: boolean, remainingSeconds: number): number {
  let total = 4 * stats.componentsCollected + 4 * stats.componentsInstalled + 3 * stats.puzzlesSolved;
  if (victory) total += 20 + Math.floor(remainingSeconds / 60 / 5);
  return Math.max(1, total);
}

/** Top-level state machine: Start Screen -> Game Loop -> Victory/Defeat Screen. */
export class GameState {
  phase: Phase = 'start';
  run: Run | null = null;
  summary: RunSummary | null = null;
  shopIndex = 0;
  shopMessage = '';
  /** Ignore input briefly after a run ends so a held key doesn't skip the result screen. */
  private resultLockMs = 0;

  constructor(
    readonly meta: MetaProgress,
    private readonly seedSource: () => number = randomSeed,
  ) {}

  /** The Fort Santiago lesson with Dr. José Rizal. */
  startTutorial(): Run {
    this.run = new Run({ seed: 0, upgrades: {}, lockedBlueprints: [], tutorial: true });
    this.summary = null;
    this.phase = 'playing';
    return this.run;
  }

  startRun(seed = this.seedSource()): Run {
    this.run = new Run({
      seed,
      upgrades: { ...this.meta.data.upgrades },
      lockedBlueprints: this.meta.lockedBlueprints(),
      loop: this.meta.data.runs + 1,
    });
    this.summary = null;
    this.phase = 'playing';
    return this.run;
  }

  update(dtMs: number): void {
    this.resultLockMs = Math.max(0, this.resultLockMs - dtMs);
    if (this.phase !== 'playing' || !this.run) return;
    this.run.update(dtMs);
    if (this.run.outcome) this.endRun();
  }

  handle(action: Action): void {
    switch (this.phase) {
      case 'start':
        this.handleStart(action);
        break;
      case 'playing':
        this.run?.handle(action);
        if (this.run?.outcome) this.endRun();
        break;
      case 'victory':
      case 'defeat':
        if (this.resultLockMs > 0) return;
        if (this.summary?.tutorial && (action.type === 'interact' || action.type === 'confirm')) {
          // Leaving Rizal's time drops the player straight into the loop.
          this.startRun();
        } else if (action.type === 'interact' || action.type === 'confirm' || action.type === 'cancel') {
          this.phase = 'start';
          this.run = null;
        }
        break;
    }
  }

  private handleStart(action: Action): void {
    if (action.type === 'move' && (action.dir === 'up' || action.dir === 'down')) {
      const delta = action.dir === 'up' ? -1 : 1;
      this.shopIndex = (this.shopIndex + delta + UPGRADES.length) % UPGRADES.length;
      this.shopMessage = '';
    } else if (action.type === 'buy') {
      this.buy(UPGRADES[this.shopIndex].id);
    } else if (action.type === 'tutorial') {
      this.startTutorial();
    } else if (action.type === 'newRun') {
      this.startRun();
    } else if (action.type === 'interact' || action.type === 'confirm') {
      if (this.meta.shouldOfferTutorial) this.startTutorial();
      else this.startRun();
    }
  }

  buy(id: UpgradeId): boolean {
    const def = upgradeDef(id);
    if (!this.meta.isUnlocked(id)) {
      this.shopMessage = `${def.name}: blueprint not found yet. Search the past for it.`;
      return false;
    }
    if (this.meta.level(id) >= def.maxLevel) {
      this.shopMessage = `${def.name} is fully upgraded.`;
      return false;
    }
    if (!this.meta.buy(id)) {
      this.shopMessage = `Not enough chronotons for ${def.name}.`;
      return false;
    }
    this.shopMessage = `Installed ${def.name} (level ${this.meta.level(id)}).`;
    return true;
  }

  private endRun(): void {
    const run = this.run;
    if (!run || !run.outcome) return;
    const victory = run.outcome.victory;
    if (run.tutorial) {
      this.summary = {
        outcome: run.outcome,
        stats: { ...run.stats },
        chronotonsEarned: this.meta.completeTutorial(),
        timeLeft: '',
        seed: 0,
        district: run.level.district,
        tutorial: true,
      };
      this.phase = 'victory';
      this.resultLockMs = 900;
      return;
    }
    const chronotonsEarned = computeReward(run.stats, victory, run.timer.remainingSeconds);
    this.meta.recordRun(victory, chronotonsEarned, run.stats.blueprints);
    this.summary = {
      outcome: run.outcome,
      stats: { ...run.stats },
      chronotonsEarned,
      timeLeft: run.timer.format(),
      seed: run.config.seed,
      district: run.level.district,
      tutorial: false,
    };
    this.phase = victory ? 'victory' : 'defeat';
    this.resultLockMs = 900;
  }
}
