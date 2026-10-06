# Chrono Katipunan

A 2D roguelike with time-manipulation and history puzzles, written in TypeScript on HTML5 Canvas.

You're an inventor whose homemade DeLorean sends you back to **23 August 1896**, two hours
before the Cry of Pugad Lawin starts the Philippine Revolution. The machine is wrecked and its
four components are scattered across a procedurally generated district. Rewind and fast-forward
the world, earn the trust of Katipunan figures with what you know of their history, avoid the
Guardia Civil, and rebuild the DeLorean before the Cry rings out.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm test           # vitest suite
```

## How to play

| Key | Action |
| --- | --- |
| WASD / arrows | Move (hold to keep walking) |
| E / Space | Talk, inspect, install components at the DeLorean |
| R | **Rewind** the adjacent object, or the selected item if nothing is adjacent |
| F | **Fast-forward** the adjacent object |
| 1-8 | Select a satchel slot / answer a question |
| Esc | Leave a conversation |
| B (start screen) | Build the highlighted workshop upgrade |

Each time shift spends one **temporal charge** (pink bars). Chronoton shards recharge you.

### The four components

Every run hides one component in each of these ways. Which component goes where is randomised.

| Lock | Puzzle |
| --- | --- |
| Nailed-shut crate | **Rewind** to before it was sealed. Fast-forwarding rots it; rewind again to recover the contents. |
| Padlocked compound | **Fast-forward** the gate until the lock rusts away. Rewinding only makes the lock shinier. |
| Held by a revolutionary | Answer their history question (Katipunan passwords, founding, the Kartilya, the Cry...). Wrong answers cost 5 minutes. |
| Found cracked | Select it in your satchel and **rewind** its damage before it can be installed. |

The river can only be crossed by **rewinding** one of its collapsed bridges.

### Losing

* The countdown (2 in-game hours, about 6 real minutes) reaches zero, or
* you're spotted by Guardia Civil patrols (red tiles show their sight) too many times. Each
  sighting costs a heart and 10 minutes and sends you back to the DeLorean.

Death is permanent and the next run is a new map. **Chronotons** earned during a run, and any
**blueprints** you found, carry over. Spend them in the DeLorean Workshop on persistent upgrades:
extra charge, more time, a disguise (extra heart), an almanac that strikes out wrong answers,
a scanner that reveals components, or a sundial that slows patrols.

## Architecture

```
src/
  core/
    GameState.ts          Phase state machine: start -> playing -> victory/defeat; meta rewards
    InputController.ts    Keyboard/touch -> Action queue, held-key repeat
    MetaProgress.ts       Persistent blueprints, upgrades and currency (localStorage)
    CountdownTimer.ts     Scaled in-game countdown with penalties/bonuses
    Rng.ts, types.ts      Seeded PRNG (every run reproducible from its seed), shared types
  ecs/
    EntityComponentSystem.ts  World: entities, typed component stores, queries
    components.ts             Position, Renderable, TimeObject, Npc, Guard, Pickup, ...
  world/
    MapGenerator.ts       Procedural district: river, collapsed bridges, houses, locked
                          compound, groves, item/NPC/patrol placement with solvability checks
    TileMap.ts            Tile grid, passability and line-of-sight rules
  puzzles/
    PuzzleSystem.ts       Timeline-based rewind/fast-forward for objects and items; knowledge checks
    HistoryData.ts        Question bank and historical NPC profiles
  game/
    Run.ts                One loop: movement, interaction, patrols, detection, win/lose
    Inventory.ts          Satchel slots and component items
  render/
    Renderer.ts           Procedural pixel-art canvas renderer, HUD, dialogue, screens
  main.ts                 Bootstrap and requestAnimationFrame loop
```

### Solvability

`MapGenerator` only places a solid object or tree if the map stays connected once puzzles are
solved, and if the arrival bank stays fully explorable before any puzzle is solved. The test
suite checks 150 seeds for reachability and has a perfect-play solver (`tests/solver.ts`) win
60 complete runs.

## Historical notes

Questions draw on the record of the Katipunan: the three membership degrees and their passwords
(*Anak ng Bayan*, *GOMBURZA*, *Rizal*), the founding on 7 July 1892 in Tondo, Emilio Jacinto's
*Kartilya*, the newspaper *Kalayaan*, Teodoro Patiño's disclosure to Fr. Mariano Gil on
19 August 1896, Pío Valenzuela's mission to Rizal in Dapitan, and the tearing of the *cédulas*.
The exact date and site of the Cry is still debated (Pugad Lawin, Balintawak, Bahay Toro;
23-26 August); the game uses 23 August at Pugad Lawin.
