# AGENTS.md

Single-page Vue 3 + Three.js WebGL2 app: a 3D boid flock attacking a defending target. No backend, router, state library, linter, or typechecker. Unit tests use Node's built-in test runner.

## Commands

```bash
npm install
npm run dev        # Vite dev server, usually http://localhost:5173
npm run build      # output in dist/ (gitignored)
npm run preview    # serve the production build
npm test           # node --test over tests/unit
```

- There is no lint or typecheck script. Verify changes with `npm test && npm run build`, plus manual inspection in a WebGL2 browser when touching rendering or the frame loop.
- The >500 kB chunk warning on build is expected (Three.js); it is not a failure.
- Requires Node 22+ and a browser with hardware-accelerated WebGL2. Headless/software rendering can fail to initialize.

## Architecture

```text
src/lib/constants.js      Constants, STATE, DEFAULT_PARAMS, RETREAT_CHARGE.
src/lib/random.js         Seedable PRNG: createRandom(seed) / createRange.
src/lib/spatialGrid.js    Uniform spatial grid with counting sort.
src/lib/sectors.js        SECTOR_DIRS + SectorGame (congestion game).
src/lib/commandChain.js   Codes, squad leaders, commander and reliefs.
src/lib/defense.js        Directional shield, pulse charge and trigger.
src/lib/steering.js       Per-bird neighbors, boids, FSM and integration
                          (the hot path; keep typed arrays and no allocation).
src/lib/flock3d.js        Orchestrator + public simulation API. No Vue/Three.
src/lib/palette.js        Shared squad palette for render and HUD.
src/lib/birdScene.js      Three.js only: instancing, GLSL bird shader, shield,
                          pulses, labels, camera. Consumes getRenderState().
src/composables/useBoids.js  Bridge: constructs Flock3D + BirdScene, runs the
                          requestAnimationFrame loop, watches Vue params/count,
                          handles pointer picking, publishes stats.
src/App.vue               HUD, panel, sliders, command-chain display.
src/App.css               Scoped App styles.
src/main.js               Vue entrypoint.
```

Keep the separation: simulation changes belong in `flock3d.js` or its systems (`steering`, `sectors`, `defense`, `commandChain`, `spatialGrid`); Three.js/material changes belong in `birdScene.js`. `birdScene.js` imports constants through `flock3d.js` re-exports and the palette from `palette.js`.

## Non-obvious invariants

- **One-shot event queues**: `pendingImpacts`, `pendingBlocks`, `pendingLeaderDowns` (in `Flock3D`) and `pendingPulses` (in `DefenseSystem`) are drained only by `BirdScene.update()` via `sim.consumeImpacts()`, `consumeBlocks()`, `consumePulses()` and `consumeLeaderDowns()`. Never consume them elsewhere; a second consumer silently swallows the effects. Impact/block totals live on `BirdScene` (`totalImpacts`, `totalBlocks`), not on `Flock3D`.
- **Pulse leader snapshot**: `Flock3D._triggerPulse()` captures `CommandChain.leaderSet()` at pulse start and only downs those birds. This prevents promotion cascades. Preserve it when touching leader logic; `tests/unit/flock3d.test.js` covers it.
- **Staggered game updates**: only birds in `DISTRIBUTE`/`STAGE` replan their sector, each on its own 1–2.5 s timer with 0.12 hysteresis (`SectorGame.bestResponse`). Do not replan every bird every frame (`O(n·18)`).
- **Fixed allocation**: all typed arrays are sized to `MAX_BOIDS` (5000) once; `count` is just the active prefix. `setCount()` respawns only newly added indices and does not shrink/reinitialize existing ones.
- **dt caps**: `useBoids.frame()` clamps frame dt to 0.05 s for simulation/animation, and `Flock3D.update()` clamps its step to 0.04 s. FPS must use the raw frame delta.
- **Determinism**: simulation code must use `this.random`/`this.rand`, not `Math.random`. Tests and bug repros pass `new Flock3D({ seed })` or `{ rng }`.
- **Shared palette**: `src/lib/palette.js` is the single source for squad colors used by `birdScene.js` and `App.vue`.
- **New adjustable parameter**: add the default to `DEFAULT_PARAMS` (`constants.js`), mirror it in the reactive `params` object in `useBoids.js`, and add a slider entry to `controls` in `App.vue`. The deep watcher copies params onto the simulation automatically.
- `window.__boids = { simulation, scene }` exists only under `import.meta.env.DEV`; it is absent from production builds.

## Conventions

- All user-facing copy, code comments, README, and git commit messages are in **Spanish**. Keep new text consistent.
- Project skills are installed in `.opencode/skill/` (mirrored in `.claude/skills/`). They are generic and some assume a changelog workflow or extra runners this repo does not have; the repo-specific rules in this file take precedence over their defaults (e.g. Spanish instead of their English default).
- `README.md` is the authoritative design/algorithm document. Update it when behavior, parameters, defaults or the module layout change.
- Debug from the dev console with `__boids.simulation.getStateCounts()`, `getCommandInfo()`, `getCode(i)`, and `__boids.scene.totalImpacts` / `totalBlocks`.

## Don't be misled by

- `.opencode/` and `.claude/` are installed generic skill collections (their `README.md` documents the catalog). They are not app code.
- `dist/` is a stale-by-default build artifact and is gitignored.
