# Quickstart — first design in ~60 seconds

ease-design is **CLI-native**: you drive it through plain-language `/ui:*` commands in an agent
CLI (Claude Code, Codex, Antigravity). No GUI, no API keys, no design tokens to hand-edit.

## 1. Install

```sh
git clone <repo-url> ease-design && cd ease-design
npm install && npm run build && npm link
ui doctor          # confirms the install is healthy
```

(Once published: `npm i -g ease-design` — the package is install-verified, see below.)

## 2. Wire it into your project

```sh
cd ~/my-project
ui init --runtime claude     # writes the /ui:* commands for your agent CLI
ui doctor --cwd .            # confirms the project resolved the knowledge core
```

## 3. Make something — in plain words

In your agent CLI:

```
/ui:generate landing page for a fitness app, energetic and bold
```

You get three on-system variants, each already quality-checked. Pick one by eye, then:

```
/ui:iterate make the hero headline bigger and the CTA warmer
```

Not sure what to type? Run **`ui guide`** — a plain-language map of every workflow.

## What you get

- **Token-bound output.** Every color/spacing/radius resolves to your design system — no
  hardcoded hex. (Proof: the gallery variants use 25–64 token utilities, **0** arbitrary hex.)
- **Quality enforced, not hoped.** A deterministic `ui taste-lint` floor + a critique pass score
  every generation before you see it. Body text below 16px, mixed icon sets, pure-black shadows,
  off-grid spacing, off-palette color — all caught automatically.
- **One design system, designer ↔ dev.** A designer's project IS a normal ease-design project;
  a developer opens the same `design/` folder in their CLI and gets the identical tokens.

## See it work — the proof gallery

`examples/generated/live-2026-05-30/` contains real, gate-clean output across the full flow and
the taste spectrum. Open `examples/generated/live-2026-05-30/index.html` in a browser to view
them side by side:

| Open this | Shows |
|---|---|
| `variant-1-saas-aurora-minimal.html` | a generated pricing page (light, airy) |
| `variant-2-redesign-liquid-glass.html` | the same content redesigned (glass) — *same tokens* |
| `dashboard/variant-1-data-dense-observatory.html` | a dense dark analytics dashboard — opposite extreme, same quality bar |
| `extracted/DESIGN.preview.html` | a design system extracted back out of generated HTML |

Every file in the gallery passes `ui autofix`, `ui validate-layout`, and `ui taste-lint` cleanly.

## Verify the claims yourself

```sh
# token-bound, zero hardcoded hex:
grep -c 'bg-\[#' examples/generated/live-2026-05-30/variant-1-saas-aurora-minimal.html   # → 0

# the quality floor is real — it flags violations:
printf '<p class="text-[10px]">x</p>' > /tmp/bad.html
ui taste-lint /tmp/bad.html      # → exit 1, Typography violation
```
