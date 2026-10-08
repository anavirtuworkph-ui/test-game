import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/GameState';
import { MetaProgress } from '../src/core/MetaProgress';
import { samePoint } from '../src/core/types';
import { Run } from '../src/game/Run';
import { TUTORIAL_STEPS } from '../src/game/Tutorial';
import { RIZAL, TUTORIAL_QUESTIONS } from '../src/puzzles/HistoryData';
import { TUTORIAL_CHECKPOINT } from '../src/world/TutorialLevel';
import { removeGuards, solve } from './solver';

const lesson = () => new Run({ seed: 0, upgrades: { capacitor: 3, scanner: 1 }, lockedBlueprints: ['almanac'], tutorial: true });

describe('Fort Santiago tutorial', () => {
  it('is set the night before Rizal\'s execution, with Rizal as the guide', () => {
    const run = lesson();
    expect(run.level.district).toContain('29 Dec 1896');
    expect(run.guide).not.toBeNull();
    expect(run.world.req(run.guide!, 'npc').profileId).toBe(RIZAL.id);
    expect(run.tutorial!.step!.id).toBe('talk');
    // Upgrades and blueprints don't leak into the lesson.
    expect(run.charges).toBe(1);
    expect(run.scanner).toBe(false);
    expect(run.world.query('pickup').some((e) => run.world.req(e, 'pickup').payload.type === 'blueprint')).toBe(false);
  });

  it('has no clock', () => {
    const run = lesson();
    removeGuards(run);
    const before = run.timer.remainingSeconds;
    for (let i = 0; i < 1000; i++) run.update(1000);
    expect(run.timer.remainingSeconds).toBe(before);
    expect(run.outcome).toBeNull();
  });

  it('walks through every step in order and finishes', () => {
    const run = lesson();
    removeGuards(run);
    const seen: string[] = [];
    const record = () => {
      const id = run.tutorial!.step?.id;
      if (id && seen[seen.length - 1] !== id) seen.push(id);
    };
    record();
    for (let i = 0; i < 30 && !run.outcome; i++) {
      solve(run, 1);
      record();
    }
    expect(run.outcome?.victory).toBe(true);
    expect(seen[0]).toBe('talk');
    // Steps only ever move forward.
    const order = TUTORIAL_STEPS.map((s) => s.id);
    for (let i = 1; i < seen.length; i++) expect(order.indexOf(seen[i] as never)).toBeGreaterThan(order.indexOf(seen[i - 1] as never));
  });

  it('only quizzes once the lesson reaches the question', () => {
    const run = lesson();
    removeGuards(run);
    run.tutorial!.talkedToGuide = true;
    run.advanceTutorial();
    expect(run.tutorial!.step!.id).toBe('shard');
    const g = run.world.req(run.guide!, 'position');
    const p = run.world.req(run.player, 'position');
    p.x = g.x - 1;
    p.y = g.y;
    run.move('right');
    run.interact();
    expect(run.dialogue).toBeNull();
  });

  it('wrong answers cost nothing and the sentry never costs hearts', () => {
    const run = lesson();
    run.tutorial!.index = TUTORIAL_STEPS.findIndex((s) => s.id === 'question');
    const g = run.world.req(run.guide!, 'position');
    const p = run.world.req(run.player, 'position');
    p.x = g.x - 1;
    p.y = g.y;
    run.move('right');
    run.interact();
    expect(run.dialogue).not.toBeNull();
    const before = run.timer.remainingSeconds;
    const q = run.dialogue!.question;
    expect(TUTORIAL_QUESTIONS.map((x) => x.id)).toContain(q.id);
    run.answer((q.answer + 1) % q.choices.length);
    expect(run.timer.remainingSeconds).toBe(before);
    expect(run.world.req(run.guide!, 'npc').solved).toBe(false);

    run.dialogue = null;
    const guard = run.world.query('guard')[0];
    const gp = run.world.req(guard, 'position');
    p.x = gp.x;
    p.y = gp.y;
    run.update(1);
    expect(run.hearts).toBe(run.maxHearts);
    expect(samePoint(run.playerPos, TUTORIAL_CHECKPOINT)).toBe(true);
  });

  it('never runs out of temporal charge', () => {
    const run = lesson();
    removeGuards(run);
    const bridge = run.world.query('timeObject').find((e) => run.world.req(e, 'timeObject').kind === 'bridge')!;
    const t = run.world.req(bridge, 'timeObject').tiles[0];
    const p = run.world.req(run.player, 'position');
    p.x = t.x - 1;
    p.y = t.y;
    run.move('right');
    run.shiftTime('forward'); // washes the bridge away: the only charge is spent
    expect(run.charges).toBe(1);
    run.shiftTime('rewind');
    run.shiftTime('rewind');
    expect(run.charges).toBe(1);
  });
});

describe('Tutorial flow in GameState', () => {
  it('new players start with the lesson, then fall straight into the loop', () => {
    const gs = new GameState(new MetaProgress(null), () => 99);
    gs.handle({ type: 'confirm' });
    expect(gs.run!.tutorial).not.toBeNull();
    removeGuards(gs.run!);
    solve(gs.run!);
    gs.update(16);
    expect(gs.phase).toBe('victory');
    expect(gs.summary!.tutorial).toBe(true);
    expect(gs.summary!.chronotonsEarned).toBe(MetaProgress.TUTORIAL_REWARD);
    expect(gs.meta.data.tutorialDone).toBe(true);
    expect(gs.meta.data.runs).toBe(0);

    gs.update(1000);
    gs.handle({ type: 'confirm' });
    expect(gs.phase).toBe('playing');
    expect(gs.run!.tutorial).toBeNull();
    expect(gs.run!.level.district).not.toContain('1896');
    expect(gs.run!.config.loop).toBe(1);
  });

  it('can be skipped, and replayed later without paying out again', () => {
    const gs = new GameState(new MetaProgress(null), () => 5);
    gs.handle({ type: 'newRun' });
    expect(gs.run!.tutorial).toBeNull();
    gs.phase = 'start';
    gs.meta.data.tutorialDone = true;
    gs.handle({ type: 'tutorial' });
    expect(gs.run!.tutorial).not.toBeNull();
    expect(gs.meta.completeTutorial()).toBe(0);
  });
});
