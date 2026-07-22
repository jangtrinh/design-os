#!/usr/bin/env bash
# ease-design — full-studio one-command setup (Spec 020)
#
# Idempotent bootstrap: fresh clone -> npm install -> build (ui + 3 workspaces, a11y last)
# -> link 5 bins -> `uv tool install` the design-os python umbrella -> verify -> report.
#
# Every build/link/install line below is copied verbatim from the grounded sources — this
# script invents none of them:
#   - build steps  : design-os/src/design_os/commands/update.py  (_BUILD_STEPS)
#   - build order  : .github/workflows/ci.yml                    (check/figma-agent/recall/a11y jobs)
#   - link form    : .github/workflows/ci.yml design-os job (`npm link`) + update.py's
#                     "npm link" pattern, extended per-workspace with the subshell-cd form so a
#                     failure can't strand the cwd
#   - uv install   : update.py's `_NOT_EDITABLE_HINT` reinstall command
#
# Usage: ./setup.sh [--check] [--skip-python] [-h|--help]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

CHECK_ONLY=0
SKIP_PYTHON=0

usage() {
  cat <<'EOF'
Usage: ./setup.sh [--check] [--skip-python] [-h|--help]

Idempotent full-studio bootstrap for ease-design (DESIGN:OS): fresh clone -> complete
kernel + 5 hand-bins + the design-os python umbrella, verified.

  --check         Prereqs + "what's linked now" report only. No install/build/link/mutation.
  --skip-python   Kernel + hands only; skip the uv / design-os python umbrella steps.
  -h, --help      Show this help.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --skip-python) SKIP_PYTHON=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "setup.sh: unknown flag: $arg" >&2
      usage
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Style-A helpers, hand-written (this script can't import src/core/report-style.ts).
# Mirrors ruleHeader()/checkItem(): a `title ─── verdict` rule line and `[✓]` rows.
# ---------------------------------------------------------------------------

rule_header() {
  local title="$1" verdict="${2:-}" width=64
  local tlen=${#title} vlen=${#verdict} fill
  if [ -z "$verdict" ]; then
    if [ "$tlen" -ge "$width" ]; then printf '%s\n' "$title"; return; fi
    fill=$(( width - tlen - 1 ))
    printf '%s ' "$title"; printf -- '-%.0s' $(seq 1 "$fill") | tr '-' '─'; printf '\n'
    return
  fi
  if [ $(( tlen + vlen )) -ge $(( width - 2 )) ]; then
    printf '%s %s\n' "$title" "$verdict"
    return
  fi
  fill=$(( width - tlen - vlen - 2 ))
  printf '%s ' "$title"; printf -- '-%.0s' $(seq 1 "$fill") | tr '-' '─'; printf ' %s\n' "$verdict"
}

# ---------------------------------------------------------------------------
# Step 1 — prereqs. A missing/old required tool prints a one-line install hint;
# uv is only fatal when python isn't skipped.
# ---------------------------------------------------------------------------

PREREQ_FAIL=0

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "  [✗] node      not found — install Node >=20: https://nodejs.org/ (or 'brew install node')"
    PREREQ_FAIL=1
    return
  fi
  local ver major
  # The full studio requires Node >=22: the recall hand declares "node": ">=22"
  # (recall/package.json), and CI builds it on Node 22. The `ui` kernel alone needs
  # only >=20, but setup.sh builds recall too, so it enforces the stricter floor.
  if ! ver="$(node -v 2>/dev/null)"; then
    echo "  [✗] node      found but 'node -v' failed — reinstall Node >=22: https://nodejs.org/"
    PREREQ_FAIL=1
    return
  fi
  major="${ver#v}"
  major="${major%%.*}"
  if [ "$major" -lt 22 ]; then
    echo "  [✗] node      $ver found, need >=22 (the recall hand requires it) — 'brew upgrade node' or 'nvm install 22'"
    PREREQ_FAIL=1
  else
    echo "  [✓] node      $ver (>=22)"
  fi
}

check_npm() {
  local v
  if ! command -v npm >/dev/null 2>&1; then
    echo "  [✗] npm       not found — ships with Node; reinstall Node: https://nodejs.org/"
    PREREQ_FAIL=1
  elif ! v="$(npm --version 2>/dev/null)"; then
    echo "  [✗] npm       found but 'npm --version' failed"
    PREREQ_FAIL=1
  else
    echo "  [✓] npm       $v"
  fi
}

check_git() {
  local v
  if ! command -v git >/dev/null 2>&1; then
    echo "  [✗] git       not found — install: https://git-scm.com/downloads (or 'brew install git')"
    PREREQ_FAIL=1
  elif ! v="$(git --version 2>/dev/null)"; then
    echo "  [✗] git       found but 'git --version' failed"
    PREREQ_FAIL=1
  else
    echo "  [✓] git       $(printf '%s' "$v" | awk '{print $3}')"
  fi
}

check_uv() {
  local v
  if ! command -v uv >/dev/null 2>&1; then
    if [ "$SKIP_PYTHON" -eq 1 ]; then
      echo "  [ ] uv        not found — skipped (--skip-python)"
    else
      echo "  [✗] uv        not found — install: https://docs.astral.sh/uv/getting-started/installation/ (or 'brew install uv'), or pass --skip-python"
      PREREQ_FAIL=1
    fi
  elif ! v="$(uv --version 2>/dev/null)"; then
    echo "  [✗] uv        found but 'uv --version' failed"
    PREREQ_FAIL=1
  else
    echo "  [✓] uv        $(printf '%s' "$v" | awk '{print $2}')"
  fi
}

run_prereqs() {
  CURRENT_STEP="prereqs"
  echo "prereqs"
  check_node
  check_npm
  check_git
  check_uv
  if [ "$PREREQ_FAIL" -eq 1 ]; then
    echo "" >&2
    echo "setup.sh: FAILED at step: prereqs" >&2
    echo "  one or more required tools are missing/old — fix above, then re-run" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# --check: "what's linked now" report, no mutation.
# ---------------------------------------------------------------------------

print_linked_state() {
  echo ""
  echo "linked now"
  local name path
  for name in ui figma-agent recall a11y-audit page-shot; do
    if path="$(command -v "$name" 2>/dev/null)"; then
      echo "  [✓] $name  $path"
    else
      echo "  [ ] $name  not linked — run ./setup.sh"
    fi
  done
  if [ "$SKIP_PYTHON" -eq 1 ]; then
    echo "  [ ] design-os  skipped (--skip-python)"
  elif path="$(command -v design-os 2>/dev/null)"; then
    echo "  [✓] design-os  $path"
  else
    echo "  [ ] design-os  not installed — run ./setup.sh"
  fi
}

# ---------------------------------------------------------------------------
# Steps 2-6 — install, build, link, python umbrella, verify. A trap turns any
# failing command into a named-step message instead of a raw stack trace.
# ---------------------------------------------------------------------------

CURRENT_STEP=""
on_error() {
  local ec=$?
  echo "" >&2
  echo "setup.sh: FAILED at step: ${CURRENT_STEP:-unknown}" >&2
  echo "  see the command output above for the underlying error" >&2
  exit "$ec"
}
trap on_error ERR

run_install() {
  echo ""
  echo "install (npm install — root + the 3 workspaces)"
  CURRENT_STEP="npm install"
  npm install
}

run_build() {
  echo ""
  echo "build (ui, then figma-agent / recall / a11y workspaces — a11y last, it emits 2 bins)"
  CURRENT_STEP="build: ui"
  npm run build
  CURRENT_STEP="build: figma-agent"
  npm run build --workspace=figma-agent
  CURRENT_STEP="build: recall"
  npm run build --workspace=recall
  CURRENT_STEP="build: a11y"
  npm run build --workspace=a11y
}

run_link() {
  echo ""
  echo "link (5 bins onto PATH — subshell-cd form so a failure can't strand the cwd)"
  CURRENT_STEP="link: ui"
  npm link
  CURRENT_STEP="link: figma-agent"
  (cd figma-agent && npm link)
  CURRENT_STEP="link: recall"
  (cd recall && npm link)
  CURRENT_STEP="link: a11y"
  (cd a11y && npm link)
}

run_python_install() {
  echo ""
  echo "python umbrella (uv tool install design-os, editable + force)"
  CURRENT_STEP="uv tool install design-os"
  uv tool install --force -e ./design-os --with-editable ./design-os/plugins/figma
}

run_verify() {
  echo ""
  echo "verify"
  CURRENT_STEP="ui doctor"
  ui doctor
  if [ "$SKIP_PYTHON" -eq 0 ]; then
    CURRENT_STEP="design-os doctor"
    design-os doctor
  fi
}

# ---------------------------------------------------------------------------
# Step 7 — style-A success report.
# ---------------------------------------------------------------------------

print_success_report() {
  echo ""
  rule_header "ease-design full-studio setup" "DONE"
  echo ""
  echo "  [✓] ui            kernel — design tokens, layout, audits, registry"
  echo "  [✓] figma-agent   Figma 1:1 mirror hand"
  echo "  [✓] recall        semantic recall memory"
  echo "  [✓] a11y-audit    rendered accessibility audits"
  echo "  [✓] page-shot     rendered screenshots"
  if [ "$SKIP_PYTHON" -eq 0 ]; then
    echo "  [✓] design-os     living-agent umbrella (evolution, heartbeat, harvest)"
  else
    echo "  [ ] design-os     skipped (--skip-python)"
  fi
  echo ""
  echo "next: run \`ui onboard\` inside the project you want to design for."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

rule_header "ease-design full-studio setup" "$([ "$CHECK_ONLY" -eq 1 ] && echo CHECK || echo SETUP)"
echo ""
run_prereqs

if [ "$CHECK_ONLY" -eq 1 ]; then
  print_linked_state
  echo ""
  echo "--check: no changes made. Run ./setup.sh to install/build/link."
  exit 0
fi

run_install
run_build
run_link
if [ "$SKIP_PYTHON" -eq 0 ]; then
  run_python_install
fi
run_verify
print_success_report
