# Audit History

## Pass 1 — 2026-11-10 — OC — baseline

**Scope**: `.` (repository root; production app code in `src/`)
**Objective**: establish a baseline before any refactoring; no source changes in this pass.
**Snapshot**: `docs/audit/reports/2026-11-10-pass-1.md`

| Metric | Value |
|--------|-------|
| Source files (repo snapshot) | 10 |
| Source lines (repo snapshot) | 4981 |
| Non-blank source lines (repo snapshot) | 4457 |
| App source files (`src/` + `vite.config.js`) | 7 |
| App source lines | 3725 |
| App non-blank source lines | 3293 |
| Project doc files (`README.md`, `AGENTS.md`) | 2 |
| Project doc lines | 584 |
| TODO/FIXME/HACK/XXX (app) | 0 |
| Largest app file | `src/lib/flock3d.js` (1259 lines) |
| Git churn (90d) | `README.md` 2 changes; 9 files 1 change each |
| Cyclomatic complexity | n/a (no JS complexity tool configured) |
| Code smells | 9 |
| Duplication | n/a (`jscpd` not installed) |
| Test coverage | n/a (no suite; 0 tests, 3 layers skipped) |
| Open improvements | 13 |

**Notes**

- The raw snapshot counts the four installed tooling scripts under `.opencode/` and `.claude/` (two `audit.sh` + two `test.sh`), which inflates source files/lines. The **App source** rows are the production-code baseline measured with `wc` over `src/` + `vite.config.js`; use those for deltas.
- `TODO/FIXME/HACK/XXX` is 0 in app code; the snapshot's 6 occurrences come from the tooling scripts.
- `.opencode/scripts/test.sh pr` was executed manually: `0 passed, 0 failed, 3 skipped` (no `tests/<layer>/` or `TEST_*_CMD`).
- No lint or typecheck was run: `package.json` has no lint/test/typecheck scripts and there is no ESLint or TypeScript config.
- No Critical findings: the app has no authentication, persistence, network API, or user-generated HTML.

## Pass 2 — 2026-11-10 — OC — safety net + modularización

**Scope**: `.` (repository root; production app code in `src/`)
**Objective**: ejecutar el refactor priorizado: tests, RNG determinista, separación de responsabilidades y correcciones de bajo riesgo.
**Snapshot**: `docs/audit/reports/2026-11-10-pass-2.md`

| Metric | Previous | Current | Delta |
|--------|----------|---------|-------|
| Source files (repo snapshot) | 10 | 20 | +10 |
| Source lines (repo snapshot) | 4981 | 4799 | -182 |
| Non-blank source lines (repo snapshot) | 4457 | 4307 | -150 |
| App source files (`src/` + `vite.config.js`) | 7 | 16 | +9 |
| App source lines | 3725 | 4221 | +496 |
| App non-blank source lines | 3293 | 3743 | +450 |
| Project doc files (`README.md`, `AGENTS.md`) | 2 | 2 | 0 |
| Project doc lines | 584 | 613 | +29 |
| TODO/FIXME/HACK/XXX (app) | 0 | 0 | 0 |
| Largest app file | 1259 | 1039 | -220 |
| Git churn (90d) | README 2; 9 files 1 | same (new files uncommitted) | n/a |
| Cyclomatic complexity | n/a | n/a | n/a |
| Code smells | 9 | 5 | -4 |
| Duplication | n/a | n/a | n/a |
| Test coverage | n/a (0 tests) | n/a (12 tests) | n/a |
| Open improvements | 13 | 4 | -9 |

**Verification**

- `npm test`: 12 passed, 0 failed.
- `npm run build`: passed; the >500 kB chunk warning remains expected.
- Browser smoke test at `http://127.0.0.1:5173/`: no console errors; click sets a target, the FSM reaches attack/retreat/evade, impacts and blocks increment, and the command log renders.
- Performance smoke, 5000 birds, 60 steps: ~31.0 ms/step vs ~30.4 ms/step for the pre-refactor file (~2% overhead). Within the README's dense-cluster range; no performance gate was added.

**Resolved**: A-01 through A-13, plus A-17 (duplicated `clamp` and squad palette). **New open**: A-14, A-15, A-16 and A-18.

**Remaining smells** (5)

- Large file/class: `birdScene.js` (1039 lines).
- Large file: `steering.js` (553) and `flock3d.js` (503), both just over the 500-line hard limit.
- Long method: `SteeringSystem.step` (~250 lines) and `_updateBehavior` (~170).
- Magic numbers: tuning weights and thresholds still inline in `sectors.js` and `steering.js`.
- Test coverage is not measured; the suite is still small relative to the simulation surface.

## Pass 3 — 2026-11-11 — OC — combate + i18n integrados

**Scope**: `.` (repository root; production app code in `src/`)
**Objective**: integrar los updates de combate (metralletas, bombas, salud/energía) e i18n (inglés/español) sobre la arquitectura modular, y revisar el resultado.
**Snapshot**: `docs/audit/reports/2026-11-11-pass-3.md`

| Metric | Previous | Current | Delta |
|--------|----------|---------|-------|
| Source files (repo snapshot) | 20 | 22 | +2 |
| Source lines (repo snapshot) | 4799 | 7484 | +2685 |
| Non-blank source lines (repo snapshot) | 4307 | 6765 | +2458 |
| App source files (`src/` + `vite.config.js`) | 16 | 18 | +2 |
| App source lines | 4221 | 7178 | +2957 |
| App non-blank source lines | 3743 | 6432 | +2689 |
| Project doc files (`README.md`, `AGENTS.md`) | 2 | 2 | 0 |
| Project doc lines | 613 | 800 | +187 |
| TODO/FIXME/HACK/XXX (app) | 0 | 0 | 0 |
| Largest app file | 1039 | 1687 | +648 |
| Git churn (90d) | README 2; 9 files 1 | README 2; 11 files 1 | n/a |
| Cyclomatic complexity | n/a | n/a | n/a |
| Code smells | 5 | 8 | +3 |
| Duplication | n/a | n/a | n/a |
| Test coverage | n/a (12 tests) | n/a (14 tests) | n/a |
| Open improvements | 4 | 9 | +5 |

**Verification**

- `npm test`: 14 passed, 0 failed.
- `npm run build`: passed; the >500 kB chunk warning remains expected.
- Browser smoke test at `http://127.0.0.1:5176/`: no console errors; combat starts, cannons fire, bombs launch/detonate, health/energy update, command log renders, and the EN/ES toggle switches the whole UI.
- Performance smoke, 5000 birds, 60 steps: ~30.9 ms/step (similar to the pre-merge ~30.4 ms/step); combat did not add a measurable regression in this scenario.
- The merge commit `91c3e5c` itself contains conflict markers. The working tree was resolved in this pass; the fix still has to be committed.

**Resolved in this pass**: A-20 (CI conflict-marker guard). **New open**: A-19, A-21, A-22, A-23 and A-24.

**Remaining smells** (8)

- Large file/class: `birdScene.js` (1687), `combat.js` (1010) and `App.css` (1191).
- Large files: `flock3d.js` (665) and `steering.js` (636), both over the 500-line hard limit.
- Long methods: `SteeringSystem.step` (~250), `_updateBehavior` (~200), `CombatSystem._updateCannon`, `_updateBombs` and `_planInterceptions`.
- Magic numbers: combat/steering tuning weights and wave timings remain inline.
- Dead constants: `DODGE_TIME`, `COLLISION_RADIUS`, `BOMB_DAMAGE` and `CANNON_COOLDOWN` are exported/imported but not used.
- Incomplete render facade: `BirdScene` still reads several `sim` internals directly and calls `getCombatInfo()` twice per frame.
- Merge hygiene: a broken merge commit entered history; CI does not check for conflict markers.
- Test surface: combat has a smoke test but no focused tests for bomb interception, cannon hits, battle outcomes or i18n log keys.
