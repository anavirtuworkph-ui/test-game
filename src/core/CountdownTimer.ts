/**
 * Countdown measured in in-game seconds. Real time is scaled so the
 * 2-hour pre-revolution window plays out in a few real minutes.
 */
export class CountdownTimer {
  private remaining: number;

  constructor(
    readonly totalGameSeconds: number,
    /** In-game seconds that pass per real second. */
    readonly scale: number,
  ) {
    this.remaining = totalGameSeconds;
  }

  update(dtRealMs: number): void {
    this.remaining = Math.max(0, this.remaining - (dtRealMs / 1000) * this.scale);
  }

  /** Lose (positive) or gain (negative) in-game minutes. */
  penalize(minutes: number): void {
    this.remaining = Math.min(this.totalGameSeconds, Math.max(0, this.remaining - minutes * 60));
  }

  get remainingSeconds(): number {
    return this.remaining;
  }

  get expired(): boolean {
    return this.remaining <= 0;
  }

  get fraction(): number {
    return this.remaining / this.totalGameSeconds;
  }

  format(): string {
    const total = Math.ceil(this.remaining);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
