#!/usr/bin/env bash
# Generic test runner: unit, integration, system, regression.
#
# Usage:
#   test.sh [fast|pr|all|unit|integration|system|regression] [-- extra args]
#
# Environment:
#   TEST_<LAYER>_CMD   Override the command for one layer
#   TEST_TIMEOUT       Per-layer timeout in seconds (uses `timeout` if available)
#   TEST_STRICT=1      Fail when a selected layer has no command
#   PROJECT_ROOT       Override project root detection
#   PYTHON_BIN         Python interpreter (default: python3, then python)
#
# The runner is fail-open: a layer with no command or directory is skipped.
# Use TEST_STRICT=1 in CI once all selected layers exist.
set -uo pipefail

usage() {
  cat <<'EOF'
Usage: test.sh [layer] [-- extra args]

Layers:
  fast          unit
  pr            unit + integration + regression
  all           unit + integration + system + regression
  unit          unit tests
  integration   integration tests
  system        system tests
  regression    regression tests

Examples:
  ./.claude/scripts/test.sh unit
  ./.claude/scripts/test.sh pr
  ./.claude/scripts/test.sh integration -- -k payments

Environment:
  TEST_<LAYER>_CMD   Override the command for a layer
  TEST_TIMEOUT       Per-layer timeout in seconds
  TEST_STRICT=1      Fail when a selected layer has no command
  PROJECT_ROOT       Override project root detection
  PYTHON_BIN         Python interpreter (default: python3, then python)
EOF
}

LAYER="${1:-fast}"
case "$LAYER" in
  -h|--help) usage; exit 0 ;;
esac
shift || true
if [ "${1:-}" = "--" ]; then shift; fi
EXTRA_ARGS=("$@")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Resolve project root
# ---------------------------------------------------------------------------
ROOT="${PROJECT_ROOT:-}"
if [ -z "$ROOT" ]; then
  if git -C "$PWD" rev-parse --show-toplevel >/dev/null 2>&1; then
    ROOT="$(git -C "$PWD" rev-parse --show-toplevel)"
  else
    for candidate in "$PWD" "$SCRIPT_DIR/.." "$SCRIPT_DIR/../.."; do
      if [ -d "$candidate/tests" ] \
        || [ -f "$candidate/package.json" ] \
        || [ -f "$candidate/pyproject.toml" ] \
        || [ -f "$candidate/go.mod" ] \
        || [ -f "$candidate/Cargo.toml" ] \
        || [ -f "$candidate/pom.xml" ]; then
        ROOT="$(cd "$candidate" && pwd)"
        break
      fi
    done
  fi
fi
ROOT="${ROOT:-$PWD}"
cd "$ROOT" || { echo "ERROR: cannot enter $ROOT"; exit 2; }

# ---------------------------------------------------------------------------
# Detect stack
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

# Python interpreter: prefer python3, then python.
PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "$PYTHON_BIN" ]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN=python3
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN=python
  else
    PYTHON_BIN=python3
  fi
fi

# ---------------------------------------------------------------------------
# Resolve a layer command
# ---------------------------------------------------------------------------
layer_cmd() {
  local layer="$1"
  local var="TEST_$(echo "$layer" | tr '[:lower:]' '[:upper:]')_CMD"
  local override
  override="$(printenv "$var" 2>/dev/null || true)"
  if [ -n "$override" ]; then printf '%s' "$override"; return; fi

  case "$STACK" in
    python)
      if [ -d "tests/$layer" ]; then
        printf '%s -m pytest tests/%s -q' "$PYTHON_BIN" "$layer"
      elif [ -f pytest.ini ] || [ -f tox.ini ] || grep -qs 'pytest' pyproject.toml setup.cfg 2>/dev/null; then
        printf '%s -m pytest -q -m %s' "$PYTHON_BIN" "$layer"
      fi
      ;;
    node)
      local runner=""
      if grep -qs '"vitest"' package.json; then
        runner="npx vitest run"
      elif grep -qs '"jest"' package.json; then
        runner="npx jest"
      elif grep -qs '"test"' package.json; then
        runner="npm test --"
      fi
      if [ -n "$runner" ]; then
        if [ -d "tests/$layer" ]; then
          printf '%s tests/%s' "$runner" "$layer"
        elif [ -d "test/$layer" ]; then
          printf '%s test/%s' "$runner" "$layer"
        fi
      fi
      ;;
    go)
      case "$layer" in
        unit) printf 'go test ./...' ;;
        *) printf 'go test -tags=%s ./...' "$layer" ;;
      esac
      ;;
    rust)
      case "$layer" in
        unit) printf 'cargo test --lib' ;;
        *)
          if [ -f "tests/$layer.rs" ] || [ -d "tests/$layer" ]; then
            printf 'cargo test --test %s' "$layer"
          fi
          ;;
      esac
      ;;
    java)
      if [ -f pom.xml ]; then
        printf 'mvn -q test -Dgroups=%s' "$layer"
      elif [ -x ./gradlew ]; then
        printf './gradlew test -Pgroups=%s' "$layer"
      fi
      ;;
    dotnet)
      printf 'dotnet test --filter Category=%s' "$layer"
      ;;
    ruby)
      if [ -d "spec/$layer" ]; then
        printf 'bundle exec rspec spec/%s' "$layer"
      elif [ -d "test/$layer" ]; then
        printf 'bundle exec rake test TEST=test/%s' "$layer"
      fi
      ;;
    php)
      if [ -f vendor/bin/phpunit ]; then
        printf 'vendor/bin/phpunit --testsuite %s' "$layer"
      fi
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Expand selection
# ---------------------------------------------------------------------------
case "$LAYER" in
  fast) LAYERS=(unit) ;;
  pr) LAYERS=(unit integration regression) ;;
  all) LAYERS=(unit integration system regression) ;;
  unit|integration|system|regression) LAYERS=("$LAYER") ;;
  *)
    echo "Unknown layer: $LAYER"
    usage
    exit 2
    ;;
esac

echo "Project: $ROOT"
echo "Stack:   $STACK"
echo "Layers:  ${LAYERS[*]}"
echo

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
FAILED=0
SKIPPED=0
RAN=0

for layer in "${LAYERS[@]}"; do
  cmd="$(layer_cmd "$layer")"
  if [ -z "$cmd" ]; then
    if [ "${TEST_STRICT:-0}" = "1" ]; then
      echo "FAIL $layer: no command found (strict mode)"
      FAILED=$((FAILED + 1))
    else
      echo "SKIP $layer: no command found (set TEST_$(echo "$layer" | tr '[:lower:]' '[:upper:]')_CMD or add tests/$layer/)"
      SKIPPED=$((SKIPPED + 1))
    fi
    echo
    continue
  fi

  full_cmd="$cmd"
  if [ "${#EXTRA_ARGS[@]}" -gt 0 ]; then
    full_cmd="$full_cmd ${EXTRA_ARGS[*]}"
  fi

  echo "==> $layer: $full_cmd"
  start="$(date +%s)"
  if [ -n "${TEST_TIMEOUT:-}" ] && command -v timeout >/dev/null 2>&1; then
    timeout "$TEST_TIMEOUT" bash -c "$full_cmd"
  else
    bash -c "$full_cmd"
  fi
  status=$?
  end="$(date +%s)"
  elapsed=$((end - start))

  if [ "$status" -eq 0 ]; then
    echo "PASS $layer (${elapsed}s)"
    RAN=$((RAN + 1))
  else
    echo "FAIL $layer (${elapsed}s, exit $status)"
    FAILED=$((FAILED + 1))
  fi
  echo
done

echo "Summary: $RAN passed, $FAILED failed, $SKIPPED skipped"
if [ "$FAILED" -gt 0 ]; then exit 1; fi
if [ "$RAN" -eq 0 ]; then
  echo "No tests ran. Add a tests/<layer>/ directory or set TEST_<LAYER>_CMD."
fi
exit 0
