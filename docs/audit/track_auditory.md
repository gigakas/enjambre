# Improvement Tracking

## Open

| ID | Improvement | Importance | Area | Detected | Technique |
|----|-------------|------------|------|----------|-----------|
| A-14 | Split `birdScene.js` (1039 lines) into bird shader/geometry, effects (shield, pulses, sparks, ripples), command labels and camera/controls. | High | `src/lib/birdScene.js` | Pass 2 | Extract Class / Extract Module |
| A-15 | Decompose `SteeringSystem.step` (~250 lines) and `_updateBehavior` (~170) into smaller phases while preserving the typed-array hot path; benchmark before/after. | Medium | `src/lib/steering.js` | Pass 2 | Extract Method (hot-path aware) |
| A-16 | Extract the tuning weights and thresholds still inline in the sector game and steering loop into named constants or a tuning config. | Medium | `src/lib/sectors.js`, `src/lib/steering.js` | Pass 2 | Replace Magic Number with Symbolic Constant |
| A-18 | Add coverage reporting (`node --test --experimental-test-coverage`) and a 5000-bird benchmark script; keep the benchmark out of the fast CI gate. | Low | `package.json`, `tests/`, `scripts/` | Pass 2 | Coverage/perf guard |
| A-19 | Split `combat.js` (1010 lines) into cannon, bomb/interception and battle-state modules; keep `CombatSystem` as the orchestrator. | High | `src/lib/combat.js` | Pass 3 | Extract Class / Extract Module |
| A-21 | Add focused tests for combat: cannon hit/kill, bomb launch/interception/detonation, target-down and swarm-down outcomes, and i18n command-log keys. | High | `tests/unit/`, `src/lib/combat.js` | Pass 3 | TDD / characterization tests |
| A-22 | Cache `getCombatInfo()` once per frame in `BirdScene` and finish the `getRenderState()` facade for leader/defense/marker reads. | Medium | `src/lib/birdScene.js` | Pass 3 | Extract Method / Facade |
| A-23 | Remove unused combat constants (`DODGE_TIME`, `COLLISION_RADIUS`, `BOMB_DAMAGE`, `CANNON_COOLDOWN`) or wire them into the logic instead of literal values. | Low | `src/lib/constants.js`, `src/lib/combat.js` | Pass 3 | Delete Dead Code / Replace Magic Number |
| A-24 | Move the attack-plan reevaluation out of the per-frame combat update into the strategy tick, or add hysteresis to avoid plan/log oscillation. | Low | `src/lib/combat.js:559-571` | Pass 3 | Extract Method / hysteresis |

## Resolved

| ID | Improvement | Importance | Resolved |
|----|-------------|------------|----------|
| A-01 | Add a test harness and unit tests for `Flock3D` (pulse snapshot, command chain, sector counters, FSM). | High | Pass 2 |
| A-02 | Inject a seedable RNG into `Flock3D` for deterministic tests and bug reproductions. | High | Pass 2 |
| A-03 | Split `Flock3D` into spatial grid, sector game, defense, command chain, steering and constants. | High | Pass 2 |
| A-04 | Decompose `Flock3D.update()`; the per-bird loop now lives in `SteeringSystem`. | Medium | Pass 2 |
| A-05 | Compute FPS from the unclamped frame delta. | Medium | Pass 2 |
| A-06 | Reconcile repliegue timing with `RETREAT_CHARGE` and update the README. | Medium | Pass 2 |
| A-07 | Return and render all four command-log entries consistently. | Low | Pass 2 |
| A-08 | Add `getRenderState()` so `BirdScene` consumes a read-only render contract. | Medium | Pass 2 |
| A-09 | Upload only the active instance range with `addUpdateRange`. | Low | Pass 2 |
| A-10 | Extract the `App.vue` stylesheet to `App.css`. | Medium | Pass 2 |
| A-11 | Cover `isLeader()` / `getLeaderIndices()` with tests instead of leaving them unused. | Low | Pass 2 |
| A-12 | Add `engines.node >= 22`, `npm test` and a GitHub Actions CI workflow. | Medium | Pass 2 |
| A-13 | Preserve `minSpeed <= maxSpeed` when the speed slider is at 3. | Low | Pass 2 |
| A-17 | Share the squad palette in `palette.js` and reuse `clamp` instead of duplicating it. | Low | Pass 2 |
| A-20 | Add a conflict-marker guard to CI so a broken merge cannot be committed again. | High | Pass 3 |
