#!/bin/sh
# Fresh-machine install proof: npm pack -> install the tarball into a throwaway
# prefix -> ui doctor -> ui init in an empty project -> ui doctor --cwd.
# Prints wall time per step and the total; any failing step stops the run loudly.
#
# Usage: scripts/fresh-install-proof.sh [--tarball <file.tgz>] [--keep]
#   --tarball  install this tarball instead of packing the checkout (negative controls)
#   --keep     leave the throwaway prefix and project on disk for inspection
# Never installs into the real npm prefix and never publishes.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TARBALL=""
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tarball) [ $# -ge 2 ] || { echo "FAIL: --tarball needs a path" >&2; exit 2; }; TARBALL=$2; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n 2,10p "$0"; exit 0 ;;
    *) echo "FAIL: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

TMP_BASE=${TMPDIR:-/tmp}
WORK=$(mktemp -d "${TMP_BASE%/}/ui-fresh-install.XXXXXX")
PREFIX="$WORK/prefix"
PROJECT="$WORK/project"
LOG="$WORK/step.log"
mkdir -p "$PREFIX" "$PROJECT"
# Refuse to run unless the prefix is provably inside the throwaway dir.
case "$PREFIX" in "$WORK"/*) ;; *) echo "FAIL: prefix escaped the throwaway dir" >&2; exit 2 ;; esac

cleanup() { [ "$KEEP" = 1 ] && echo "kept: $WORK" || rm -rf "$WORK"; }
trap cleanup EXIT

now_ms() { node -e 'process.stdout.write(String(Date.now()))'; }
T0=$(now_ms)
TABLE=""

# step <name> <command...>: run, time, append to the table; on failure dump the log and exit 1.
step() {
  name=$1; shift
  s=$(now_ms)
  if "$@" >"$LOG" 2>&1; then
    e=$(now_ms); ms=$((e - s))
    TABLE="$TABLE$(printf '%-34s %7d ms  ok' "$name" "$ms")
"
    printf '  ok   %-32s %7d ms\n' "$name" "$ms"
  else
    rc=$?
    echo "  FAIL $name (exit $rc)" >&2
    sed 's/^/       | /' "$LOG" >&2
    echo "FAIL at step: $name" >&2
    exit 1
  fi
}

echo "fresh-install-proof: work dir $WORK"

prep_build() {
  cd "$ROOT"
  [ -d node_modules ] || npm ci --no-audit --no-fund
  [ -f dist/cli.js ] || npm run build
}

pack_tarball() {
  cd "$ROOT"
  out=$(npm pack --silent --pack-destination "$WORK")
  TARBALL="$WORK/$(printf '%s' "$out" | tail -n 1)"
  printf '%s\n' "$TARBALL" > "$WORK/tarball.path"
}

install_tarball() {
  # -g with an explicit prefix inside the throwaway dir mirrors a user's global install.
  # a throwaway npm cache too, so dependency download cost is measured, not hidden by a warm cache
  npm install -g --prefix "$PREFIX" --cache "$WORK/npm-cache" --no-audit --no-fund "$TARBALL"
}

require_bin() {
  [ -x "$PREFIX/bin/ui" ] || { echo "no executable $PREFIX/bin/ui - the package did not link its 'ui' bin"; return 1; }
}

doctor_install() { require_bin && "$PREFIX/bin/ui" doctor; }

init_project() {
  cd "$PROJECT"
  "$PREFIX/bin/ui" init --all
  # what init promised: one manifest per runtime plus the adapter trees
  for f in .claude/ease-design.json .agent/ease-design.json AGENTS.ease-design.json AGENTS.md; do
    [ -e "$f" ] || { echo "init did not write $f"; return 1; }
  done
  find . -type f | sort > "$WORK/init-files.txt"
  echo "init wrote $(wc -l < "$WORK/init-files.txt" | tr -d ' ') files"
}

doctor_project() { cd "$PROJECT" && "$PREFIX/bin/ui" doctor --cwd "$PROJECT"; }

if [ -z "$TARBALL" ]; then
  step "prep: build checkout (if needed)" prep_build
  step "npm pack" pack_tarball
else
  [ -f "$TARBALL" ] || { echo "FAIL: tarball not found: $TARBALL" >&2; exit 2; }
  case "$TARBALL" in /*) ;; *) TARBALL="$(pwd)/$TARBALL" ;; esac
fi
step "install into throwaway prefix" install_tarball
step "ui doctor (install)" doctor_install
step "ui init --all (empty project)" init_project
step "ui doctor --cwd (project)" doctor_project

T1=$(now_ms)
echo
echo "step                               wall time"
printf '%s' "$TABLE"
printf 'TOTAL                              %7d ms (%d.%d s)\n' $((T1 - T0)) $(((T1 - T0) / 1000)) $((((T1 - T0) % 1000) / 100))
echo "files written by ui init: $(wc -l < "$WORK/init-files.txt" | tr -d ' ')"
echo "PASS: fresh install verified (prefix and project were throwaway)"
