import { GameState } from './core/GameState';
import { InputController, type Action } from './core/InputController';
import { MetaProgress, type KeyValueStore } from './core/MetaProgress';
import { Renderer } from './render/Renderer';

function safeStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__chrono_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const TOUCH_ACTIONS: Record<string, Action> = {
  up: { type: 'move', dir: 'up' },
  down: { type: 'move', dir: 'down' },
  left: { type: 'move', dir: 'left' },
  right: { type: 'move', dir: 'right' },
  interact: { type: 'interact' },
  confirm: { type: 'confirm' },
  cancel: { type: 'cancel' },
  rewind: { type: 'rewind' },
  forward: { type: 'forward' },
  buy: { type: 'buy' },
  select1: { type: 'select', slot: 0 },
  select2: { type: 'select', slot: 1 },
  select3: { type: 'select', slot: 2 },
  select4: { type: 'select', slot: 3 },
};

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Missing #game canvas');

  const state = new GameState(new MetaProgress(safeStorage()));
  const input = new InputController();
  const renderer = new Renderer(canvas);
  input.attach(window);
  if (import.meta.env.DEV) (window as unknown as { __chrono: GameState }).__chrono = state;

  document.querySelectorAll<HTMLButtonElement>('#touch [data-action]').forEach((btn) => {
    const action = TOUCH_ACTIONS[btn.dataset.action ?? ''];
    if (!action) return;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.press(action);
    });
  });

  let last = performance.now();
  const frame = (now: number) => {
    // Clamp dt so a backgrounded tab doesn't burn the countdown in one frame.
    const dt = Math.min(100, now - last);
    last = now;
    input.update(dt);
    for (const action of input.drain()) state.handle(action);
    state.update(dt);
    renderer.render(state, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
