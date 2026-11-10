#!/usr/bin/env bash
# Static code-audit collector.
#
# Default mode is fast and read-only: file/LOC counts, TODO/FIXME, largest
# files, language mix, git churn, and detected tooling.
#
# Usage:
#   audit.sh [--scope PATH] [--checks] [--tests] [--mutation] [--out FILE]
#
#   --checks    Run available lint/type checks (may be slow)
#   --tests     Run the project test runner (scripts/test.sh pr)
#   --mutation  Report mutation-testing tooling (does not run it)
#   --out FILE  Write the report to FILE instead of stdout
set -uo pipefail

SCOPE="."
CHECKS=0
TESTS=0
MUTATION=0
OUT=""

usage() {
  cat <<'EOF'
Usage: audit.sh [--scope PATH] [--checks] [--tests] [--mutation] [--out FILE]

  --scope PATH   File or directory to audit (default: .)
  --checks       Run available lint/type checks (slow)
  --tests        Run scripts/test.sh pr (slow)
  --mutation     Report mutation-testing tooling
  --out FILE     Write the report to FILE
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --scope) SCOPE="${2:-.}"; shift 2 ;;
    --checks) CHECKS=1; shift ;;
    --tests) TESTS=1; shift ;;
    --mutation) MUTATION=1; shift ;;
    --out) OUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) SCOPE="$1"; shift ;;
  esac
done

[ -e "$SCOPE" ] || { echo "Scope not found: $SCOPE" >&2; exit 2; }

# Resolve the scope to an absolute path before changing directories.
if [ -f "$SCOPE" ]; then
  SCOPE_ABS="$(cd "$(dirname "$SCOPE")" && pwd)/$(basename "$SCOPE")"
else
  SCOPE_ABS="$(cd "$SCOPE" && pwd)"
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || { echo "Cannot enter $ROOT" >&2; exit 2; }

case "$SCOPE_ABS" in
  "$ROOT"/*) SCOPE="${SCOPE_ABS#"$ROOT"/}" ;;
  *) SCOPE="$SCOPE_ABS" ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
run_limited() {
  local seconds="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  else
    "$@"
  fi
}

tool() {
  if command -v "$1" >/dev/null 2>&1; then echo "yes"; else echo "no"; fi
}

# ---------------------------------------------------------------------------
# Collect files
# ---------------------------------------------------------------------------
prune_expr=( \( -name .git -o -name node_modules -o -name vendor -o -name dist -o -name build \
  -o -name .venv -o -name venv -o -name __pycache__ -o -name .next -o -name target \
  -o -name coverage -o -name .pytest_cache -o -name .mypy_cache -o -name .ruff_cache \
  -o -name '*.min.js' -o -name '*.min.css' -o -name '*.map' -o -name '*.lock' \) -prune )

if [ -f "$SCOPE" ]; then
  printf '%s\n' "$SCOPE" > "$TMP/all"
else
  find "$SCOPE" "${prune_expr[@]}" -o -type f -print > "$TMP/all" 2>/dev/null
fi

# Source files (code) and docs.
grep -E '\.(py|js|jsx|ts|tsx|go|rs|java|kt|kts|cs|rb|php|c|h|cc|cpp|hpp|vue|svelte|sql|sh|bash)$' "$TMP/all" > "$TMP/src" 2>/dev/null || true
grep -E '\.(md|mdx|rst|adoc)$' "$TMP/all" > "$TMP/docs" 2>/dev/null || true
grep -E '\.(yml|yaml|json|toml|ini|cfg|conf)$' "$TMP/all" > "$TMP/config" 2>/dev/null || true

count_lines() {
  local list="$1"
  if [ -s "$list" ]; then
    xargs cat < "$list" 2>/dev/null | wc -l | tr -d ' '
  else
    echo 0
  fi
}

count_files() {
  if [ -s "$1" ]; then wc -l < "$1" | tr -d ' '; else echo 0; fi
}

count_nonblank() {
  local list="$1"
  if [ -s "$list" ]; then
    xargs cat < "$list" 2>/dev/null | grep -v '^[[:space:]]*$' | wc -l | tr -d ' '
  else
    echo 0
  fi
}

count_todos() {
  local list="$1"
  if [ -s "$list" ]; then
    xargs cat < "$list" 2>/dev/null | grep -cE 'TODO|FIXME|HACK|XXX' | tr -d ' '
  else
    echo 0
  fi
}

# ---------------------------------------------------------------------------
# Stack detection
# ---------------------------------------------------------------------------
detect_stack() {
  if [ -f go.mod ]; then echo go
  elif [ -f Cargo.toml ]; then echo rust
  elif [ -f pom.xml ] || [ -f build.gradle ] || [ -f build.gradle.kts ]; then echo java
  elif [ -n "$(find . -maxdepth 2 \( -name '*.csproj' -o -name '*.sln' \) -print -quit 2>/dev/null)" ]; then echo dotnet
  elif [ -f composer.json ]; then echo php
  elif [ -f Gemfile ]; then echo ruby
  elif [ -f package.json ]; then echo node
  elif [ -f pyproject.toml ] || [ -f setup.py ] || [ -f pytest.ini ] || [ -f tox.ini ] || [ -d tests ]; then echo python
  else echo unknown; fi
}
STACK="$(detect_stack)"

# Frappe is Python, but it has framework-specific signals worth auditing.
FRAPPE=0
if [ -d apps ] && [ -d sites ]; then
  FRAPPE=1
elif [ -n "$(find . -maxdepth 4 -name hooks.py -print -quit 2>/dev/null)" ]; then
  FRAPPE=1
elif [ -n "$(find . -maxdepth 5 -type d -name doctype -print -quit 2>/dev/null)" ]; then
  FRAPPE=1
fi
FRAPPE_DIR="."
[ -d apps ] && FRAPPE_DIR="apps"

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
report() {
  echo "# Code Audit"
  echo
  echo "- Scope: \`$SCOPE\`"
  echo "- Root: \`$ROOT\`"
  echo "- Stack: $STACK"
  echo "- Frappe: $([ "$FRAPPE" = "1" ] && echo yes || echo no)"
  echo "- Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo
  echo "## Size"
  echo
  echo "| Metric | Value |"
  echo "|--------|-------|"
  echo "| Source files | $(count_files "$TMP/src") |"
  echo "| Source lines | $(count_lines "$TMP/src") |"
  echo "| Non-blank source lines | $(count_nonblank "$TMP/src") |"
  echo "| Doc files | $(count_files "$TMP/docs") |"
  echo "| Doc lines | $(count_lines "$TMP/docs") |"
  echo "| Config files | $(count_files "$TMP/config") |"
  echo "| TODO/FIXME/HACK/XXX | $(count_todos "$TMP/src") |"
  echo
  echo "## Languages"
  echo
  if [ -s "$TMP/src" ]; then
    sed 's/.*\.//' "$TMP/src" | sort | uniq -c | sort -rn | awk '{printf "- %s: %s files\n", $2, $1}'
  else
    echo "- No source files found."
  fi
  echo
  echo "## Largest source files"
  echo
  if [ -s "$TMP/src" ]; then
    xargs wc -l < "$TMP/src" 2>/dev/null | sort -rn | sed -n '2,11p' | awk '{printf "- %s lines: `%s`\n", $1, $2}'
  else
    echo "- None."
  fi
  echo
  echo "## Git churn (last 90 days)"
  echo
  if git rev-parse --git-dir >/dev/null 2>&1; then
    git log --since="90 days ago" --name-only --pretty=format: -- "$SCOPE" 2>/dev/null \
      | grep -v '^$' | sort | uniq -c | sort -rn | head -10 \
      | awk '{printf "- %s changes: `%s`\n", $1, $2}'
  else
    echo "- Not a git repository."
  fi
  echo
  echo "## Tooling"
  echo
  for t in ruff black mypy pyright pytest radon eslint tsc vitest jest jscpd go gofmt golangci-lint gocyclo cargo clippy cargo-audit cargo-mutants mvn gradle dotnet rubocop rspec brakeman php phpunit phpstan psalm import-linter depcruise archunit musl; do
    printf -- "- %s: %s\n" "$t" "$(tool "$t")"
  done
  echo
}

# ---------------------------------------------------------------------------
# Optional checks
# ---------------------------------------------------------------------------
checks() {
  echo "## Checks"
  echo
  local out="$TMP/check.out"

  if [ "$STACK" = "python" ]; then
    if command -v ruff >/dev/null 2>&1; then
      echo "### ruff"
      run_limited 120 ruff check "$SCOPE" --output-format concise >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
    if command -v mypy >/dev/null 2>&1; then
      echo "### mypy"
      run_limited 120 mypy "$SCOPE" >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
    if command -v radon >/dev/null 2>&1; then
      echo "### radon (complexity)"
      run_limited 120 radon cc "$SCOPE" -s -n C >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
  elif [ "$STACK" = "node" ]; then
    if [ -f package.json ] && grep -qs '"eslint"' package.json; then
      echo "### eslint"
      run_limited 120 npx --no-install eslint "$SCOPE" >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
    if [ -f tsconfig.json ]; then
      echo "### tsc --noEmit"
      run_limited 120 npx --no-install tsc --noEmit >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
    if command -v jscpd >/dev/null 2>&1; then
      echo "### jscpd (duplication)"
      run_limited 120 jscpd "$SCOPE" --silent >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
  elif [ "$STACK" = "go" ]; then
    echo "### go vet"
    run_limited 120 go vet ./... >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    if command -v gocyclo >/dev/null 2>&1; then
      echo "### gocyclo"
      run_limited 120 gocyclo -over 10 "$SCOPE" >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
  elif [ "$STACK" = "rust" ]; then
    echo "### cargo check"
    run_limited 180 cargo check --quiet >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    if command -v clippy-driver >/dev/null 2>&1 || cargo clippy --version >/dev/null 2>&1; then
      echo "### cargo clippy"
      run_limited 180 cargo clippy --quiet -- -D warnings >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
  elif [ "$STACK" = "java" ]; then
    if [ -f pom.xml ]; then
      echo "### mvn test-compile"
      run_limited 180 mvn -q -DskipTests compile >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    elif [ -x ./gradlew ]; then
      echo "### gradle compile"
      run_limited 180 ./gradlew compileJava --quiet >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
  elif [ "$STACK" = "dotnet" ]; then
    echo "### dotnet build"
    run_limited 180 dotnet build --nologo -v q >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
  elif [ "$STACK" = "ruby" ]; then
    if command -v rubocop >/dev/null 2>&1; then
      echo "### rubocop"
      run_limited 120 rubocop "$SCOPE" >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
  elif [ "$STACK" = "php" ]; then
    if command -v phpstan >/dev/null 2>&1; then
      echo "### phpstan"
      run_limited 120 phpstan analyse "$SCOPE" >"$out" 2>&1; echo '```'; head -40 "$out"; echo '```'
    fi
  fi

  if [ "$FRAPPE" = "1" ]; then
    echo "### Frappe signals"
    echo
    local doctypes=0 missing_desc=0
    if [ -d "$FRAPPE_DIR" ]; then
      doctypes=$(find "$FRAPPE_DIR" -path '*/doctype/*/*.json' -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ')
      if command -v jq >/dev/null 2>&1; then
        while IFS= read -r f; do
          d="$(jq -r '.description // empty' "$f" 2>/dev/null)"
          [ -z "$d" ] && missing_desc=$((missing_desc + 1))
        done < <(find "$FRAPPE_DIR" -path '*/doctype/*/*.json' -not -path '*/node_modules/*' 2>/dev/null)
      fi
    fi
    echo "| Signal | Count |"
    echo "|--------|-------|"
    echo "| DocType JSON files | $doctypes |"
    echo "| DocTypes without description | $missing_desc |"
    echo "| hooks.py files | $(find "$FRAPPE_DIR" -name hooks.py -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ') |"
    echo "| patches.txt files | $(find "$FRAPPE_DIR" -name patches.txt -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ') |"
    echo "| files with ignore_permissions | $(grep -rIl --include='*.py' 'ignore_permissions' "$FRAPPE_DIR" 2>/dev/null | wc -l | tr -d ' ') |"
    echo "| frappe.db.commit calls | $(grep -rIo --include='*.py' 'frappe\.db\.commit' "$FRAPPE_DIR" 2>/dev/null | wc -l | tr -d ' ') |"
    echo "| frappe.db.sql calls | $(grep -rIo --include='*.py' 'frappe\.db\.sql' "$FRAPPE_DIR" 2>/dev/null | wc -l | tr -d ' ') |"
    echo "| frappe.get_all calls | $(grep -rIo --include='*.py' 'frappe\.get_all' "$FRAPPE_DIR" 2>/dev/null | wc -l | tr -d ' ') |"
    echo "| requests.* calls | $(grep -rIo --include='*.py' 'requests\.' "$FRAPPE_DIR" 2>/dev/null | wc -l | tr -d ' ') |"
    echo "| @frappe.whitelist methods | $(grep -rIo --include='*.py' '@frappe\.whitelist' "$FRAPPE_DIR" 2>/dev/null | wc -l | tr -d ' ') |"
    echo "| override_whitelisted_methods | $(grep -rIo --include='*.py' 'override_whitelisted_methods' "$FRAPPE_DIR" 2>/dev/null | wc -l | tr -d ' ') |"
    echo
    echo "These are signals, not findings. Review permissions, raw SQL, commits, unbounded queries, sync HTTP calls and whitelisted methods with the Frappe skills."
    if command -v bench >/dev/null 2>&1; then
      echo
      echo "### bench"
      run_limited 30 bench --version >"$out" 2>&1
      echo '```'; head -5 "$out"; echo '```'
    fi
    echo
  fi

  echo
}

# ---------------------------------------------------------------------------
# Optional tests
# ---------------------------------------------------------------------------
tests() {
  echo "## Tests"
  echo
  local runner=""
  for candidate in "./.claude/scripts/test.sh" "./.opencode/scripts/test.sh" "./scripts/test.sh"; do
    if [ -x "$candidate" ]; then runner="$candidate"; break; fi
  done
  if [ -z "$runner" ]; then
    echo "- No test runner found (expected .claude/scripts/test.sh or .opencode/scripts/test.sh)."
    echo
    return
  fi
  echo "- Runner: \`$runner pr\`"
  local out="$TMP/tests.out"
  run_limited 300 bash "$runner" pr >"$out" 2>&1
  local status=$?
  echo "- Exit: $status"
  echo '```'
  tail -60 "$out"
  echo '```'
  echo
}

# ---------------------------------------------------------------------------
# Mutation / architecture hints
# ---------------------------------------------------------------------------
extras() {
  echo "## Mutation and architecture"
  echo
  if [ "$MUTATION" = "1" ]; then
    for t in mutmut stryker cargo-mutants infection; do
      printf -- "- %s: %s\n" "$t" "$(tool "$t")"
    done
    echo "- Suggested: run mutation testing on critical modules only (payments, auth, calculations)."
  else
    echo "- Mutation testing not requested. Re-run with \`--mutation\` to inspect tooling."
  fi
  echo
  for t in import-linter depcruise archunit netarchtest go-arch-lint; do
    printf -- "- %s: %s\n" "$t" "$(tool "$t")"
  done
  echo
}

# ---------------------------------------------------------------------------
# Emit
# ---------------------------------------------------------------------------
emit() {
  report
  if [ "$CHECKS" = "1" ]; then checks; else echo "## Checks"; echo; echo "- Not requested. Re-run with \`--checks\`."; echo; fi
  if [ "$TESTS" = "1" ]; then tests; else echo "## Tests"; echo; echo "- Not requested. Re-run with \`--tests\`."; echo; fi
  extras
}

if [ -n "$OUT" ]; then
  emit > "$OUT"
  echo "Audit report written to $OUT"
else
  emit
fi
