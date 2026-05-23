#!/usr/bin/env bash
# Synthetic walkthrough — exercises the deterministic `ui` binary end-to-end
# without a host AI model. Re-run any time to regenerate artifacts under
# examples/synthetic/output/.
#
# Requirements: a built `ui` binary at dist/cli.js (run `npm run build` first).

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
UI="node ${REPO_ROOT}/dist/cli.js"

SYNTH_DIR="${REPO_ROOT}/examples/synthetic"
OUT_DIR="${SYNTH_DIR}/output"
ARTIFACT_DIR="${SYNTH_DIR}"

# Re-create the scratch output dir from scratch.
rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

INIT_TARGET="${OUT_DIR}/init-target"
DS_PROJECT="${OUT_DIR}/ds-demo"
mkdir -p "${INIT_TARGET}" "${DS_PROJECT}"

echo "synthetic walkthrough — output → ${OUT_DIR}"
echo

# 1. ui init --runtime claude  → 15 adapter files
echo "[1/6] ui init --runtime claude --cwd <init-target>"
${UI} init --runtime claude --cwd "${INIT_TARGET}" \
  > "${ARTIFACT_DIR}/01-ui-init-claude.txt" 2>&1
ADAPTER_COUNT=$(find "${INIT_TARGET}/.claude/commands" "${INIT_TARGET}/.claude/skills" -type f | wc -l | tr -d ' ')
echo "  adapter files written: ${ADAPTER_COUNT}"  | tee -a "${ARTIFACT_DIR}/01-ui-init-claude.txt"

# 2. ui ds init  → three artifacts in design/
echo "[2/6] ui ds init demo --persona liquid-glass --intent 'landing page for a new gym' --brand-hex '#3b82f6'"
(cd "${DS_PROJECT}" && ${UI} ds init demo \
  --persona liquid-glass \
  --intent "landing page for a new gym" \
  --brand-hex "#3b82f6") \
  > "${ARTIFACT_DIR}/02-ui-ds-init.txt" 2>&1
DS_FILES=$(ls "${DS_PROJECT}/design" | tr '\n' ' ')
echo "  design/ artifacts: ${DS_FILES}" | tee -a "${ARTIFACT_DIR}/02-ui-ds-init.txt"

# 3. ui ds context --strict --format markdown
echo "[3/6] ui ds context --strict --format markdown"
(cd "${DS_PROJECT}" && ${UI} ds context --strict --format markdown) \
  > "${ARTIFACT_DIR}/03-ui-ds-context.txt" 2>&1

# 4. ui ds change-token  → generation bumps to 2
echo "[4/6] ui ds change-token color.primary --value '{primary.600}'"
(cd "${DS_PROJECT}" && ${UI} ds change-token color.primary --value "{primary.600}") \
  > "${ARTIFACT_DIR}/04-ui-ds-change-token.txt" 2>&1

# 5. ui color scale  → 11-stop scale
echo "[5/6] ui color scale '#3b82f6'"
${UI} color scale "#3b82f6" \
  > "${ARTIFACT_DIR}/05-ui-color-scale.txt" 2>&1

# 6. ui tokens compile  → @theme Tailwind block
echo "[6/6] ui tokens compile design.tokens.json --target tailwind"
${UI} tokens compile "${DS_PROJECT}/design/design.tokens.json" --target tailwind \
  > "${ARTIFACT_DIR}/06-ui-tokens-compile-tailwind.txt" 2>&1

echo
echo "OK — 6/6 steps completed. Artifacts:"
ls -1 "${ARTIFACT_DIR}"/0*-*.txt
