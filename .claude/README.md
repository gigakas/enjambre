# Generic Skills — Claude Code

Skills genéricos agnósticos de lenguaje para **Claude Code**. Contenido idéntico a la variante de opencode; solo cambia el formato de cada herramienta.

## Cómo usar

Copia `.claude/` a la raíz del proyecto:

```bash
cp -r .claude /ruta/a/tu/proyecto/
```

Claude Code detecta los skills automáticamente y los invoca cuando la tarea coincide con su `description`. No necesitas configuración adicional.

## Skills incluidos (8)

| Skill | Cubre |
|---|---|
| `refactoring` | Code smells y técnicas de refactoring; umbrales de tamaño por lenguaje |
| `design-patterns` | Los 22 patrones GoF: creacionales, estructurales, de comportamiento |
| `test-driven-development` | TDD: ciclo red/green/refactor y tests de caracterización |
| `testing-patterns` | Estructura AAA, FIRST, test doubles y test smells |
| `solid-principles` | Principios SOLID (SRP, OCP, LSP, ISP, DIP) |
| `documentation` | README, ADR, API docs, runbooks, guías, diagramas y docstrings |
| `multi-agent-changelog` | Changelog multi-agente: `changelog.d/<AGENT>/` + `CHANGELOG.md` |
| `code-audit` | Auditoría: `auditory.md` (deltas) + `track_auditory.md` (mejoras) |

## Testing en cuatro capas

El skill `testing-patterns` incluye `references/test-strategy.md`, que define las cuatro capas que usa la colección:

| Capa | Qué prueba | Cuándo |
|---|---|---|
| **Unit** | Una regla/función aislada, sin I/O real | En cada edición y commit |
| **Integration** | Componentes reales (DB, cola, HTTP) | Pull request / pre-push |
| **System** | La app completa en un entorno tipo producción | Main, nightly, pre-release |
| **Regression** | Comportamiento que ya funcionaba y no debe romperse | Cada PR y antes de release |

Cada instalación incluye un runner que detecta el stack y ejecuta la capa pedida:

```bash
./.claude/scripts/test.sh unit      # unitarios
./.claude/scripts/test.sh pr        # unit + integration + regression
./.claude/scripts/test.sh all       # las cuatro capas
```

Variables: `TEST_UNIT_CMD`, `TEST_INTEGRATION_CMD`, `TEST_SYSTEM_CMD`, `TEST_REGRESSION_CMD`, `TEST_TIMEOUT`, `TEST_STRICT=1`, `PYTHON_BIN`. Las capas sin comando se omiten; con `TEST_STRICT=1` fallan.

## Comando `/audit`

La colección incluye un comando manual de auditoría:

```bash
/audit src/orders --checks
/audit . --tests
/audit src/payments --mutation
```

Genera un snapshot en `docs/audit/reports/YYYY-MM-DD-pass-N.md`, actualiza `docs/audit/auditory.md` con el delta y añade sugerencias priorizadas a `docs/audit/track_auditory.md`.

## Nota

Esta colección **no incluye hooks de framework** (los hooks de la colección Frappe son específicos: `bench migrate`). Si querés un changelog multi-agente, usá el skill `multi-agent-changelog`: escribe fragmentos en `changelog.d/<AGENT>/` y consolida en `CHANGELOG.md` con el formato `[AC]/[OC]`.
