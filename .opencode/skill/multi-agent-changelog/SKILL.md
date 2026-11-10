---
name: multi-agent-changelog
description: Maintain a multi-agent CHANGELOG. Write per-agent fragments in changelog.d/<AGENT>/, then consolidate finished tasks into CHANGELOG.md with [AC]/[OC] tags and file-level changes. Use for any task that modifies files, especially when opencode and Claude Code share a repository. Language-agnostic.
---

# Multi-Agent Changelog

Canonical changelog format shared by **opencode (`OC`)**, **Claude Code (`AC`)**, the generic core, and the Frappe pack.

Two artifacts:

1. **`changelog.d/<AGENT>/`** — per-agent fragments written while working.
2. **`CHANGELOG.md`** (project root) — the consolidated, human-readable log.

Each agent only writes inside its own folder. No agent edits the other agent's folder, and only the task's finishing agent consolidates its own entry.

## When to use

- Any task that creates, edits, renames, or deletes files.
- Whenever more than one agent (or a human + agent) shares a repository.
- Before committing, so the fragment is part of the same commit as the change.

## Default language

**English**, unless the user explicitly asks otherwise. Titles, explanations, and file lists go in English even if the conversation is in another language.

## Agent identification

| Tool | ID |
|------|----|
| opencode | `OC` |
| Claude Code | `AC` |

Precedence:

1. **Runtime identity (authoritative)** — opencode identifies itself as "opencode"; Claude Code as "Claude Code".
2. **Environment variables (confirmation)**:
   - `OPENCODE` set → `OC`
   - `CLAUDE_PROJECT_DIR` or `CLAUDE_CODE_ENTRYPOINT` set → `AC`
3. On conflict, trust runtime identity.

Detection snippet:

```bash
if [ -n "${CLAUDE_PROJECT_DIR:-}${CLAUDE_CODE_ENTRYPOINT:-}" ]; then
  echo "AC"
elif [ -n "${OPENCODE:-}" ]; then
  echo "OC"
else
  echo "unknown"
fi
```

## File layout

```
<project-root>/CHANGELOG.md
<project-root>/changelog.d/AC/20260101T120000Z-fix-parser-null-handling.md
<project-root>/changelog.d/OC/20260101T120100Z-add-export-endpoint.md
<project-root>/changelog.d/AC/_auto-20260101.md        # optional hook buffer
```

- The fragment filename is **UTC**: `YYYYMMDDTHHMMSSZ-<slug>.md`.
- `<slug>` is short, kebab-case, and describes the task: `fix-parser-null-handling`.
- `_auto-YYYYMMDD.md` is an optional hook buffer (see below). It is **not** a permanent entry.

## Fragment format

A fragment is free-form but must contain, at minimum, a title, a description, and the affected files:

```markdown
# Fix null handling in parser

The parser crashed on a missing `name` field. Treat a missing value as an empty
string and add a regression test.

- **Modified:** `src/parser.py`
- **Added:** `tests/unit/test_parser.py`
```

File types come from `git diff --name-status`:

| Status | Use |
|--------|-----|
| `A` | **Added** |
| `M` | **Modified** |
| `D` | **Deleted** |
| `R` | **Renamed** |

## Consolidated entry format

Every entry in `CHANGELOG.md` is a three-part block: agent tag, ISO 8601 datetime + explanation, then one line per affected file.

```markdown
- **[AC]**
  **2026-01-01T12:00:00+00:00:** Fix null handling in the parser; missing `name` now becomes an empty string.
  - **Modified:** `src/parser.py`
  - **Added:** `tests/unit/test_parser.py`
```

Requirements:

- **Agent**: `[AC]` or `[OC]` on its own bullet line.
- **Datetime**: actual moment of consolidation, ISO 8601 with a UTC offset. Use "now" at consolidation; it is effectively the commit timestamp.
- **Explanation**: what changed and why, specific enough for another agent/human to act on without reading the diff.
- **Files**: one indented bullet per file, with `Added`, `Modified`, `Deleted`, or `Renamed`.
- **Exclude the changelog fragment itself** from the file list; it is bookkeeping, not an affected file.
- If no files outside `changelog.d/` changed, write a single `- **(none):** no files outside changelog.d/` line.

### Placement

Add the entry under `[Unreleased]` in `CHANGELOG.md`. If `[Unreleased]` does not exist, create it at the top of the file:

```markdown
# Changelog

## [Unreleased]

- **[AC]**
  ...
```

Merge into an existing date/agent block when the same agent has another entry for the same moment; otherwise append a new block.

## Procedure

### 0) At task start — create your fragment

Create `changelog.d/<AGENT>/<YYYYMMDDTHHMMSSZ>-<slug>.md` with the title and description. Use UTC:

```bash
date -u +%Y%m%dT%H%M%SZ
```

### 1) While working — record changes incrementally

Append file lines to your fragment as you edit:

```markdown
- **Modified:** `src/parser.py`
```

If a hook buffer exists (`changelog.d/<AGENT>/_auto-YYYYMMDD.md`), merge its lines into your fragment. The hook cannot know the task title or the exact edit type, so **normalize the buffer** before consolidating.

### 2) At task completion — consolidate

1. Finalize the title and description in your fragment.
2. Add the entry under `[Unreleased]` in `CHANGELOG.md`.
3. Delete your fragment.
4. Delete your `_auto-YYYYMMDD.md` buffer if it exists.
5. Do not leave stale fragments or buffers behind.

### 3) Commit

Commit the code change together with its consolidated `CHANGELOG.md` entry. Do not commit temporary fragments or buffers unless the project explicitly wants them.

## Hook buffer (optional)

An edit hook may append raw lines to `changelog.d/<AGENT>/_auto-YYYYMMDD.md` because it cannot know the task title or whether a file was added or modified:

```markdown
- **Edit:** `src/parser.py`
- **Write:** `tests/unit/test_parser.py`
```

At task completion, the agent:

1. Reads the buffer.
2. Converts `Edit`/`Write` to `Modified`/`Added` based on `git diff --name-status`.
3. Merges the file lines into the task fragment.
4. Deletes the buffer.

The buffer is a staging area, never a permanent changelog entry.

## Example

`changelog.d/OC/20260101T120100Z-add-export-endpoint.md`:

```markdown
# Add CSV export endpoint

Expose `GET /api/export.csv` for the orders list. Reuse the report query and
stream the response.

- **Added:** `src/api/export.py`
- **Added:** `tests/integration/test_export.py`
- **Modified:** `src/api/routes.py`
```

After consolidation, `CHANGELOG.md` contains:

```markdown
- **[OC]**
  **2026-01-01T12:05:00+00:00:** Add CSV export endpoint for the orders list, reusing the report query.
  - **Added:** `src/api/export.py`
  - **Added:** `tests/integration/test_export.py`
  - **Modified:** `src/api/routes.py`
```

## Guardrails

- **One fragment per agent per task** — do not create a file per edit.
- **Write incrementally** — the fragment must reflect reality while you work.
- **Consolidate before finishing** — never leave work only in `changelog.d/`.
- **Delete the fragment and buffer after consolidating** — no duplicate records.
- **Use relative paths from the project root**, never absolute paths.
- **Never edit the other agent's folder or entries.**
- **Use UTC timestamps** for filenames and ISO 8601 with offset for entries.
- **Write in English** by default.
- **Do not auto-log to `CHANGELOG.md` from a hook** — hooks write to the buffer; the agent consolidates.

## Common mistakes

| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Writing directly to `CHANGELOG.md` from a hook | Concurrent agents collide and entries lack titles/types | Hook writes to `_auto-YYYYMMDD.md`; agent consolidates |
| Using local time in filenames | Ambiguous ordering across agents/timezones | Use UTC `YYYYMMDDTHHMMSSZ` |
| Editing the other agent's folder | Merge conflicts and attribution errors | Each agent writes only its own folder |
| Forgetting to delete the fragment | Stale/duplicate entries | Delete after consolidation |
| Absolute paths | Not portable across machines | Use paths relative to the project root |
| Missing file types | Changelog cannot be audited | Use `Added`/`Modified`/`Deleted`/`Renamed` |
| Wrong agent ID | History cannot be attributed | Use `OC`/`AC` for the tool you run under |
| Non-English entries by default | Inconsistent history | Default to English unless told otherwise |
| Vague explanation | Another agent must re-read the diff | State what changed and why |
