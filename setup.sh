#!/usr/bin/env bash
# ease-design — full-studio one-command setup (Spec 020)
#
# Idempotent bootstrap: fresh clone -> npm install -> build (ui + 2 workspaces, a11y last)
# -> link 4 bins -> `uv tool install` the design-os python umbrella -> verify -> report.
# figma-agent (the Figma hand) is now its own repo — github.com/jangtrinh/design-os-figma-plugin
# — with its own install/build/link; this script no longer builds or links it.
#
# Every build/link/install line below is copied verbatim from the grounded sources — this
# script invents none of them:
#   - build steps  : design-os/src/design_os/commands/update.py  (_BUILD_STEPS)
#   - build order  : .github/workflows/ci.yml                    (check/recall/a11y jobs)
#   - link form    : .github/workflows/ci.yml design-os job (`npm link`) + update.py's
#                     "npm link" pattern, extended per-workspace with the subshell-cd form so a
#                     failure can't strand the cwd
#   - uv install   : update.py's `_NOT_EDITABLE_HINT` reinstall command
#   - gflow install: ~/.claude/skills/es-gflow/SKILL.md §1 (verbatim, incl. the --with pillow
#                    workaround for gflow's undeclared Pillow dependency)
#
# Usage: ./setup.sh [--check] [--skip-python] [--with-gflow|--no-gflow] [-h|--help]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

CHECK_ONLY=0
SKIP_PYTHON=0
# ask (default, interactive) | yes (--with-gflow) | no (--no-gflow). NEVER install unasked:
# gflow drives Google Flow by automating a real browser session on the user's own Google
# account, so consent is the whole point of this step. See run_gflow_optin().
GFLOW_MODE="ask"

usage() {
  cat <<'EOF'
Usage: ./setup.sh [--check] [--skip-python] [--with-gflow|--no-gflow] [-h|--help]

Idempotent full-studio bootstrap for ease-design (DESIGN:OS): fresh clone -> complete
kernel + 5 hand-bins + the design-os python umbrella, verified.

  --check         Prereqs + "what's linked now" report only. No install/build/link/mutation.
  --skip-python   Kernel + hands only; skip the uv / design-os python umbrella steps.
  --with-gflow    Install the optional gflow scroll-cinema asset hand without asking.
  --no-gflow      Skip gflow without asking (what a non-interactive run does anyway).
  -h, --help      Show this help.

gflow is OPTIONAL and never installed silently: an interactive run explains it and asks,
a non-interactive run (CI, piped stdin) skips it. Everything else in the studio works
without it; only generating NEW scroll-cinema footage needs it.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --skip-python) SKIP_PYTHON=1 ;;
    --with-gflow) GFLOW_MODE="yes" ;;
    --no-gflow) GFLOW_MODE="no" ;;
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
  for name in ui recall a11y-audit page-shot; do
    if path="$(command -v "$name" 2>/dev/null)"; then
      echo "  [✓] $name  $path"
    else
      echo "  [ ] $name  not linked — run ./setup.sh"
    fi
  done
  # figma-agent is its own repo now (github.com/jangtrinh/design-os-figma-plugin) — this
  # script no longer builds/links it, but still reports whether it happens to be on PATH.
  if path="$(command -v figma-agent 2>/dev/null)"; then
    echo "  [✓] figma-agent  $path"
  else
    echo "  [ ] figma-agent  not linked — install from github.com/jangtrinh/design-os-figma-plugin"
  fi
  if [ "$SKIP_PYTHON" -eq 1 ]; then
    echo "  [ ] design-os  skipped (--skip-python)"
  elif path="$(command -v design-os 2>/dev/null)"; then
    echo "  [✓] design-os  $path"
  else
    echo "  [ ] design-os  not installed — run ./setup.sh"
  fi
  # Optional, opt-in only: absent is a normal state, so it never reads as broken here.
  if path="$(command -v gflow 2>/dev/null)"; then
    echo "  [✓] gflow      $path  (optional — scroll-cinema assets)"
  else
    echo "  [ ] gflow      not installed — optional; ./setup.sh --with-gflow"
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
  echo "install (npm install — root + the 2 workspaces)"
  CURRENT_STEP="npm install"
  npm install
}

run_build() {
  echo ""
  echo "build (ui, then recall / a11y workspaces — a11y last, it emits 2 bins)"
  CURRENT_STEP="build: ui"
  npm run build
  CURRENT_STEP="build: recall"
  npm run build --workspace=recall
  CURRENT_STEP="build: a11y"
  npm run build --workspace=a11y
}

run_link() {
  echo ""
  echo "link (4 bins onto PATH — subshell-cd form so a failure can't strand the cwd)"
  CURRENT_STEP="link: ui"
  npm link
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

# ---------------------------------------------------------------------------
# Step 5b — OPTIONAL gflow asset hand (spec 021, issue #97). Explain, then ask.
#
# Why this is opt-in and not a default: gflow is unofficial (it drives Google Flow by
# automating a real Chrome session signed into the user's own Google account) and it needs
# a paid AI Ultra/Pro subscription. Installing that on someone's machine without saying so
# is not a bootstrap detail — it's a consent question. Skipping breaks nothing: committed
# renders still serve, and `design-os doctor` reports the absence as an optional gap.
# ---------------------------------------------------------------------------

explain_gflow() {
  echo ""
  echo "optional — gflow (scroll-cinema asset hand, spec 021)"
  echo ""
  echo "  What it is    Google Flow CLI (Veo video + Imagen stills). The 021 track uses it to"
  echo "                GENERATE new fly-through footage; nothing else in the studio needs it."
  echo "  What you need A paid Google AI Ultra/Pro subscription (flat credits, not API billing)."
  echo "  The catch     Unofficial: it automates a real Chrome session on YOUR Google account."
  echo "                That carries account risk, which is why this is never installed silently."
  echo "  If you skip   Everything else works. Committed renders still serve; only generating"
  echo "                NEW frames is unavailable. \`design-os doctor\` will list gflow as an"
  echo "                optional gap, so you find out here rather than mid-generation."
  echo "  Installs      uv tool install gflow-cli --with pillow  ->  ~/.local/bin/{gflow,flow}"
  echo "                (no login happens now; auth is a separate interactive step you run)"
  echo ""
}

install_gflow() {
  CURRENT_STEP="uv tool install gflow-cli"
  # Optional step: a failure must NOT abort the studio setup, so the ERR trap is bypassed
  # by testing the command instead of letting it exit. Command verbatim from es-gflow §1 —
  # `--with pillow` is load-bearing (gflow forgets to declare Pillow; frame ops crash with
  # ModuleNotFoundError: PIL without it).
  if uv tool install gflow-cli --with pillow --force; then
    echo "  [✓] gflow installed"
    echo ""
    echo "  next, once (interactive — signs YOU in, opens real Chrome):"
    echo "    GFLOW_CLI_AUTH_LOGIN_TIMEOUT=1200 gflow auth login --profile ultra --browser chrome"
    echo "  reach the Flow EDITOR, then close the browser; gflow verifies + saves on close."
  else
    echo "  [!] gflow install failed — studio setup continues without it (it is optional)."
    echo "      retry later: uv tool install gflow-cli --with pillow --force"
  fi
}

run_gflow_optin() {
  # Already installed → nothing to ask.
  if command -v gflow >/dev/null 2>&1; then
    echo ""
    echo "optional — gflow already installed ($(command -v gflow))"
    return
  fi
  # Needs uv, same as the python umbrella.
  if ! command -v uv >/dev/null 2>&1; then
    echo ""
    echo "optional — gflow skipped: needs uv (install uv, then: uv tool install gflow-cli --with pillow)"
    return
  fi

  case "$GFLOW_MODE" in
    no)
      echo ""
      echo "optional — gflow skipped (--no-gflow)"
      return
      ;;
    yes)
      explain_gflow
      echo "  --with-gflow given → installing without asking."
      install_gflow
      return
      ;;
  esac

  # ask: only when there is a human on the other end. A CI/piped run must never hang on
  # a prompt, so no TTY = skip, with the command printed so it stays discoverable.
  if [ ! -t 0 ]; then
    echo ""
    echo "optional — gflow skipped: non-interactive run (no TTY), and it is never installed unasked."
    echo "  to install: ./setup.sh --with-gflow   (or: uv tool install gflow-cli --with pillow)"
    return
  fi

  explain_gflow
  local reply=""
  # `|| true`: a read that fails (EOF/interrupt) must not trip `set -e` — it means "no".
  read -r -p "  Install gflow now? [y/N] " reply || true
  case "$reply" in
    [yY] | [yY][eE][sS]) install_gflow ;;
    *) echo "  [ ] gflow skipped — re-run anytime with ./setup.sh --with-gflow" ;;
  esac
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
  if command -v figma-agent >/dev/null 2>&1; then
    echo "  [✓] figma-agent   Figma 1:1 mirror hand (github.com/jangtrinh/design-os-figma-plugin)"
  else
    echo "  [ ] figma-agent   not installed (optional) — github.com/jangtrinh/design-os-figma-plugin"
  fi
  echo "  [✓] recall        semantic recall memory"
  echo "  [✓] a11y-audit    rendered accessibility audits"
  echo "  [✓] page-shot     rendered screenshots"
  if [ "$SKIP_PYTHON" -eq 0 ]; then
    echo "  [✓] design-os     living-agent umbrella (evolution, heartbeat, harvest)"
  else
    echo "  [ ] design-os     skipped (--skip-python)"
  fi
  if command -v gflow >/dev/null 2>&1; then
    echo "  [✓] gflow         scroll-cinema assets (optional) — needs \`gflow auth login\` once"
  else
    echo "  [ ] gflow         scroll-cinema assets (optional, not installed)"
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
run_gflow_optin
run_verify
print_success_report
