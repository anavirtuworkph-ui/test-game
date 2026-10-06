/** Persistent progression that survives permadeath: blueprints, upgrades, currency. */

export type UpgradeId = 'capacitor' | 'chronometer' | 'barong' | 'almanac' | 'scanner' | 'sundial';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  /** Must the blueprint be found in a run before it can be built? */
  requiresBlueprint: boolean;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'capacitor',
    name: 'Spare Capacitor',
    description: '+1 starting temporal charge',
    maxLevel: 3,
    baseCost: 10,
    requiresBlueprint: false,
  },
  {
    id: 'chronometer',
    name: 'Tuned Chronometer',
    description: '+10 minutes on the countdown',
    maxLevel: 3,
    baseCost: 12,
    requiresBlueprint: false,
  },
  {
    id: 'barong',
    name: 'Barong Disguise',
    description: '+1 heart: patrols need one more sighting',
    maxLevel: 2,
    baseCost: 18,
    requiresBlueprint: true,
  },
  {
    id: 'almanac',
    name: 'Pocket Almanac',
    description: 'Strikes out one wrong answer in history puzzles',
    maxLevel: 1,
    baseCost: 22,
    requiresBlueprint: true,
  },
  {
    id: 'scanner',
    name: 'Flux Scanner',
    description: 'Reveals where DeLorean components are hidden',
    maxLevel: 1,
    baseCost: 28,
    requiresBlueprint: true,
  },
  {
    id: 'sundial',
    name: 'Stasis Sundial',
    description: 'Guardia Civil patrols move 35% slower',
    maxLevel: 1,
    baseCost: 24,
    requiresBlueprint: true,
  },
];

export function upgradeDef(id: UpgradeId): UpgradeDef {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) throw new Error(`Unknown upgrade ${id}`);
  return def;
}

export type UpgradeLevels = Partial<Record<UpgradeId, number>>;

export interface MetaData {
  version: 1;
  chronotons: number;
  blueprints: UpgradeId[];
  upgrades: UpgradeLevels;
  runs: number;
  wins: number;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'chrono-katipunan/meta/v1';

function freshData(): MetaData {
  return { version: 1, chronotons: 0, blueprints: [], upgrades: {}, runs: 0, wins: 0 };
}

export class MetaProgress {
  data: MetaData;

  constructor(private readonly store: KeyValueStore | null = null) {
    this.data = this.load();
  }

  private load(): MetaData {
    if (!this.store) return freshData();
    try {
      const raw = this.store.getItem(STORAGE_KEY);
      if (!raw) return freshData();
      const parsed = JSON.parse(raw) as Partial<MetaData>;
      if (parsed.version !== 1) return freshData();
      const known = new Set(UPGRADES.map((u) => u.id));
      return {
        ...freshData(),
        ...parsed,
        blueprints: (parsed.blueprints ?? []).filter((b) => known.has(b)),
        upgrades: { ...(parsed.upgrades ?? {}) },
      };
    } catch {
      return freshData();
    }
  }

  save(): void {
    if (!this.store) return;
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage may be unavailable (private mode); progression just won't persist.
    }
  }

  level(id: UpgradeId): number {
    return this.data.upgrades[id] ?? 0;
  }

  isUnlocked(id: UpgradeId): boolean {
    return !upgradeDef(id).requiresBlueprint || this.data.blueprints.includes(id);
  }

  cost(id: UpgradeId): number {
    const def = upgradeDef(id);
    return def.baseCost * (this.level(id) + 1);
  }

  canBuy(id: UpgradeId): boolean {
    const def = upgradeDef(id);
    return this.isUnlocked(id) && this.level(id) < def.maxLevel && this.data.chronotons >= this.cost(id);
  }

  buy(id: UpgradeId): boolean {
    if (!this.canBuy(id)) return false;
    this.data.chronotons -= this.cost(id);
    this.data.upgrades[id] = this.level(id) + 1;
    this.save();
    return true;
  }

  /** Blueprints that still need to be found in a run. */
  lockedBlueprints(): UpgradeId[] {
    return UPGRADES.filter((u) => u.requiresBlueprint && !this.data.blueprints.includes(u.id)).map((u) => u.id);
  }

  unlockBlueprint(id: UpgradeId): void {
    if (!this.data.blueprints.includes(id)) this.data.blueprints.push(id);
  }

  recordRun(victory: boolean, chronotonsEarned: number, blueprints: UpgradeId[]): void {
    this.data.runs += 1;
    if (victory) this.data.wins += 1;
    this.data.chronotons += chronotonsEarned;
    for (const b of blueprints) this.unlockBlueprint(b);
    this.save();
  }
}
