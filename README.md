# Chrono Katipunan

A 2D roguelike with time-manipulation and history puzzles, written in TypeScript on HTML5 Canvas.

You're an inventor whose homemade DeLorean's first jump lands in Fort Santiago on the night of
**29 December 1896**, the eve of José Rizal's execution. Rizal teaches you to use the machine.
When you leave, the flux condenser slips and strands you on **23 August 1896**, two hours before
the Cry of Pugad Lawin starts the Philippine Revolution, and you keep reliving those two hours.
Each loop scatters the DeLorean's four components across a procedurally generated district.
Rewind and fast-forward the world, earn the trust of Katipunan figures with what you know of
their history, avoid the Guardia Civil, and rebuild the DeLorean to break the loop.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm test           # vitest suite
```

## The tutorial: Fort Santiago, 29 December 1896

New players start here (press **T** on the workshop screen to replay it, **N** to skip it).
Dr. José Rizal walks you through nine steps, one mechanic each: talking, absorbing a chronoton
shard, rewinding the moat bridge, rewinding a nailed crate, fast-forwarding a padlocked gate,
repairing a cracked component, answering a history question, sneaking past a sentry, and
installing the parts. There's no clock, wrong answers and sightings cost nothing, and Rizal
tops up your charge if you run dry. Finishing it the first time pays 10 chronotons and drops
you straight into the first loop.

Rizal knows a little too much. Pay attention to what he says.

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

* The countdown reaches zero: 2 in-game hours that pass in **5 real minutes** (the HUD shows
  both clocks), or
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
    TutorialLevel.ts      Hand-built Fort Santiago map for the lesson
  puzzles/
    PuzzleSystem.ts       Timeline-based rewind/fast-forward for objects and items; knowledge checks
    HistoryData.ts        Question bank, historical NPC profiles, Rizal's tutorial questions
  game/
    Run.ts                One loop (or the lesson): movement, interaction, patrols, detection, win/lose
    Tutorial.ts           The nine lesson steps and Rizal's lines
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

The lesson draws on Rizal's last night: he was held in Fort Santiago and shot at Bagumbayan on
30 December 1896. He left his final poem untitled and smuggled it out in a small alcohol stove
given to his sister Trinidad; it was named *Mi Último Adiós* only after his death. His other
questions cover La Liga Filipina (3 July 1892) and *Noli Me Tángere* (Berlin, 1887).

Questions in the loop draw on the record of the Katipunan: the three membership degrees and their passwords
(*Anak ng Bayan*, *GOMBURZA*, *Rizal*), the founding on 7 July 1892 in Tondo, Emilio Jacinto's
*Kartilya*, the newspaper *Kalayaan*, Teodoro Patiño's disclosure to Fr. Mariano Gil on
19 August 1896, Pío Valenzuela's mission to Rizal in Dapitan, and the tearing of the *cédulas*.
The exact date and site of the Cry is still debated (Pugad Lawin, Balintawak, Bahay Toro;
23-26 August); the game uses 23 August at Pugad Lawin.
