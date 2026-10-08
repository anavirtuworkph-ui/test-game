import type { Point } from '../core/types';

export type TutorialStepId =
  | 'talk'
  | 'shard'
  | 'bridge'
  | 'crate'
  | 'gate'
  | 'repair'
  | 'question'
  | 'patrol'
  | 'install';

export interface TutorialStep {
  id: TutorialStepId;
  /** Short instruction shown in the lesson banner. */
  objective: string;
  /**
   * What Rizal says when this step begins. He has secretly travelled to the
   * present and back, so his lines carry hints he knows more than he should;
   * the game never states it outright.
   */
  rizal: string;
  /** Where Rizal waits during this step. */
  guidePos: Point;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'talk',
    objective: 'Walk up to the man in the black coat and press E to talk.',
    rizal: 'Psst! Over here, by the cell block. Quickly, before the sentry turns.',
    guidePos: { x: 6, y: 11 },
  },
  {
    id: 'shard',
    objective: 'Walk onto the glowing pink chronoton shard to absorb it.',
    rizal:
      'José Rizal. At seven tomorrow they shoot me at Bagumbayan, so forgive the lack of ceremony. A DeLorean, is it? ...A remarkable carriage, I mean. That pink stone hums like its engine. Gather it.',
    guidePos: { x: 6, y: 11 },
  },
  {
    id: 'bridge',
    objective: 'Stand next to the collapsed bridge and press R to rewind it.',
    rizal:
      'The storm took the moat bridge. But your machine lets you turn an object back through its own past. Stand beside it and press R. Each shift spends one temporal charge; mind the pink gauge.',
    guidePos: { x: 8, y: 9 },
  },
  {
    id: 'crate',
    objective: 'Press R beside the nailed crate, then walk onto what falls out.',
    rizal:
      'A piece of your machine fell into the guards\' supply crate, and they nailed it shut. Rewind it to before it was sealed. Fast-forward it and it rots, though rewinding again would save it. Do not ask how I know.',
    guidePos: { x: 13, y: 12 },
  },
  {
    id: 'gate',
    objective: 'Stand next to the padlocked storeroom gate and press F to fast-forward it.',
    rizal:
      'Another piece rolled into the chapel storeroom. That padlock is new, and rewinding only makes it newer. Iron rusts fast in Manila\'s air. Hurry its years along with F.',
    guidePos: { x: 14, y: 10 },
  },
  {
    id: 'repair',
    objective: 'Take the cracked Chrono Coil, press its number key, then R (away from the gate).',
    rizal:
      'Cracked. As a physician I set bones; you can undo the injury itself. Select it with its number, step away from the gate so R does not catch that instead, then press R.',
    guidePos: { x: 18, y: 10 },
  },
  {
    id: 'question',
    objective: 'Talk to Dr. Rizal (E) and answer with the number keys.',
    rizal:
      'Come through the bamboo. I am finishing a poem for my family tonight. One question first, for an old teacher\'s sake. Where you are going, the Katipuneros will quiz you too, and wrong answers will cost you minutes.',
    guidePos: { x: 22, y: 9 },
  },
  {
    id: 'patrol',
    objective: 'Sneak past the sentry to the Lightning Cell. Stay out of the red tiles.',
    rizal:
      'The red tiles are where that sentry can see. Cross behind his back. Tonight he only marches you back. Out there each sighting costs a heart and ten minutes.',
    guidePos: { x: 22, y: 9 },
  },
  {
    id: 'install',
    objective: 'Return to the DeLorean and press E beside it to install all four parts.',
    rizal:
      'All four pieces. Install them with E and go home. Mind the flux condenser on the way out; it has a habit of slipping toward August. Buen viaje, and say nothing of what becomes of me.',
    guidePos: { x: 5, y: 14 },
  },
];

/** Progress through the Fort Santiago lesson. */
export class Tutorial {
  index = 0;
  talkedToGuide = false;

  get step(): TutorialStep | null {
    return TUTORIAL_STEPS[this.index] ?? null;
  }

  get stepNumber(): number {
    return Math.min(this.index + 1, TUTORIAL_STEPS.length);
  }

  get totalSteps(): number {
    return TUTORIAL_STEPS.length;
  }
}
