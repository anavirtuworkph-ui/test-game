import type { GameState } from '../core/GameState';
import { UPGRADES } from '../core/MetaProgress';
import { COMPONENT_IDS, COMPONENT_NAMES, DIRS, type Dir } from '../core/types';
import type { Entity } from '../ecs/EntityComponentSystem';
import { isPristine, type Item } from '../game/Inventory';
import type { Run } from '../game/Run';
import { profileById } from '../puzzles/HistoryData';
import { stateId } from '../puzzles/PuzzleSystem';
import { MAP_HEIGHT, MAP_WIDTH } from '../world/MapGenerator';
import type { Tile } from '../world/TileMap';

export const TILE = 24;
export const MAP_PX_W = MAP_WIDTH * TILE;
export const MAP_PX_H = MAP_HEIGHT * TILE;
export const HUD_W = 264;
export const LOG_H = 120;
export const CANVAS_W = MAP_PX_W + HUD_W;
export const CANVAS_H = MAP_PX_H + LOG_H;

const FONT = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

const C = {
  bg: '#120d0a',
  panel: '#1f1712',
  panelEdge: '#3a2a1e',
  ink: '#f3e3c3',
  dim: '#a8957a',
  faint: '#6d5c48',
  accent: '#3fe0d0',
  magenta: '#ff4fa3',
  gold: '#f0c04a',
  danger: '#ff5a43',
  ok: '#7bd36a',
  grassA: '#5b7a39',
  grassB: '#557335',
  path: '#a5875a',
  pathDark: '#8f744b',
  floor: '#8a6440',
  floorLine: '#6f4f31',
  wall: '#5e4126',
  wallTop: '#7a5733',
  water: '#2a6a8a',
  waterLight: '#4c93b3',
  plank: '#a07b4b',
  plankDark: '#6b5033',
  leaf: '#2d5a2a',
  leafLight: '#3d7535',
  trunk: '#5a3b22',
  bamboo: '#94b347',
  iron: '#2b2b30',
};

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private time = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
  }

  render(state: GameState, timeMs: number): void {
    this.time = timeMs;
    const { ctx } = this;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (state.phase === 'start') this.drawStart(state);
    else if (state.phase === 'playing' && state.run) this.drawRun(state.run);
    else this.drawResult(state);
  }

  // ================================================================ text helpers

  private text(str: string, x: number, y: number, size = 14, color = C.ink, align: CanvasTextAlign = 'left', bold = false): void {
    const { ctx } = this;
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }

  private wrap(str: string, maxWidth: number, size: number): string[] {
    const { ctx } = this;
    ctx.font = `${size}px ${FONT}`;
    const lines: string[] = [];
    for (const para of str.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  private paragraph(str: string, x: number, y: number, maxWidth: number, size = 13, color = C.ink, lineH = size + 5): number {
    for (const line of this.wrap(str, maxWidth, size)) {
      this.text(line, x, y, size, color);
      y += lineH;
    }
    return y;
  }

  private panel(x: number, y: number, w: number, h: number, edge = C.panelEdge, fill = C.panel): void {
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  // ================================================================ start screen

  private drawVortex(cx: number, cy: number, alpha: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 14; i++) {
      const r = ((this.time / 25 + i * 45) % 630) + 10;
      ctx.strokeStyle = i % 2 ? C.accent : C.magenta;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawStart(state: GameState): void {
    const { meta } = state;
    this.drawVortex(CANVAS_W / 2, 150, 0.18);

    this.text('CHRONO KATIPUNAN', CANVAS_W / 2, 26, 40, C.gold, 'center', true);
    this.text('A time-loop roguelike  ·  Manila, 23 August 1896', CANVAS_W / 2, 74, 15, C.accent, 'center');

    this.panel(24, 108, 452, 404);
    let y = this.paragraph(
      'Your homemade DeLorean worked... too well. It crash-landed in the fields outside Manila exactly two hours before the Cry of Pugad Lawin, the moment the Philippine Revolution begins.',
      40, 124, 420, 13,
    );
    y = this.paragraph(
      'Its four components are scattered across the district. Rewind or fast-forward the world, win the trust of the Katipunan with what you know of their history, and avoid the Guardia Civil. When the Cry rings out, the timeline locks forever.',
      40, y + 8, 420, 13,
    );
    y += 12;
    this.text('CONTROLS', 40, y, 13, C.gold, 'left', true);
    y += 22;
    const controls: [string, string][] = [
      ['WASD / Arrows', 'move'],
      ['E / Space', 'talk, inspect, install at DeLorean'],
      ['R', 'rewind adjacent object (or selected item)'],
      ['F', 'fast-forward adjacent object'],
      ['1-8', 'select item / answer questions'],
      ['Esc', 'leave a conversation'],
    ];
    for (const [k, v] of controls) {
      this.text(k, 40, y, 12, C.accent);
      this.text(v, 180, y, 12, C.ink);
      y += 19;
    }

    // Workshop (meta-progression)
    const wx = 496;
    this.panel(wx, 108, 464, 404);
    this.text('DELOREAN WORKSHOP', wx + 16, 122, 14, C.gold, 'left', true);
    this.text(`◆ ${meta.data.chronotons} chronotons`, wx + 448, 122, 13, C.magenta, 'right', true);
    this.text(`Runs ${meta.data.runs}  ·  Escapes ${meta.data.wins}  ·  Blueprints ${meta.data.blueprints.length}/4`, wx + 16, 144, 11, C.dim);
    let sy = 168;
    UPGRADES.forEach((u, i) => {
      const selected = i === state.shopIndex;
      const unlocked = meta.isUnlocked(u.id);
      const lvl = meta.level(u.id);
      const maxed = lvl >= u.maxLevel;
      if (selected) {
        this.ctx.fillStyle = 'rgba(63,224,208,0.12)';
        this.ctx.fillRect(wx + 10, sy - 4, 444, 50);
        this.ctx.strokeStyle = C.accent;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(wx + 10.5, sy - 3.5, 443, 49);
      }
      const nameColor = unlocked ? C.ink : C.faint;
      this.text(`${selected ? '▶ ' : '  '}${unlocked ? u.name : '??? (blueprint missing)'}`, wx + 16, sy, 13, nameColor, 'left', true);
      const pips = '■'.repeat(lvl) + '□'.repeat(u.maxLevel - lvl);
      this.text(pips, wx + 448, sy, 13, unlocked ? C.accent : C.faint, 'right');
      this.text(unlocked ? u.description : 'Find this blueprint during a run to unlock it.', wx + 34, sy + 19, 11, unlocked ? C.dim : C.faint);
      const status = !unlocked ? 'locked' : maxed ? 'MAX' : `${meta.cost(u.id)} ◆`;
      const affordable = unlocked && !maxed && meta.canBuy(u.id);
      this.text(status, wx + 448, sy + 19, 11, affordable ? C.magenta : C.faint, 'right');
      sy += 54;
    });
    this.text('↑/↓ choose  ·  B build upgrade', wx + 16, 490, 11, C.dim);
    if (state.shopMessage) this.text(state.shopMessage, CANVAS_W / 2, 526, 13, C.accent, 'center');

    if (Math.floor(this.time / 600) % 2 === 0) {
      this.text('Press ENTER or SPACE to fire up the flux condenser', CANVAS_W / 2, 556, 16, C.gold, 'center', true);
    }
  }

  // ================================================================ result screens

  private drawResult(state: GameState): void {
    const s = state.summary;
    if (!s) return;
    const victory = state.phase === 'victory';
    this.drawVortex(CANVAS_W / 2, CANVAS_H / 2, victory ? 0.35 : 0.1);
    this.text(victory ? 'BACK TO THE PRESENT' : 'LOST IN 1896', CANVAS_W / 2, 70, 40, victory ? C.accent : C.danger, 'center', true);
    this.panel(CANVAS_W / 2 - 300, 140, 600, 330);
    let y = this.paragraph(s.outcome.reason, CANVAS_W / 2 - 276, 160, 552, 14);
    y += 14;
    const rows: [string, string][] = [
      ['District', `${s.district} (seed ${s.seed})`],
      ['Time left', s.timeLeft],
      ['Components recovered', `${s.stats.componentsCollected} / 4`],
      ['Components installed', `${s.stats.componentsInstalled} / 4`],
      ['History puzzles solved', String(s.stats.puzzlesSolved)],
      ['Time shifts used', String(s.stats.timeShifts)],
      ['Times caught', String(s.stats.timesCaught)],
      ['Blueprints found', s.stats.blueprints.length ? s.stats.blueprints.join(', ') : 'none'],
    ];
    for (const [k, v] of rows) {
      this.text(k, CANVAS_W / 2 - 276, y, 13, C.dim);
      this.text(v, CANVAS_W / 2 + 276, y, 13, C.ink, 'right');
      y += 22;
    }
    this.text(`+${s.chronotonsEarned} chronotons for the workshop`, CANVAS_W / 2, y + 10, 15, C.magenta, 'center', true);
    if (!victory) this.text('Permadeath: the next run is a brand-new timeline. Upgrades persist.', CANVAS_W / 2, 486, 12, C.dim, 'center');
    if (Math.floor(this.time / 600) % 2 === 0) {
      this.text('Press ENTER or SPACE to return to the workshop', CANVAS_W / 2, 530, 16, C.gold, 'center', true);
    }
  }

  // ================================================================ run

  private drawRun(run: Run): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, MAP_PX_W, MAP_PX_H);
    ctx.clip();
    this.drawTiles(run);
    this.drawVision(run);
    this.drawEntities(run);
    if (run.scanner) this.drawScanner(run);
    this.drawTimePressure(run);
    ctx.restore();
    this.drawHud(run);
    this.drawLog(run);
    if (run.dialogue) this.drawDialogue(run);
  }

  private drawTiles(run: Run): void {
    run.map.forEach((tile, p) => this.drawTile(tile, p.x * TILE, p.y * TILE, p.x, p.y));
  }

  private drawTile(tile: Tile, px: number, py: number, x: number, y: number): void {
    const { ctx } = this;
    const n = hash(x, y);
    const grass = () => {
      ctx.fillStyle = n > 0.5 ? C.grassA : C.grassB;
      ctx.fillRect(px, py, TILE, TILE);
      if (n > 0.7) {
        ctx.fillStyle = '#6b8c45';
        ctx.fillRect(px + 4 + n * 10, py + 6, 2, 4);
        ctx.fillRect(px + 14 - n * 6, py + 15, 2, 4);
      }
    };
    const water = () => {
      ctx.fillStyle = C.water;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = C.waterLight;
      const off = (this.time / 120 + n * 24) % TILE;
      ctx.fillRect(px + ((off + 3) % TILE), py + 6, 6, 2);
      ctx.fillRect(px + ((off + 13) % TILE), py + 16, 5, 2);
    };
    switch (tile) {
      case 'grass':
        grass();
        break;
      case 'path':
        ctx.fillStyle = C.path;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = C.pathDark;
        ctx.fillRect(px + n * 18, py + 5, 3, 2);
        ctx.fillRect(px + 16 - n * 10, py + 17, 2, 2);
        break;
      case 'floor':
        ctx.fillStyle = C.floor;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = C.floorLine;
        ctx.fillRect(px, py + 7, TILE, 1);
        ctx.fillRect(px, py + 15, TILE, 1);
        ctx.fillRect(px + (y % 2 ? 6 : 16), py, 1, TILE);
        break;
      case 'door':
        ctx.fillStyle = C.floor;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#3d2a17';
        ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
        break;
      case 'wall':
        ctx.fillStyle = C.wall;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = C.wallTop;
        ctx.fillRect(px, py, TILE, 6);
        ctx.fillStyle = '#4b331d';
        for (let i = 0; i < 4; i++) ctx.fillRect(px + 2 + i * 6, py + 8, 1, TILE - 9);
        break;
      case 'water':
        water();
        break;
      case 'bridge':
        water();
        ctx.fillStyle = C.plank;
        ctx.fillRect(px, py + 2, TILE, TILE - 4);
        ctx.fillStyle = C.plankDark;
        for (let i = 0; i < 4; i++) ctx.fillRect(px + i * 6, py + 2, 1, TILE - 4);
        ctx.fillRect(px, py + 2, TILE, 2);
        ctx.fillRect(px, py + TILE - 4, TILE, 2);
        break;
      case 'brokenBridge':
        water();
        ctx.fillStyle = C.plankDark;
        ctx.save();
        ctx.translate(px + 12, py + 12);
        ctx.rotate(0.5 - n);
        ctx.fillRect(-9, -3, 14, 4);
        ctx.rotate(1.1);
        ctx.fillRect(-2, 2, 10, 3);
        ctx.restore();
        ctx.fillStyle = 'rgba(63,224,208,0.35)';
        ctx.fillRect(px + 2, py + 2, TILE - 4, 1);
        ctx.fillRect(px + 2, py + TILE - 3, TILE - 4, 1);
        break;
      case 'tree':
        grass();
        ctx.fillStyle = C.trunk;
        ctx.fillRect(px + 10, py + 14, 4, 9);
        ctx.fillStyle = C.leaf;
        ctx.beginPath();
        ctx.arc(px + 12, py + 10, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.leafLight;
        ctx.beginPath();
        ctx.arc(px + 9, py + 7, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bamboo':
        grass();
        ctx.fillStyle = C.bamboo;
        for (let i = 0; i < 3; i++) {
          const bx = px + 4 + i * 7 + (n * 3 - 1);
          ctx.fillRect(bx, py + 1, 3, TILE - 2);
          ctx.fillStyle = '#5f7a2a';
          ctx.fillRect(bx, py + 8 + i * 3, 3, 1);
          ctx.fillStyle = C.bamboo;
        }
        break;
      case 'gateLocked':
      case 'gateOpen': {
        ctx.fillStyle = C.floor;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = tile === 'gateLocked' ? C.iron : '#7a4a2a';
        if (tile === 'gateLocked') {
          for (let i = 0; i < 5; i++) ctx.fillRect(px + 2 + i * 5, py + 1, 2, TILE - 2);
          ctx.fillRect(px + 1, py + 5, TILE - 2, 2);
          ctx.fillRect(px + 1, py + TILE - 7, TILE - 2, 2);
          ctx.fillStyle = C.gold;
          ctx.fillRect(px + 8, py + 10, 8, 7);
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px + 12, py + 10, 3, Math.PI, 0);
          ctx.stroke();
        } else {
          ctx.fillRect(px + 1, py + 1, 3, TILE - 2);
          ctx.fillRect(px + TILE - 4, py + 1, 3, TILE - 2);
          ctx.fillStyle = '#a0522d';
          ctx.fillRect(px + 9, py + 18, 6, 3);
        }
        break;
      }
    }
  }

  private drawVision(run: Run): void {
    const { ctx } = this;
    const pulse = 0.28 + 0.06 * Math.sin(this.time / 200);
    ctx.fillStyle = `rgba(255,40,30,${pulse})`;
    ctx.strokeStyle = 'rgba(255,90,67,0.55)';
    ctx.lineWidth = 1;
    for (const g of run.world.query('guard')) {
      for (const p of run.guardVision(g)) {
        ctx.fillRect(p.x * TILE, p.y * TILE, TILE, TILE);
        ctx.strokeRect(p.x * TILE + 1.5, p.y * TILE + 1.5, TILE - 3, TILE - 3);
      }
    }
  }

  private drawEntities(run: Run): void {
    const { world } = run;
    const list = world.query('renderable', 'position').sort((a, b) => world.req(a, 'renderable').layer - world.req(b, 'renderable').layer);
    for (const e of list) {
      const r = world.req(e, 'renderable');
      const p = world.req(e, 'position');
      const px = p.x * TILE;
      const py = p.y * TILE;
      switch (r.sprite) {
        case 'player':
          if (run.invulnerableMs > 0 && Math.floor(this.time / 120) % 2 === 0) break;
          this.drawPlayer(px, py, run.facing);
          break;
        case 'delorean':
          this.drawDelorean(px, py, run.installed.length);
          break;
        case 'guard': {
          const g = world.req(e, 'guard');
          this.drawGuard(px, py, g.facing, g.stunnedMs > 0);
          break;
        }
        case 'npc': {
          const npc = world.req(e, 'npc');
          this.drawNpc(px, py, r.tint ?? '#888', npc.solved);
          break;
        }
        case 'crate':
          this.drawCrate(px, py, stateId(world.req(e, 'timeObject').state));
          break;
        case 'component': {
          const pickup = world.get(e, 'pickup');
          const item = pickup?.payload.type === 'item' ? pickup.payload.item : null;
          this.drawGear(px + 12, py + 12, 7, item ? isPristine(item) : true);
          break;
        }
        case 'shard':
          this.drawShard(px, py);
          break;
        case 'blueprint':
          this.drawBlueprint(px, py);
          break;
        default:
          break; // bridges and gates are drawn as tiles
      }
    }
  }

  private drawPlayer(px: number, py: number, facing: Dir): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px + 5, py + 20, 14, 3);
    ctx.fillStyle = '#e8e8e8'; // lab coat
    ctx.fillRect(px + 6, py + 10, 12, 11);
    ctx.fillStyle = '#3a4a6a';
    ctx.fillRect(px + 7, py + 19, 4, 4);
    ctx.fillRect(px + 13, py + 19, 4, 4);
    ctx.fillStyle = '#d9a77a';
    ctx.fillRect(px + 7, py + 2, 10, 9);
    ctx.fillStyle = '#ededed'; // wild white hair
    ctx.fillRect(px + 5, py + 1, 14, 3);
    ctx.fillRect(px + 5, py + 1, 2, 6);
    ctx.fillRect(px + 17, py + 1, 2, 6);
    ctx.fillStyle = C.accent; // goggles
    ctx.fillRect(px + 8, py + 5, 3, 2);
    ctx.fillRect(px + 13, py + 5, 3, 2);
    const d = DIRS[facing];
    ctx.fillStyle = C.accent;
    ctx.fillRect(px + 11 + d.x * 10, py + 11 + d.y * 10, 2, 2);
  }

  private drawDelorean(px: number, py: number, installed: number): void {
    const { ctx } = this;
    const glow = 0.25 + 0.15 * Math.sin(this.time / 200) + installed * 0.12;
    ctx.fillStyle = `rgba(63,224,208,${glow})`;
    ctx.fillRect(px - 2, py + 2, TILE + 4, TILE - 2);
    ctx.fillStyle = '#b8c0c8';
    ctx.fillRect(px + 1, py + 9, 22, 9);
    ctx.fillStyle = '#8a929a';
    ctx.fillRect(px + 6, py + 5, 11, 5);
    ctx.fillStyle = '#1d2a33';
    ctx.fillRect(px + 7, py + 6, 9, 3);
    ctx.fillStyle = '#111';
    ctx.fillRect(px + 3, py + 17, 5, 4);
    ctx.fillRect(px + 16, py + 17, 5, 4);
    ctx.fillStyle = C.danger;
    ctx.fillRect(px + 1, py + 11, 2, 2);
    // spark if broken
    if (installed < 4 && Math.floor(this.time / 300) % 3 === 0) {
      ctx.fillStyle = C.gold;
      ctx.fillRect(px + 18, py + 4, 2, 2);
      ctx.fillRect(px + 20, py + 2, 1, 1);
    }
  }

  private drawGuard(px: number, py: number, facing: Dir, stunned: boolean): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px + 5, py + 20, 14, 3);
    ctx.fillStyle = '#26365e'; // Guardia Civil uniform
    ctx.fillRect(px + 6, py + 10, 12, 11);
    ctx.fillStyle = '#f0e6d0';
    ctx.fillRect(px + 6, py + 14, 12, 2);
    ctx.fillStyle = '#c49a6c';
    ctx.fillRect(px + 8, py + 4, 8, 7);
    ctx.fillStyle = '#111'; // tricorne-style hat
    ctx.fillRect(px + 5, py + 2, 14, 4);
    ctx.fillStyle = '#4a3220'; // rifle
    const d = DIRS[facing];
    if (d.x !== 0) ctx.fillRect(px + 12 + d.x * 4, py + 12, d.x * 10, 2);
    else ctx.fillRect(px + 18, py + (d.y > 0 ? 12 : 2), 2, 10);
    if (stunned) this.text('?', px + 12, py - 10, 12, C.gold, 'center', true);
  }

  private drawNpc(px: number, py: number, tint: string, solved: boolean): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px + 5, py + 20, 14, 3);
    ctx.fillStyle = tint;
    ctx.fillRect(px + 6, py + 10, 12, 11);
    ctx.fillStyle = '#efe4cc';
    ctx.fillRect(px + 7, py + 19, 4, 4);
    ctx.fillRect(px + 13, py + 19, 4, 4);
    ctx.fillStyle = '#b07c54';
    ctx.fillRect(px + 7, py + 3, 10, 8);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(px + 7, py + 2, 10, 2);
    ctx.fillStyle = '#d4202c'; // Katipunan red headband
    ctx.fillRect(px + 6, py + 4, 12, 2);
    const bob = Math.sin(this.time / 250) * 2;
    if (!solved) this.text('!', px + 12, py - 12 + bob, 14, C.gold, 'center', true);
    else this.text('✓', px + 12, py - 12, 11, C.ok, 'center', true);
  }

  private drawCrate(px: number, py: number, state: string): void {
    const { ctx } = this;
    if (state === 'unsealed') {
      ctx.fillStyle = '#5a3d22';
      ctx.fillRect(px + 3, py + 8, 18, 13);
      ctx.fillStyle = '#2a1c10';
      ctx.fillRect(px + 5, py + 10, 14, 9);
      ctx.fillStyle = '#8a6440';
      ctx.fillRect(px + 2, py + 3, 18, 3);
      return;
    }
    const rotted = state === 'rotted';
    ctx.fillStyle = rotted ? '#4a4030' : '#9a6c3c';
    ctx.fillRect(px + 3, py + 4, 18, 17);
    ctx.fillStyle = rotted ? '#2e281c' : '#6b4726';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 5, 16, 15);
    if (rotted) {
      ctx.fillStyle = '#1e1a12';
      ctx.fillRect(px + 8, py + 8, 6, 4);
      ctx.fillRect(px + 12, py + 14, 5, 3);
      ctx.fillStyle = '#6f7d3a';
      ctx.fillRect(px + 4, py + 18, 6, 2);
    } else {
      ctx.beginPath();
      ctx.moveTo(px + 5, py + 6);
      ctx.lineTo(px + 19, py + 19);
      ctx.moveTo(px + 19, py + 6);
      ctx.lineTo(px + 5, py + 19);
      ctx.stroke();
      ctx.fillStyle = '#ccc';
      for (const [dx, dy] of [[5, 6], [18, 6], [5, 18], [18, 18]]) ctx.fillRect(px + dx, py + dy, 1, 1);
    }
  }

  private drawGear(cx: number, cy: number, r: number, pristine: boolean): void {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(this.time / 180);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = pristine ? `rgba(63,224,208,${0.15 + pulse * 0.25})` : `rgba(255,90,67,${0.15 + pulse * 0.25})`;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(this.time / 900);
    ctx.fillStyle = pristine ? '#bfe9e4' : '#c9a49b';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-1.5, -r - 2, 3, 4);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pristine ? C.accent : C.danger;
    ctx.beginPath();
    ctx.arc(0, 0, r / 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (!pristine) {
      ctx.strokeStyle = '#3a0d08';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - r + 1, cy - 2);
      ctx.lineTo(cx - 1, cy + 1);
      ctx.lineTo(cx + 2, cy - 3);
      ctx.lineTo(cx + r - 1, cy + 2);
      ctx.stroke();
    }
  }

  private drawShard(px: number, py: number): void {
    const { ctx } = this;
    const bob = Math.sin(this.time / 220 + px) * 2;
    ctx.fillStyle = 'rgba(255,79,163,0.25)';
    ctx.beginPath();
    ctx.arc(px + 12, py + 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.magenta;
    ctx.beginPath();
    ctx.moveTo(px + 12, py + 3 + bob);
    ctx.lineTo(px + 18, py + 12 + bob);
    ctx.lineTo(px + 12, py + 21 + bob);
    ctx.lineTo(px + 6, py + 12 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd1e8';
    ctx.fillRect(px + 10, py + 9 + bob, 2, 4);
  }

  private drawBlueprint(px: number, py: number): void {
    const { ctx } = this;
    const bob = Math.sin(this.time / 260) * 1.5;
    ctx.fillStyle = '#2a5db0';
    ctx.fillRect(px + 4, py + 5 + bob, 16, 14);
    ctx.strokeStyle = '#cfe2ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 6.5, py + 7.5 + bob, 11, 9);
    ctx.beginPath();
    ctx.arc(px + 12, py + 12 + bob, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#9fc2ff';
    ctx.fillRect(px + 16, py + 4 + bob, 4, 4);
  }

  private drawScanner(run: Run): void {
    const { ctx, } = this;
    const { world } = run;
    const targets: Entity[] = [];
    for (const e of world.query('pickup', 'position')) {
      if (world.req(e, 'pickup').payload.type === 'item') targets.push(e);
    }
    for (const e of world.query('timeObject', 'position')) {
      if (world.req(e, 'timeObject').contents?.type === 'item') targets.push(e);
    }
    for (const e of world.query('npc', 'position')) {
      const npc = world.req(e, 'npc');
      if (npc.holds && !npc.solved) targets.push(e);
    }
    const r = 10 + ((this.time / 40) % 14);
    ctx.strokeStyle = `rgba(63,224,208,${1 - (r - 10) / 14})`;
    ctx.lineWidth = 2;
    for (const e of targets) {
      const p = world.req(e, 'position');
      ctx.beginPath();
      ctx.arc(p.x * TILE + 12, p.y * TILE + 12, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawTimePressure(run: Run): void {
    const f = run.timer.fraction;
    if (f > 0.15) return;
    const pulse = 0.08 + 0.08 * Math.sin(this.time / 150);
    this.ctx.fillStyle = `rgba(200,20,10,${pulse})`;
    this.ctx.fillRect(0, 0, MAP_PX_W, MAP_PX_H);
  }

  // ================================================================ HUD

  private drawHud(run: Run): void {
    const { ctx } = this;
    const x = MAP_PX_W;
    this.panel(x, 0, HUD_W, CANVAS_H);
    const left = x + 14;
    const right = x + HUD_W - 14;
    this.text('CHRONO KATIPUNAN', left, 12, 13, C.gold, 'left', true);
    this.text(run.level.district, left, 30, 11, C.dim);

    // Countdown
    const low = run.timer.fraction < 0.15;
    this.text('UNTIL THE CRY OF PUGAD LAWIN', left, 52, 10, C.dim);
    this.text(run.timer.format(), left, 66, 30, low ? C.danger : C.accent, 'left', true);
    ctx.fillStyle = '#2e2219';
    ctx.fillRect(left, 102, HUD_W - 28, 6);
    ctx.fillStyle = low ? C.danger : C.accent;
    ctx.fillRect(left, 102, (HUD_W - 28) * run.timer.fraction, 6);

    // Hearts and charges
    this.text('COVER', left, 118, 10, C.dim);
    let hx = left;
    for (let i = 0; i < run.maxHearts; i++) {
      this.text('♥', hx, 131, 18, i < run.hearts ? C.danger : '#3b2a22');
      hx += 20;
    }
    this.text('TEMPORAL CHARGE', left + 110, 118, 10, C.dim);
    for (let i = 0; i < run.maxCharges; i++) {
      ctx.fillStyle = i < run.charges ? C.magenta : '#3b2a33';
      ctx.fillRect(left + 110 + i * 15, 134, 11, 16);
    }

    // DeLorean assembly
    this.text('DELOREAN ASSEMBLY', left, 164, 10, C.dim);
    let y = 180;
    for (const id of COMPONENT_IDS) {
      const installed = run.installed.includes(id);
      const carried = run.inventory.items.find((i) => i.componentId === id);
      let mark = '·';
      let color = C.faint;
      let status = 'missing';
      if (installed) {
        mark = '✓';
        color = C.ok;
        status = 'installed';
      } else if (carried && !isPristine(carried)) {
        mark = '!';
        color = C.danger;
        status = 'cracked';
      } else if (carried) {
        mark = '■';
        color = C.accent;
        status = 'carried';
      }
      this.text(mark, left, y, 13, color, 'left', true);
      this.text(COMPONENT_NAMES[id], left + 16, y, 12, installed || carried ? C.ink : C.dim);
      this.text(status, right, y, 10, color, 'right');
      y += 19;
    }

    // Inventory
    this.text('SATCHEL (1-8 select)', left, 262, 10, C.dim);
    const slot = 54;
    for (let i = 0; i < run.inventory.capacity; i++) {
      const sx = left + (i % 4) * (slot + 5);
      const sy = 278 + Math.floor(i / 4) * (slot + 5);
      const selected = i === run.inventory.selected;
      ctx.fillStyle = '#16100c';
      ctx.fillRect(sx, sy, slot, slot);
      ctx.strokeStyle = selected ? C.accent : C.panelEdge;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, slot - 1, slot - 1);
      this.text(String(i + 1), sx + 4, sy + 3, 9, C.faint);
      const item: Item | undefined = run.inventory.items[i];
      if (item) this.drawGear(sx + slot / 2, sy + slot / 2 + 2, 10, isPristine(item));
    }
    const sel = run.inventory.selectedItem;
    this.paragraph(
      sel ? `${sel.name}${isPristine(sel) ? '' : ' (cracked: press R)'}` : 'Empty slot',
      left, 400, HUD_W - 28, 11, sel ? C.ink : C.faint, 14,
    );

    // Controls
    const help: [string, string][] = [
      ['WASD', 'move'],
      ['E', 'talk / install'],
      ['R', 'rewind time'],
      ['F', 'fast-forward'],
      ['1-8', 'select item'],
    ];
    y = 444;
    this.text('CONTROLS', left, y, 10, C.dim);
    y += 16;
    for (const [k, v] of help) {
      this.text(k, left, y, 11, C.accent);
      this.text(v, left + 50, y, 11, C.dim);
      y += 15;
    }
    this.text('Red tiles: patrol sight', left, y + 4, 10, '#d9786a');
  }

  private drawLog(run: Run): void {
    this.panel(0, MAP_PX_H, MAP_PX_W, LOG_H);
    const maxLines = 5;
    // Walk back from the newest message, wrapping each, until the panel is full.
    const rows: { text: string; color: string; bullet: boolean }[] = [];
    for (let i = run.messages.length - 1; i >= 0 && rows.length < maxLines; i--) {
      const m = run.messages[i];
      const age = run.messages.length - 1 - i;
      const fresh = age === 0 && run.elapsedMs - m.at < 1500;
      const color = age === 0 ? (fresh ? C.gold : C.ink) : age <= 2 ? C.dim : C.faint;
      const lines = this.wrap(m.text, MAP_PX_W - 44, 12);
      for (let li = lines.length - 1; li >= 0 && rows.length < maxLines; li--) {
        rows.unshift({ text: lines[li], color, bullet: li === 0 && age === 0 });
      }
    }
    rows.forEach((r, i) => {
      const y = MAP_PX_H + 12 + i * 20;
      if (r.bullet) this.text('›', 12, y, 12, C.accent, 'left', true);
      this.text(r.text, 26, y, 12, r.color);
    });
  }

  private drawDialogue(run: Run): void {
    const dlg = run.dialogue!;
    const npc = run.world.req(dlg.npc, 'npc');
    const profile = profileById(npc.profileId);
    const { ctx } = this;
    ctx.fillStyle = 'rgba(8,5,3,0.72)';
    ctx.fillRect(0, 0, MAP_PX_W, MAP_PX_H);
    const w = 620;
    const h = 380;
    const x = (MAP_PX_W - w) / 2;
    const y0 = (MAP_PX_H - h) / 2;
    this.panel(x, y0, w, h, profile.color);
    ctx.fillStyle = profile.color;
    ctx.fillRect(x + 2, y0 + 2, 6, h - 4);
    this.text(profile.name, x + 24, y0 + 18, 18, C.gold, 'left', true);
    this.text(profile.title, x + 24, y0 + 42, 12, C.dim);
    if (npc.holds && !npc.solved) this.text('⚙ holds a DeLorean component', x + w - 20, y0 + 20, 11, C.accent, 'right');

    let y = y0 + 70;
    if (!dlg.result) {
      y = this.paragraph(`"${profile.greeting}"`, x + 24, y, w - 48, 13, C.dim);
      y += 8;
      y = this.paragraph(dlg.question.prompt, x + 24, y, w - 48, 14, C.ink);
      y += 10;
      dlg.question.choices.forEach((choice, i) => {
        const struck = dlg.struck === i;
        const lines = this.wrap(choice, w - 90, 13);
        this.text(`${i + 1}`, x + 30, y, 13, struck ? C.faint : C.gold, 'left', true);
        lines.forEach((l, li) => {
          this.text(l, x + 56, y + li * 18, 13, struck ? C.faint : C.ink);
          if (struck) {
            ctx.fillStyle = C.faint;
            ctx.fillRect(x + 56, y + li * 18 + 8, ctx.measureText(l).width, 1);
          }
        });
        y += lines.length * 18 + 8;
      });
      this.text(
        `Press 1-${dlg.question.choices.length} to answer  ·  Esc to leave  ·  wrong answers cost 5 min`,
        x + w / 2, y0 + h - 26, 11, C.dim, 'center',
      );
    } else {
      this.text(dlg.result.correct ? 'CORRECT' : 'WRONG', x + 24, y, 16, dlg.result.correct ? C.ok : C.danger, 'left', true);
      y += 30;
      const [first, ...rest] = dlg.result.text.split('\n');
      y = this.paragraph(first, x + 24, y, w - 48, 13, C.ink);
      for (const line of rest) {
        y += 8;
        const isFact = line === dlg.question.fact;
        y = this.paragraph(isFact ? `History: ${line}` : line, x + 24, y, w - 48, 13, isFact ? C.accent : C.gold);
      }
      this.text('Press E to continue', x + w / 2, y0 + h - 26, 12, C.dim, 'center');
    }
  }
}
