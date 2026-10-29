# oi-browser fixtures: provenance

Frozen real-data fixtures for Spec 031 (zero-drift onboarding gate), acceptance criterion AC-0.
Origin repo: `jangtrinh/oi-browser` (read-only clone, nothing here is regenerated at test time).

| Commit | Role | Subject |
|---|---|---|
| `06de5e26d311e856fe88255aa8d81ad2a561b59b` (`06de5e2`) | bad screen (pre-fix) | feat(settings): move CLI Core into /settings/ai-provider and Right-Hand Sidebar per DESIGN:OS ontology |
| `28c1e86f456fa4925288ef5add52c101cfb10ea6` (`28c1e86`) | good screen + anchor + tokens | style(settings): align CLI Core strictly with native OptionsGroup & micro-dot DS rules |

Why `06de5e2` and not the SHA the spec names (`d3da88b`): `d3da88b` does not exist on the oi-browser
remote. `fd1700b` (the direct parent of `28c1e86`) already removed monospace from the dock. `06de5e2`
(parent of `fd1700b`) is the last commit that still carries the monospace, pastel-pill, uppercase-tag,
header-bar-inside-card and long-copy drifts (owner ruling).

## Fixture files

| Fixture | What it is | Origin | How it was made |
|---|---|---|---|
| `settings-cli-core-bad.html` | CLI Core settings panel, bad state | `src/client/berry-cli-terminal-dock.js` @ `06de5e2` (style template literal + `buildSettingsPanelHtml` output); harness list from `HARNESS_SPECS` in `src/server/cli-harness-router.js` @ `06de5e2` | Scripted render, Script A below, from the two blobs listed under "Rebuild inputs". CSS and markup verbatim. |
| `settings-cli-core-good.html` | CLI Core settings panel, good state | same two files @ `28c1e86` (vendored in `source/native/`) | Scripted render, Script A below. |
| `settings-account.html` | Anchor: native `/settings/account` route, **hand-composed** | compiled bundles at `28c1e86` (see "Anchor composition") | **MANUAL COMPOSITION.** Static HTML assembled by hand from markup strings found in compiled files; class lists computed by the app's own `cn()`/`tv()` (Script D); CSS rules selected by script (Script B). Not rendered, no dev server. |
| `tokens.json` | The sealed DTCG token store | `design/design.tokens.json` @ `28c1e86` | Byte-identical copy (`git show 28c1e86:design/design.tokens.json`). |

Render state used for the two dock fixtures (the dock builds rows from data the server sends at runtime; the
file itself holds no rows): `dockState.harnesses` = the file's own `HARNESS_SPECS` with `binaryPath: null` and
`installed` true only for `auto` and `local`, which is what `discoverHarnesses()` returns on a machine where no
CLI binary resolves; `activeHarnessId: "auto"`; `recentRuns: []`. Counts derived exactly as `renderCliDock()`
derives them (`totalBins`, `installedCount`, `activeSpec`). The affinity rows come from the file's own
`AFFINITIES` array. No row, label or string was invented. Consequence worth knowing: with no binary resolved the
bad screen prints `5/5 CLIs Ready` because of the file's own `|| 5` fallback.

## Drift evidence at `06de5e2` (`src/client/berry-cli-terminal-dock.js`)

| # | Drift | Present | Evidence (file:line at `06de5e2`) |
|---|---|---|---|
| D1 | monospace UI font | yes | `ui-monospace, SFMono-Regular, Menlo, monospace` x7: lines 23, 33, 38, 39, 47, 49, 56 |
| D2 | pastel pill + uppercase tag | yes | `#dcfce7` x2: line 33 (`.oi-cli-status-pill`), line 59 (`.oi-cli-badge`); `"AUTO"` x1: line 148 (`badge: "AUTO"`); uppercase tag markup `.oi-cli-role-tag` (line 113, text from `h.badge \|\| h.id.toUpperCase()`; `HARNESS_SPECS` badges `AUTO`, `CLAUDE`, ... in `cli-harness-router.js`) |
| D3 | header bar inside card | yes, under another name | The literal class `.card-header` does not exist. The same anatomy is `.oi-cli-card-hdr` x4: line 29 (`border-bottom` + `background: oklch(var(--card) / 0.45)`), lines 103, 118, 124 (inside each `.oi-cli-card`, wrapping title + sub-title) |
| D4 | long copy | yes | line 105 `CLI Core — Multi-CLI Harness Router`; line 106, 118, 124 long sub-titles; row fallback copy line 113 |
| D5 | self-registered "CLI Provider Table" component | **absent in every commit** | 0 matches for `provider table` at `06de5e2`, `fd1700b`, `28c1e86`; `design/component-registry.json` holds 24 components, none of that name. Recorded as absent, not fabricated. Spec AC-6 uses its own synthetic registry fixture. |

At `28c1e86` the same dock file has 0 `ui-monospace`, 0 `dcfce7`, 0 `AUTO`, 0 `oi-cli-card-hdr`.

## Rebuild inputs (not vendored)

These are needed to rebuild `settings-cli-core-bad.html` and to re-derive the anchor stylesheet, but are kept
out of `source/` on purpose: the `06de5e2` files contain monospace by design, and the stylesheet is 303 KB and
defines `font-mono`. Either would make every "zero monospace" probe over `source/` red for a reason unrelated to
the native screens.

| Origin path | Commit | Blob (full) | Bytes |
|---|---|---|---|
| `src/client/berry-cli-terminal-dock.js` | `06de5e2` | `4b6246073705bd5869a10cc9c9107330fabc8342` | 15727 |
| `src/server/cli-harness-router.js` | `06de5e2` | `a37221a1a200776a8838d6a576faaf2512aeae08` | 8864 |
| `public/_app/immutable/assets/0.aoqKTpgP.css` | `28c1e86` | `47f9938e4598b97c686d3d9734ebe4682f306356` | 303363 |

Recover any of them from the oi-browser clone with `git show <commit>:<origin path>`. Rebuild the bad screen:

```
git show 06de5e2:src/client/berry-cli-terminal-dock.js > dock-06de5e2.js
git show 06de5e2:src/server/cli-harness-router.js > router-06de5e2.js
node build-dock-fixture.mjs dock-06de5e2.js router-06de5e2.js 06de5e2 "CLI Core settings (bad screen)" settings-cli-core-bad.html
```

## Anchor composition (`settings-account.html`)

oi-browser holds no `.svelte` files. The native route, `OptionsGroup` and `OptionItem` exist only as compiled
SvelteKit output under `public/_app/immutable/`. Route table: `entry/app.-qs_HR2H.js` maps
`/(app)/settings/account` to node index 71, so the page is `nodes/71.C77w0PPh.js`.

Native structure carried by the anchor (compiled name to emitted markup):

| Fragment in the anchor | Taken from | What was read |
|---|---|---|
| `<div class="max-w-[50rem]" data-testid="account-page">` | `native/account-route-node-71.C77w0PPh.js`, template `na` | page wrapper |
| `<div data-slot="settings-page-header" ...><h2 class="text-lg font-medium text-primary">Account</h2>` | `native/chunks/a_C1_LGN.js` (PageHeader), called as `title:"Account"` in node 71 | template `S`; no description, no actions |
| context switch: every settings page runs with `settings-surface` = true | `native/settings-layout-node-11.C9det9-x.js` (`Et(Zt,!0)`, i.e. `setContext`, with `Zt` imported from `native/chunks/m8Kg1K1n.js`) | the OptionsGroup, OptionsGroupCard, OptionItem and OptionItemDescription chunks below each read this context and switch class lists; the anchor uses the "true" branch of each |
| `data-slot="options-group"` | `native/chunks/Cj9WbYNy.js` (OptionsGroup) | class list `group` in Script D's output |
| group heading row `mb-4 flex justify-between gap-3 items-start` + `flex min-w-0 flex-1 flex-col gap-1.5 [&>*]:!m-0` | `native/chunks/zb3QUMUw.js` (OptionsGroupHeader) | heading sits outside and above the card |
| `<h2 data-slot="options-group-title" class="text-sm text-primary">` | `native/chunks/cZ0pNadS.js` (OptionsGroupTitle, size `default`) | |
| `data-slot="options-group-card"` | `native/chunks/Dp-6Tp0Z.js` (OptionsGroupCard on top of Card) | class list `card` |
| `data-slot="option-item"` wrapper, inner `flex items-center gap-4 justify-between`, `flex-1 min-w-0` | `native/chunks/UcHMlLw1.js` (OptionItem) on `native/chunks/Bo2dmbtA.js` (`px-6` wrapper) | class lists `item` / `itemClickable`; clickable rows add `data-clickable="true"` |
| `data-slot="option-item-title"` | `native/chunks/BcEwtP1q.js` (OptionItemTitle) | class lists `title` / `titleDestructive` |
| description `<p>` | `native/chunks/ACufibVP.js` (OptionItemDescription) | class lists `desc` / `descFlex` |
| **micro-dot**: `<span class="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true"></span> Connected` | `native/account-route-node-71.C77w0PPh.js`, template `Vr` and the `Connected` / `Current sign-in` text | the native status idiom: 6px emerald dot + plain text, no pill |
| secondary button `Disconnect` / `Connect` | `native/chunks/C2ZPEHK5.js` (Button, `secondary` + `sm`) | class lists `buttonShrink` / `button` |
| rows `Google`, `Another Google account`, `Connected`, `Disconnect`, `Connect`, group `Google sign-in` | node 71, function `Qr` | data-driven rows use the file's own fallbacks: title falls back to the provider name map `{google:"Google"}`; an "add" row reads `Another Google account` once a connection exists |
| group `Danger zone`, rows `Reset Ổi Browser data on this computer`, `Delete account` and their descriptions | node 71, functions `Rt` and `ht` | |
| `<img src="/images/integrations/google/google.svg" class="size-5 shrink-0">` | node 71, template `yt` | |

### Merged class lists: computed, not typed

Where a component merges class lists through the app's `cn()` (`clsx` + `tailwind-merge`, with the app's own
tailwind-merge config) the merge is **computed by running the app's own compiled code**:
`source/native/chunks/9k9xcff1.js` (`cn`, the merge config) with `source/native/chunks/B-dksMZM.js` (`clsx`),
and, for the Button, the `tv()` call compiled into `source/native/chunks/C2ZPEHK5.js`. Script D feeds them the
exact class strings the component chunks contain (read out of the vendored chunks by pattern, not retyped) in
the nesting the components use, with the `settings-surface` context true. Output for this freeze:

```json
{
  "group": "mt-12",
  "card": "text-card-foreground flex flex-col gap-0 overflow-hidden rounded-2xl border-0 border-shadow bg-white p-0 divide-y divide-zinc-100 dark:border dark:border-border dark:bg-card dark:divide-border dark:shadow-none [&_[data-slot=button][data-variant=secondary]]:bg-foreground/10 [&_[data-slot=button][data-variant=secondary]:hover]:bg-foreground/15 [&_[data-slot=button][data-variant=secondary]:active]:bg-foreground/20",
  "item": "px-6 py-3.5 transition-colors duration-200 ease-out",
  "itemClickable": "px-6 py-3.5 transition-colors duration-200 ease-out cursor-pointer hover:bg-zinc-50 dark:hover:bg-muted/50",
  "title": "text-sm font-normal tracking-normal text-primary",
  "titleDestructive": "text-sm font-normal tracking-normal text-destructive",
  "desc": "text-xs text-muted-foreground font-normal mt-0.5 text-balance",
  "descFlex": "text-xs text-muted-foreground font-normal mt-0.5 text-balance flex items-center gap-1.5",
  "buttonShrink": "inline-flex items-center justify-center whitespace-nowrap font-regular disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive select-none theme-surface-interactive bg-secondary text-secondary-foreground hover:brightness-95 active:brightness-90 h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-xs relative shrink-0",
  "button": "inline-flex items-center justify-center whitespace-nowrap font-regular disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive select-none theme-surface-interactive bg-secondary text-secondary-foreground hover:brightness-95 active:brightness-90 h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 text-xs relative"
}
```

History worth keeping: a first version of the anchor merged these by hand and kept `leading-none` on the row
titles. The app's own config puts `leading-*` in the font-size group, so `text-sm` drops it; Script D drops it
too, and so does the anchor now. The Button class order also differs from a hand merge (`rounded-md` moves
after `h-8`); only computed output is used.

The anchor markup is a template in which the 17 merged `class` attributes are `{{name}}` placeholders
(`group` x2, `card` x2, `item` x2, `itemClickable` x2, `title` x3, `titleDestructive` x1, `desc` x2,
`descFlex` x1, `buttonShrink` x1, `button` x1); Script E fills them from Script D's output and fails on a
missing or unused name. The template is the anchor file itself with those attributes swapped back for
placeholders. Every class list in the JSON above appears verbatim as a `class="..."` value in
`settings-account.html`.

Deliberately left out of the anchor: the profile/avatar header, the invite and credits links, dialogs, the help
popover trigger next to "Google sign-in", and the lucide icon glyphs on the danger rows (their paths live in other
chunks and add no structure). Four classes the markup uses have no rule in the compiled stylesheet (`font-regular`,
`aria-invalid:ring-destructive/20`, `dark:aria-invalid:ring-destructive/40`, `aria-invalid:border-destructive`);
they are left in place because the native component emits them.

CSS in the anchor: rules of `public/_app/immutable/assets/0.aoqKTpgP.css` @ `28c1e86`, copied verbatim and in
file order, selected by Script B over the filled markup: (a) every top-level rule whose selectors contain no class
(Tailwind reset, `:root` / `[data-theme=light]` theme variables, tag selectors), except the user-agent monospace
stack for `code, kbd, samp, pre` (the page has none of those elements) and view-transition animations; (b) every
rule whose selector starts with one of the 84 class tokens used in the anchor body. Consequence for probes: the
anchor's "zero monospace" is partly by construction, because that one rule was deliberately left out.

## Layout of `source/`

`source/native/` holds everything read at `28c1e86` and nothing from the bad commit: one dock file, one router,
the compiled account route and settings layout, the thirteen compiled chunks (eleven component chunks plus the
`cn()` merge chunks `9k9xcff1.js` and `B-dksMZM.js`), and the two token files. 19 files.

Known content of `source/` (case-insensitive substring counts over all 19 files; do not edit vendored files):

| Probe | Total | Where |
|---|---|---|
| `monospace` (any case) | 0 | none |
| `ui-monospace` | 0 | none |
| `font-mono` | 1 | `native/account-route-node-71.C77w0PPh.js`, inside a `<code class="rounded bg-muted px-1.5 py-0.5 font-mono ...">` (the deletion receipt). A text probe for `font-mono` over this folder reports it; excluding `<code>` / `<pre>` is what Spec 031 NS-01 requires, and **it is not implemented in P0** (Spec 025 defines no exclusion field, so `evaluateTokenBans` reports it) |
| `#dcfce7` | 1 | `native/design/ontology.tokens.json`: `guava-leaf-100: #dcfce7`. It is the pastel pill colour as a sealed palette token: defined, referenced by no other vendored file and by none of the fixtures. A hex probe for the pastel pill expects 1 here, not 0 |
| `uppercase` | 1 | `native/chunks/9k9xcff1.js`: the tailwind-merge config entry `"text-transform":["uppercase",…]` — a class-group definition, not a rendered uppercase tag. A probe for the uppercase-tag drift over this folder expects 1 here, not 0 |

## Vendored files (byte-identical copies)

| Local file | Origin path | Commit | Blob | Bytes | Check |
|---|---|---|---|---|---|
| `source/native/berry-cli-terminal-dock.28c1e86.js` | `src/client/berry-cli-terminal-dock.js` | `28c1e86` | `3cf66ba5eca5375252b590d4fd2b7c1a7f317127` | 8717 | identical |
| `source/native/cli-harness-router.28c1e86.js` | `src/server/cli-harness-router.js` | `28c1e86` | `16d8d68362a44846ac20e19a85952abbbbacf586` | 10158 | identical |
| `source/native/account-route-node-71.C77w0PPh.js` | `public/_app/immutable/nodes/71.C77w0PPh.js` | `28c1e86` | `765b677c237265b571260b103685fa879efc7b70` | 45220 | identical |
| `source/native/settings-layout-node-11.C9det9-x.js` | `public/_app/immutable/nodes/11.C9det9-x.js` | `28c1e86` | `bddfba90e30647d4459295f0f8f8439827dd0143` | 22514 | identical |
| `source/native/chunks/m8Kg1K1n.js` | `public/_app/immutable/chunks/m8Kg1K1n.js` | `28c1e86` | `dd5f4e982bb007e958a1a504cbffc8adb85dc17a` | 77 | identical |
| `source/native/chunks/Cj9WbYNy.js` | `public/_app/immutable/chunks/Cj9WbYNy.js` | `28c1e86` | `9de4d1126bc132066a56bc3acf6660009e6d3667` | 483 | identical |
| `source/native/chunks/cZ0pNadS.js` | `public/_app/immutable/chunks/cZ0pNadS.js` | `28c1e86` | `ea045072116640315e74687f09e3a30d204cdf14` | 513 | identical |
| `source/native/chunks/zb3QUMUw.js` | `public/_app/immutable/chunks/zb3QUMUw.js` | `28c1e86` | `a293ac38d6be1a1a5ed5b241f48a87f77cb06ef9` | 594 | identical |
| `source/native/chunks/Dp-6Tp0Z.js` | `public/_app/immutable/chunks/Dp-6Tp0Z.js` | `28c1e86` | `2dc235860182b6d471659595d1f7ecd3fa872770` | 1543 | identical |
| `source/native/chunks/UcHMlLw1.js` | `public/_app/immutable/chunks/UcHMlLw1.js` | `28c1e86` | `fc27f80b2bc3818fd9b4e743c9490aee78ad6c93` | 1124 | identical |
| `source/native/chunks/Bo2dmbtA.js` | `public/_app/immutable/chunks/Bo2dmbtA.js` | `28c1e86` | `14a1b853e4691d5b6cc33266439448c62b0d39c8` | 449 | identical |
| `source/native/chunks/BcEwtP1q.js` | `public/_app/immutable/chunks/BcEwtP1q.js` | `28c1e86` | `db3e44a221bdcb8cce598cfa0c744733c0270ea9` | 867 | identical |
| `source/native/chunks/ACufibVP.js` | `public/_app/immutable/chunks/ACufibVP.js` | `28c1e86` | `f0d08b53d63d5ff3666fc049b4953403adc948fb` | 883 | identical |
| `source/native/chunks/a_C1_LGN.js` | `public/_app/immutable/chunks/a_C1_LGN.js` | `28c1e86` | `2fabbf087f390f25ac20f4f3ff68d13d36a0a06b` | 1077 | identical |
| `source/native/chunks/C2ZPEHK5.js` | `public/_app/immutable/chunks/C2ZPEHK5.js` | `28c1e86` | `2bec470ac21453729ee263eccf6e5fd35690d0ee` | 8863 | identical |
| `source/native/chunks/9k9xcff1.js` | `public/_app/immutable/chunks/9k9xcff1.js` | `28c1e86` | `bbc5a52ccbf74938616d8c9b2cabb42766294d85` | 20465 | identical |
| `source/native/chunks/B-dksMZM.js` | `public/_app/immutable/chunks/B-dksMZM.js` | `28c1e86` | `b8badebbb2b14d6bf0fb27d3a873feae19beaad7` | 374 | identical |
| `source/native/design/design.tokens.json` | `design/design.tokens.json` | `28c1e86` | `861c108e4e4ca3e514df3cdf83220bdcd1731194` | 9293 | identical |
| `source/native/design/ontology.tokens.json` | `design/ontology.tokens.json` | `28c1e86` | `40d5db5e5c8d842f97af38bb6963fd1298802ebc` | 10953 | identical |
| `tokens.json` | `design/design.tokens.json` | `28c1e86` | `861c108e4e4ca3e514df3cdf83220bdcd1731194` | 9293 | identical |

Check column: `git hash-object` of the local copy equals the blob id of `<commit>:<origin path>` in the oi-browser clone.

## Scripts (run with Node 20+; paths are the scratch locations used for this freeze)

### Script A: render a dock fixture

`node build-dock-fixture.mjs <dock.js> <router.js> <sha> <label> <out.html>`, once per commit:
`06de5e2` with label `CLI Core settings (bad screen)`, `28c1e86` with label `CLI Core settings (good screen)`.

```js
// Usage: node build-dock-fixture.mjs <dock.js> <router.js> <sha> <label> <out.html>
// Renders the CLI Core settings panel exactly as berry-cli-terminal-dock.js builds it,
// using the harness list that cli-harness-router.js of the same commit declares.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [dockFile, routerFile, sha, label, outFile] = process.argv.slice(2);
const dockSrc = fs.readFileSync(dockFile, "utf8").replace(/^export /gm, "");
const routerSrc = fs.readFileSync(routerFile, "utf8");

// HARNESS_SPECS is a plain array literal; evaluate it with the same `path`/`os` it uses.
const start = routerSrc.indexOf("const HARNESS_SPECS = [");
const end = routerSrc.indexOf("\n];", start) + 3;
const specs = new Function("path", "os", `${routerSrc.slice(start, end)}\nreturn HARNESS_SPECS;`)(path, os);
// discoverHarnesses() on a machine where no candidate binary resolves.
const harnesses = specs.map((s) => ({ ...s, binaryPath: null, installed: s.id === "auto" || s.id === "local" }));

let css = "";
const fakeDocument = {
  getElementById: () => null,
  createElement: () => ({}),
  head: { appendChild: (el) => { css = el.textContent; } },
};
const mod = new Function(
  "document",
  `${dockSrc}\nreturn { dockState, injectDockStyles, buildSettingsPanelHtml };`,
)(fakeDocument);

mod.dockState.harnesses = harnesses;
mod.injectDockStyles();

// Same derivations renderCliDock() performs before calling the builder.
const ds = mod.dockState;
const totalBins = ds.harnesses.filter((h) => h.binary).length || 5;
const installedCount = ds.harnesses.filter((h) => h.binary && h.installed).length || 5;
const activeSpec = ds.harnesses.find((h) => h.id === ds.activeHarnessId) || { badge: "AUTO", label: "Auto Router" };
const panel = mod.buildSettingsPanelHtml(installedCount, totalBins, activeSpec);

const html = `<!--
Frozen fixture: jangtrinh/oi-browser @ ${sha}
Screen: ${label}
Source: src/client/berry-cli-terminal-dock.js (style template literal + buildSettingsPanelHtml output)
Harness data: HARNESS_SPECS from src/server/cli-harness-router.js @ ${sha}, binaryPath null,
  installed true only for auto/local (no CLI binary resolved), activeHarnessId "auto", recentRuns [].
Extraction: scripted render, see SOURCES.md. CSS and markup are verbatim; nothing was edited by hand.
-->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${label}</title>
<style>${css}</style>
</head>
<body>
<div id="oi-cli-settings-host">
${panel}
</div>
</body>
</html>
`;
fs.writeFileSync(outFile, html);
console.log(`${outFile}: ${html.length} bytes, ${html.split("\n").length} lines`);
```

### Script D: compute the merged class lists with the app's own `cn()` / `tv()`

`node compute-merged-classes.mjs tests/fixtures/oi-browser/source/native/chunks > merged.json`

```js
// Script D. Computes every merged class list of the anchor with oi-browser's OWN compiled cn()
// (chunks 9k9xcff1.js + B-dksMZM.js @ 28c1e86), and the Button list with its own compiled tv() config.
// Usage: node compute-merged-classes.mjs <dir holding the vendored chunks> > merged.json
// The class strings fed to cn() are read out of the vendored component chunks by pattern, so nothing
// is retyped by hand; a pattern that stops matching throws.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const chunks = process.argv[2];
const read = (name) => fs.readFileSync(path.join(chunks, `${name}.js`), "utf8");
const grab = (text, re, label) => {
  const m = re.exec(text);
  if (!m) throw new Error(`pattern for ${label} no longer matches`);
  return m.slice(1);
};

// Run the compiled modules as ESM from a scratch dir (they are plain ES modules named .js).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oi-cn-"));
fs.writeFileSync(path.join(tmp, "package.json"), '{"type":"module"}');
for (const n of ["9k9xcff1", "B-dksMZM"]) fs.copyFileSync(path.join(chunks, `${n}.js`), path.join(tmp, `${n}.js`));
// Button: keep only the compiled tailwind-variants code and the `oe = tv({...})` config; drop the
// Svelte runtime import and the component code that follows the config.
const btn = read("C2ZPEHK5");
const start = btn.indexOf("var Ve=");
const end = btn.indexOf("var Ee=new Set(");
if (start < 0 || end < 0) throw new Error("Button chunk layout changed");
fs.writeFileSync(
  path.join(tmp, "button-tv.js"),
  `import{t as xe,e as Ce,c as ae}from"./9k9xcff1.js";${btn.slice(start, end)};export{oe,ae};`,
);
const { c: cn } = await import(pathToFileURL(path.join(tmp, "9k9xcff1.js")).href);
const { oe: buttonTv, ae: buttonCn } = await import(pathToFileURL(path.join(tmp, "button-tv.js")).href);
fs.rmSync(tmp, { recursive: true, force: true });

// Inputs, read from the chunks.
const [groupTrue, groupFalse] = grab(read("Cj9WbYNy"), /h\(o\?"([^"]*)":"([^"]*)",s\.class\)/, "OptionsGroup");
const [cardBase] = grab(read("Dp-6Tp0Z"), /g\("(bg-card[^"]*)",a\.class\)/, "Card base");
const [cardTrue] = grab(read("Dp-6Tp0Z"), /g\(t\?"([^"]*)":"/, "OptionsGroupCard (context true)");
const [itemTrue, itemClickTrue] = grab(read("UcHMlLw1"), /R\(m\?"([^"]*)":"[^"]*",i\(f\)&&\(m\?"([^"]*)":"/, "OptionItem");
const [itemWrap] = grab(read("Bo2dmbtA"), /b\("([^"]*)",a\.class\)/, "OptionItem wrapper");
const [titleBase] = grab(read("BcEwtP1q"), /_\("(leading-none[^"]*)",e\.class\)/, "ItemTitle base");
const [titleOwn] = grab(read("BcEwtP1q"), /_\("(text-sm[^"]*)",e\.class\)/, "ItemTitle own");
const [descBase] = grab(read("ACufibVP"), /_\("(text-muted-foreground text-sm)",t\.class\)/, "ItemDescription base");
const [descOwn, descBalance] = grab(read("ACufibVP"), /_\("(text-xs[^"]*)",s&&"([^"]*)",t\.class\)/, "ItemDescription own");

// Instances as node 71 calls them (settings-surface context = true).
const out = {
  group: cn(groupTrue, undefined),
  card: cn(cardBase, cn(cardTrue, undefined)),
  item: cn(itemWrap, cn(itemTrue, false, undefined)),
  itemClickable: cn(itemWrap, cn(itemTrue, itemClickTrue, undefined)),
  title: cn(titleBase, cn(titleOwn, undefined)),
  titleDestructive: cn(titleBase, cn(titleOwn, "text-destructive")),
  desc: cn(descBase, cn(descOwn, descBalance, undefined)),
  descFlex: cn(descBase, cn(descOwn, descBalance, "flex items-center gap-1.5")),
  buttonShrink: buttonCn(buttonTv({ variant: "secondary", size: "sm" }), "relative", "shrink-0"),
  button: buttonCn(buttonTv({ variant: "secondary", size: "sm" }), "relative", undefined),
};
console.log(JSON.stringify(out, null, 2));
```

### Script E: fill the markup template

`node fill-template.mjs anchor-body.tpl.html merged.json > anchor-body.html`

```js
// Usage: node fill-template.mjs <body.tpl.html> <merged.json> > body.html
// Replaces every {{name}} with the class list Script D computed; fails on a missing or unused name.
import fs from "node:fs";

const [tplFile, jsonFile] = process.argv.slice(2);
const merged = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
const used = new Set();
const html = fs.readFileSync(tplFile, "utf8").replace(/\{\{(\w+)\}\}/g, (_, name) => {
  if (!(name in merged)) throw new Error(`no merged class list named '${name}'`);
  used.add(name);
  return merged[name];
});
const unused = Object.keys(merged).filter((k) => !used.has(k));
if (unused.length) throw new Error(`merged class lists never placed: ${unused.join(", ")}`);
process.stdout.write(html);
```

### Script B: select the CSS rules

`node extract-css-rules.mjs 0.aoqKTpgP.css anchor-body.html > anchor-rules.css`, where `anchor-body.html` is the
filled markup (the body of `settings-account.html`) and `0.aoqKTpgP.css` is
`git show 28c1e86:public/_app/immutable/assets/0.aoqKTpgP.css`.

```js
// Usage: node extract-css-rules.mjs <compiled.css> <body.html> [--list-base]
// Prints, in source order and verbatim, (a) every non-class top-level rule (reset, :root theme
// variables, tag selectors) and (b) every rule whose selector starts with a class used in body.html.
import fs from "node:fs";

const [cssFile, bodyFile, flag] = process.argv.slice(2);
const css = fs.readFileSync(cssFile, "utf8");
const body = fs.readFileSync(bodyFile, "utf8");

// Class tokens used by the composition.
const classes = new Set();
for (const m of body.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
const esc = (c) => c.replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\" + ch);
const escaped = [...classes].map(esc);

// Split into top-level blocks by brace depth.
function blocks(text) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { out.push(text.slice(start, i + 1)); start = i + 1; } }
    else if (ch === ";" && depth === 0) { out.push(text.slice(start, i + 1)); start = i + 1; }
  }
  return out;
}

function selectorsOf(block) { return block.slice(0, block.indexOf("{")).trim(); }
function splitSelectors(sel) {
  const parts = []; let depth = 0, cur = "";
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === "\\") { cur += ch + sel[i + 1]; i++; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
// A selector "uses" class c when it contains `.c` not followed by another identifier character.
function usesUsedClass(sel) {
  return escaped.some((c) => {
    let from = 0;
    for (;;) {
      const at = sel.indexOf("." + c, from);
      if (at < 0) return false;
      const next = sel[at + c.length + 1];
      if (next === undefined || !/[A-Za-z0-9_\\-]/.test(next)) return true;
      from = at + 1;
    }
  });
}

const kept = [];
const baseOnly = [];
for (const block of blocks(css)) {
  const head = selectorsOf(block);
  if (head.startsWith("@media") || head.startsWith("@supports")) {
    const inner = block.slice(block.indexOf("{") + 1, block.lastIndexOf("}"));
    const innerKept = blocks(inner).filter((b) => splitSelectors(selectorsOf(b)).some(usesUsedClass));
    if (innerKept.length) kept.push(`${head}{${innerKept.join("")}}`);
    continue;
  }
  if (head.startsWith("@")) continue; // @font-face, @keyframes: not used by the composition
  const sels = splitSelectors(head);
  if (sels.some(usesUsedClass)) { kept.push(block); continue; }
  // Skipped on purpose: the UA default for <code>/<pre> (monospace stack; the composition has no such element)
  // and view-transition animations (their @keyframes are not part of the composition).
  if (/monospace|view-transition/.test(head + block)) continue;
  if (sels.every((s) => !s.includes("."))) baseOnly.push(block);
}
if (flag === "--list-base") { for (const b of baseOnly) console.log(b.slice(0, 160).replace(/\n/g, " ")); process.exit(0); }
process.stdout.write([...baseOnly, ...kept].join("\n") + "\n");
console.error(`classes=${classes.size} base-rules=${baseOnly.length} class-rules=${kept.length}`);
```

### Script C: wrap the anchor

`node assemble-anchor.mjs anchor-rules.css anchor-body.html settings-account.html` prepends the provenance comment
and wraps the rules and the body in a minimal HTML document.

```js
// Usage: node assemble-anchor.mjs <rules.css> <body.html> <out.html>
import fs from "node:fs";

const [rulesFile, bodyFile, outFile] = process.argv.slice(2);
const rules = fs.readFileSync(rulesFile, "utf8").trimEnd();
const body = fs.readFileSync(bodyFile, "utf8").trimEnd();
const html = `<!--
Frozen fixture (MANUAL COMPOSITION): jangtrinh/oi-browser @ 28c1e86
Screen: native /settings/account (SvelteKit route (app)/settings/account, node 71)
oi-browser ships no .svelte source; the route exists only as compiled bundles under public/_app/immutable/.
Markup strings come from node 71 and the OptionsGroup / OptionItem / PageHeader / Button chunks;
Merged class lists are computed with the app's own compiled cn() and tv() (SOURCES.md, Script D).
CSS rules are the verbatim rules of assets/0.aoqKTpgP.css whose selector uses a class of this page.
No rendering, no dev server. Exact files and the composition rules: SOURCES.md.
-->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Account</title>
<style>
${rules}
</style>
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(outFile, html);
console.log(`${outFile}: ${html.length} bytes, ${html.split("\n").length} lines`);
```
