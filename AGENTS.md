# AGENTS.md

Single-page Vue 3 + Three.js WebGL2 app: a 3D boid flock attacking a defending target with machine guns, expansion bombs and a bilingual UI. No backend, router, state library, linter, or typechecker. Unit tests use Node's built-in test runner.

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
src/lib/combat.js         Health/energy, two cannons, expansion bombs,
                          dodge/threat state and battle outcome.
src/lib/steering.js       Per-bird neighbors, boids, FSM, dodge and integration
                          (the hot path; keep typed arrays and no allocation).
src/lib/flock3d.js        Orchestrator + public simulation API. No Vue/Three.
src/lib/palette.js        Shared squad palette for render and HUD.
src/lib/birdScene.js      Three.js only: instancing, GLSL bird shader, shield,
                          pulses, cannons, bombs, labels, camera. Consumes
                          getRenderState() + getCombatInfo() + consume* events.
src/i18n.js               English/Spanish dictionaries + t()/locale helpers.
src/composables/useBoids.js  Bridge: constructs Flock3D + BirdScene, runs the
                          requestAnimationFrame loop, watches Vue params/count,
                          handles pointer picking, publishes stats.
src/App.vue               HUD, panel, sliders, command-chain and combat display.
src/App.css               Scoped App styles.
src/main.js               Vue entrypoint.
```

Keep the separation: simulation changes belong in `flock3d.js` or its systems (`steering`, `sectors`, `defense`, `combat`, `commandChain`, `spatialGrid`); Three.js/material changes belong in `birdScene.js`. `birdScene.js` imports constants through `flock3d.js` re-exports and the palette from `palette.js`.

## Non-obvious invariants

- **One-shot event queues**: `pendingImpacts`, `pendingBlocks`, `pendingLeaderDowns` (in `Flock3D`), `pendingPulses` (in `DefenseSystem`) and the combat queues `pendingShots`/`pendingKills`/`pendingCollisions`/`pendingBombs` (in `CombatSystem`) are drained only by `BirdScene.update()` via the matching `sim.consume*()` methods. Never consume them elsewhere; a second consumer silently swallows the effects. Totals such as `totalImpacts`, `totalKills` and `totalShots` live on `BirdScene`, not on `Flock3D`.
- **Pulse leader snapshot**: `Flock3D._triggerPulse()` captures `CommandChain.leaderSet()` at pulse start and only downs those birds. This prevents promotion cascades. Preserve it when touching leader logic; `tests/unit/flock3d.test.js` covers it.
- **Staggered game updates**: only birds in `DISTRIBUTE`/`STAGE` replan their sector, each on its own 1–2.5 s timer with 0.12 hysteresis (`SectorGame.bestResponse`). Do not replan every bird every frame (`O(n·18)`).
- **Fixed allocation**: all typed arrays are sized to `MAX_BOIDS` (5000) once; `count` is just the active prefix. `setCount()` respawns only newly added indices and does not shrink/reinitialize existing ones.
- **dt caps**: `useBoids.frame()` clamps frame dt to 0.05 s for simulation/animation, and `Flock3D.update()` clamps its step to 0.04 s. FPS must use the raw frame delta.
- **Determinism**: simulation code must use `this.random`/`this.rand`, not `Math.random`. Tests and bug repros pass `new Flock3D({ seed })` or `{ rng }`.
- **Dead birds**: `combat.health[i] === 0` means dead. The spatial grid, steering, state counts and sector recomputation must skip dead birds; `respawn()` restores health and clears `downTimers`.
- **Combat state lives in `CombatSystem`**: cannons, bombs, shots, kills, collisions, target health/energy and battle state. `SteeringSystem` reads `flock.combat` for dodge/collision/INTERCEPT behavior; do not duplicate combat state in `Flock3D`.
- **i18n contract**: simulation logs are `{ key, params }` objects, never translated strings; `src/i18n.js` resolves them in the UI. English is the default, Spanish is the toggle.
- **Shared palette**: `src/lib/palette.js` is the single source for squad colors used by `birdScene.js` and `App.vue`.
- **New adjustable parameter**: add the default to `DEFAULT_PARAMS` (`constants.js`), mirror it in the reactive `params` object in `useBoids.js`, and add a slider entry to `controls` in `App.vue`. The deep watcher copies params onto the simulation automatically.
- `window.__boids = { simulation, scene }` exists only under `import.meta.env.DEV`; it is absent from production builds.

## Conventions

- Code comments, README and git commit messages are in **Spanish**. User-facing UI copy is bilingual: add keys to both dictionaries in `src/i18n.js` (English default, Spanish option) instead of hardcoding strings in templates.
- Project skills are installed in `.opencode/skill/` (mirrored in `.claude/skills/`). They are generic and some assume a changelog workflow or extra runners this repo does not have; the repo-specific rules in this file take precedence over their defaults (e.g. Spanish instead of their English default).
- `README.md` is the authoritative design/algorithm document. Update it when behavior, parameters, defaults or the module layout change.
- Debug from the dev console with `__boids.simulation.getStateCounts()`, `getCommandInfo()`, `getCode(i)`, and `__boids.scene.totalImpacts` / `totalBlocks`.

## Don't be misled by

- `.opencode/` and `.claude/` are installed generic skill collections (their `README.md` documents the catalog). They are not app code.
- `dist/` is a stale-by-default build artifact and is gitignored.
