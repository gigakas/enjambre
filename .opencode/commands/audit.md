---
description: Audit code quality, record a delta pass, and add prioritized improvements
argument-hint: "[path or module] [--checks] [--tests] [--mutation]"
---

# Code Audit

Audit scope: `$ARGUMENTS` (if empty, use the repository root).

This is a **manual, read-only audit of production code**. You may create or update files under `docs/audit/`; do not modify source code unless the user explicitly asks for fixes after the audit.

## 1. Load the audit rules

Read:

- the `code-audit` skill (metrics, delta format, importance scale, suggestions);
- `refactoring/references/code-smells.md`;
- `refactoring/references/file-responsibility-rules.md`;
- `solid-principles`;
- `design-patterns`;
- `testing-patterns/references/test-strategy.md`;
- `documentation` (for docs drift).

## 2. Prepare the audit folder and snapshot

```bash
mkdir -p docs/audit/reports
PASS=$(( $(grep -c '^## Pass ' docs/audit/auditory.md 2>/dev/null || true) + 1 ))
OUT="docs/audit/reports/$(date -u +%Y-%m-%d)-pass-$PASS.md"
```

Run:

```bash
./.opencode/scripts/audit.sh --scope <scope> --out "$OUT" [--checks] [--tests] [--mutation]
```

- Default: fast static report (size, languages, largest files, churn, tooling).
- `--checks`: lint/type/complexity when the tools exist.
- `--tests`: run the project runner (`scripts/test.sh pr`).
- `--mutation`: inspect mutation-testing tooling; do not run it by default.

If `$ARGUMENTS` contains `--checks`, `--tests`, or `--mutation`, forward it. If the scope is a monorepo, audit the requested module and drill into the highest-risk files.

## 3. Inspect

Read the snapshot and the largest, most-churned, highest-risk files. Evaluate:

- **Correctness**: error handling, null/empty, boundaries, concurrency, money, auth, data loss.
- **Design**: SRP/OCP/LSP/ISP/DIP, coupling, duplication, pattern misuse, speculative generality.
- **Data**: transactions, migrations, idempotency, validation.
- **Tests**: unit/integration/regression coverage; tautological or flaky tests.
- **Docs**: README/ADR/API/runbook drift.
- **Architecture**: dependency direction, cycles, layer violations.

### If the project is Frappe

Also read `frappe-project-triage`, `frappe-doctype-development`, `frappe-api-development`, `frappe-testing`, and `frappe-documentation`. Check:

- DocType `description`, field labels/help, permissions, naming, child tables.
- `ignore_permissions`, `frappe.db.commit`, raw SQL, unbounded `get_all`, synchronous `requests.*`.
- `hooks.py` overrides, scheduler/background jobs, patch idempotency.
- API auth, permissions, rate limits, and error envelopes.
- `bench` deploy/rollback runbook and docs drift.

## 4. Record the pass

Update `docs/audit/auditory.md`:

- If it does not exist, create **Pass 1** as the baseline (no delta).
- Otherwise append `## Pass N — YYYY-MM-DD — <AC|OC>` with the **same metric set** and a `Previous → Current → Delta` table.
- Link the snapshot path.

Update `docs/audit/track_auditory.md`:

- Add suggestions under **Open** with ID (`A-NN`), improvement, importance, area, detected pass, and **technique**.
- Add all Critical/High findings and at least 3–5 suggestions total.
- Move resolved items to **Resolved**.

## 5. Report

Return:

- **Top 5 risks**, most severe first, with file/line references.
- **Top 3–5 suggestions**, with importance and the technique that fixes them.
- **Deltas** vs the previous pass.
- **Not measured / needs a human decision** (be explicit).

Do not claim metrics you did not measure. If a tool was missing, say so.
