# Improvement Tracking

## Open

| ID | Improvement | Importance | Area | Detected | Technique |
|----|-------------|------------|------|----------|-----------|
| A-14 | Split `birdScene.js` (1039 lines) into bird shader/geometry, effects (shield, pulses, sparks, ripples), command labels and camera/controls. | High | `src/lib/birdScene.js` | Pass 2 | Extract Class / Extract Module |
| A-15 | Decompose `SteeringSystem.step` (~250 lines) and `_updateBehavior` (~170) into smaller phases while preserving the typed-array hot path; benchmark before/after. | Medium | `src/lib/steering.js` | Pass 2 | Extract Method (hot-path aware) |
| A-16 | Extract the tuning weights and thresholds still inline in the sector game and steering loop into named constants or a tuning config. | Medium | `src/lib/sectors.js`, `src/lib/steering.js` | Pass 2 | Replace Magic Number with Symbolic Constant |
| A-18 | Add coverage reporting (`node --test --experimental-test-coverage`) and a 5000-bird benchmark script; keep the benchmark out of the fast CI gate. | Low | `package.json`, `tests/`, `scripts/` | Pass 2 | Coverage/perf guard |

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
