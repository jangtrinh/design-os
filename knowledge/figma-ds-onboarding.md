---
id: figma-ds-onboarding
description: "Install and verify the design:os Figma plugin, then read an owner's design system into portable local stores."
when: [figma, onboarding, design-system, plugin-install]
---

# Figma DS onboarding with the design:os plugin

## Purpose

Guide the owner and host through plugin installation, exact-file verification and
portable, unsealed DS inventory capture.

## When to Use / When NOT

**Use** for Figma DS onboarding, plugin setup, or a fresh source inventory capture.
The owner may explicitly choose another read/export path after its limits are clear.

**Do NOT** use this flow as proof of a mapped application kit, sealed-DS readiness,
accepted lessons, or completed canvas authoring: those require their own verified
artifacts and owner-authorized scope.

## Content

Use the **design:os Figma plugin** as the default for reading an owner's DS from
Figma, regardless of seat. Guide the owner through every step below. The plugin
and `figma-agent` are a separate install from `ease-design`; a missing bridge is
a setup task, not a reason to switch tools or generate a substitute design.

The host performs installation and live reads; `ui` only transforms local files.
Give the owner actionable instructions when they must operate Figma Desktop.
Execute installation in the chosen tools folder when authorized; otherwise show
the steps. Do not add global hooks or overwrite customized runtime files as part
of a read-only DS onboarding request.

### 1. Check prerequisites and choose folders

The owner needs Figma Desktop, access to the source file, Git, Node.js and npm.
Node.js 22 is the plugin repository's CI-tested version. The local bridge does
not require a personal access token. Canvas writes need edit access; no write
is needed to prove the first read. Confirm the exact owner file and DS pages.

```sh
git --version
node --version
npm --version
ui --version
```

If `ui` is missing, install the kernel with `npm install -g ease-design`, then
run `ui doctor`. Ask the owner for a tools folder and an absolute project path;
do not put the plugin source inside their application by accident.

### 2. Install the separate plugin and CLI

In the chosen tools folder:

```sh
git clone https://github.com/jangtrinh/design-os-figma-plugin.git
cd design-os-figma-plugin
npm ci
npm run build
DS_FIGMA_CLI="$PWD/cli/dist/figma-agent.js"
```

Keep this terminal open. `DS_FIGMA_CLI` is the absolute CLI path for the remaining
examples; set it again in a new terminal. No global `figma-agent` link is needed.
When the repo is already installed, inspect its state and use its
[upgrade guide](https://github.com/jangtrinh/design-os-figma-plugin/blob/main/docs/operations.md#upgrading-the-installed-cli-and-broker)
instead of cloning over it or discarding local changes.

### 3. Import and open the plugin in Figma Desktop

1. Open Figma Desktop. Choose **Plugins → Development → Import plugin from manifest…**.
2. Select `plugin/manifest.json` inside the clone that just built successfully.
3. Open the owner's source file, then run the imported development plugin. Its
   manifest name is **Ease Design Figma Agent**. Keep its panel open.
4. If Figma prompts for plugin/network permission, explain the local broker
   connection and let the owner complete the prompt. A closed panel disconnects
   the bridge. After a rebuild, close and reopen the imported plugin so it runs
   the new code; a successful CLI build does not update an already-open panel.

An initial idle/looking-for-broker state is normal before the next step. Do not
claim the plugin is installed or connected solely because the manifest imported.

### 4. Verify and pin the exact file

```sh
node "$DS_FIGMA_CLI" status --wait --timeout 60
```

`status --wait` can start the local broker; its timeout here is **seconds**.
`status --peek` only inspects an existing broker. Read the JSON reply and confirm
the connected file is the owner's intended file. Copy its real `instanceId`:

```sh
DS_FIGMA_INSTANCE='<instanceId from the matching connected file>'
node "$DS_FIGMA_CLI" get-selection --instance "$DS_FIGMA_INSTANCE"
```

Select a known frame/component first; an empty selection is not a failed bridge.
Check that the reply describes the selected owner node. Pin all later live reads
with the same `--instance`. File names and the most recently active tab are not
reliable identity when several files are open. After reopening the plugin, get
the new instance ID. Never substitute a remembered ID or send unpinned reads.

### 5. Save the full DS inventory

Replace the project path below with the owner's actual absolute project folder:

```sh
DS_PROJECT='/absolute/path/to/owner-project'
mkdir -p "$DS_PROJECT/design-source/figma"
node "$DS_FIGMA_CLI" scan-design-system --instance "$DS_FIGMA_INSTANCE" \
  --out "$DS_PROJECT/design-source/figma/ds.json"
```

Check the command exit status and reported `path`/`counts`, then read the saved
JSON. With `--out`, stdout is a summary; the full inventory is in the file.
Keep that source file and record the file identity, capture time and plugin build.

The current scanner loads all pages and enumerates local component definitions,
component sets, local variables and local styles. Variant children are represented
through their set. Variable values currently use the collection's default mode;
this scan alone does **not** prove every mode, remote library, instance override,
state or component implementation was captured. Reconcile the owner's inventory
against the result and list missing source facts explicitly. Obtain further
plugin reads or owner-provided exports for those facts before declaring coverage.
Do not fabricate absent modes or count icons/screens as reusable DS components.

### 6. Compile locally and reconcile portable inventory

```sh
ui ingest-figma-ds "$DS_PROJECT/design-source/figma/ds.json" \
  --out "$DS_PROJECT" --name '<owner-ds-slug>' --seed-memory --json
```

Require a successful JSON reply before checking the outputs. Copy its exact
`data.registry` path into the variable below; do not assume the filename. If the
project already owns a foreign `component-registry.json`, ingest selects a
separate registry path. Use `ui schema --json` for the supported ingest interface;
take output paths from the successful ingest reply.

```sh
DS_INGEST_REGISTRY='<absolute data.registry path from the successful ingest reply>'
ui tokens compile "$DS_PROJECT/tokens.json" --json
ui registry list --file "$DS_INGEST_REGISTRY" --json
```

Reconcile captured, registered and unresolved inventory using these actual outputs.
Keep the scan, portable token tree, returned registry and `DESIGN.md` as evidence.
**Stop here at portable, unsealed inventory.** Plugin installation, a verified live
read and successful local compilation do not establish a sealed DS or complete kit.
Do not automatically replace an existing seal or treat its revision as belonging to
this new capture. Seeded memory is observation history, not accepted lessons.

For a future web implementation, the target is shadcn and Tailwind while preserving
the owner's semantic tokens, names, variants, states and compositional patterns.
A starter kit is a floor, not a 25-component cap; retain unresolved mappings beyond
it. This setup and capture flow does not implement that mapping or generate a React
kit. Native platform rules retain their own target.

#### Conditional next stage: validate the seal and mapped inventory

Only after a separately authorized, explicitly validated stage maps the captured
inventory into the owner's sealed store may this capture support accepted lessons.
That stage must preserve the reviewed DS identity, reconcile all source-backed
components and patterns, and verify the resulting seal and evidence. Importing
only tokens is insufficient: `ds import` creates an empty registry. A token-only
seal cannot establish captured component coverage.

The following checks belong to that future stage, **not** completion of the setup
and portable-inventory flow above. Run them from the owner project only after the
mapped store exists:

```sh
ui ds status --json
ui ds context --strict --with-theme
ui registry list --json
ui memory context --for generate --json --max-bytes 16384
```

Require a healthy seal, reconciled full inventory and disclosed unresolved facts.
Look up every exact task target before authoring. Accepted lessons require the
verified revision, matching evidence and an explicit owner decision; setup success
or recurrence cannot supply acceptance.

### 7. Connect the host

Claude, Codex, Antigravity or any shell-capable agent can run the absolute CLI
path. Use `ui init` for the chosen runtime's design:os workflow adapters. The
plugin's `install-skill` defaults to Claude's skill folder; it is optional, not
a prerequisite for another runtime. Consult its live help before choosing a
different skill folder. Do not install a SessionStart hook just to read a DS.

### Handback: setup and inventory, with the store boundary explicit

Report plugin setup and the exact-file live read separately from captured inventory
coverage. Include the returned file paths, source identity and build, verification
results, and unresolved facts. Mark the captured bundle **portable and unsealed**;
if an older sealed store exists, distinguish it from this capture. Report sealed-DS
readiness and accepted-lesson eligibility as not established by this flow. Setup
can be complete while inventory coverage still has gaps; disclose both.

## Failure Modes

- **CLI missing:** use the built absolute path above; `npm install ease-design`
  does not install `figma-agent`.
- **No connection:** keep Desktop and the imported panel open, run `status --wait`,
  and check that the imported manifest belongs to the clone just built.
- **Wrong file:** select the matching connected instance, repeat the read-only
  selection check, then pin the scan. Do not guess from the active tab.
- **Version/stale-plugin error:** rebuild the matching clone and reopen the plugin;
  follow its upgrade guide for an older running broker.
- **Broker/timeout error:** inspect `status --peek` and the plugin's reported
  connection details. Ports are in the 9410–9419 range, not always 9410. Use the
  plugin's troubleshooting guide; do not kill unrelated processes or replay an
  unknown canvas mutation. Scan timeouts use milliseconds if explicitly overridden.
- **Missing facts:** retain the partial inventory and its gaps. Offer an explicit
  owner-chosen alternate read/export path; never report setup or full DS coverage
  as complete because compilation of a fixture succeeded.

Source: [plugin installation and first use](https://github.com/jangtrinh/design-os-figma-plugin#install-once),
[scanner](https://github.com/jangtrinh/design-os-figma-plugin/blob/main/plugin/src/main/serialize-node.ts),
[operations](https://github.com/jangtrinh/design-os-figma-plugin/blob/main/docs/operations.md).
