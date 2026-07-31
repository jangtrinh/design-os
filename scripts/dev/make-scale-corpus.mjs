#!/usr/bin/env node
/**
 * Registry-integrity phase 04 (5.4), §0 — the SEEDED 10k-component / 50k-frame corpus
 * every part of phase 04 measures its before/after against. Deterministic: a fixed seed
 * (default 42) means two runs with the same flags produce byte-identical output — "a
 * headline number is a hypothesis until measured," and a moving fixture would make every
 * measurement in the phase unrepeatable.
 *
 * Usage:
 *   node scripts/dev/make-scale-corpus.mjs --components 10000 --changes 50000 --out /tmp/scale-corpus
 *
 * Produces, under <out>/design/:
 *   component-registry.json   — <components> records, ~40 categories, realistic
 *                                Category/Variant names, plus a deliberate handful of
 *                                CASE-ONLY near-duplicates (e.g. Button/Primaryaa vs
 *                                Button/PRIMARYAA) to exercise the slug-collision path
 *                                (two distinct registry records, one shared lowercase slug).
 *   figma.changes.jsonl        — <changes> frames across 3 fileKeys (one of them a
 *                                Figma-Free file, fileKey: null, so the fileName-slug
 *                                branch is exercised too — same tier this whole wave
 *                                targets).
 *   components/<file-slug>/*.figma.json — sidecars for a 2000-component subset (every
 *                                5th record), split across the 3 files' slugs.
 *   memory/figma-corrections.jsonl — 5000 correction events, 1200 of them
 *                                `unresolved: true` (the immortality path phase 04 §3 fixes).
 *
 * No repo import: this script is outside both the kernel and figma-agent's tsconfigs, and
 * Node's plain ESM loader cannot import a sibling package's .ts file without a transpile
 * step — so the small pure helpers it needs (name/file slugging, the correction content
 * hash) are duplicated here, the same "the log/wire is the contract, not the type"
 * convention the kernel already uses for figma-agent's ChangeFrame.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ─── CLI args ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { components: 10000, changes: 50000, out: "/tmp/scale-corpus", seed: 42 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === "--components") out.components = Number.parseInt(val(), 10);
    else if (a === "--changes") out.changes = Number.parseInt(val(), 10);
    else if (a === "--out") out.out = val();
    else if (a === "--seed") out.seed = Number.parseInt(val(), 10);
    else throw new Error(`unknown flag: ${a}`);
  }
  return out;
}

// ─── Seeded PRNG (mulberry32) — deterministic across runs/platforms ────────────
function mulberry32(seed) {
  let s = seed | 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Slug helpers (duplicated, not imported — see header) ──────────────────────
/** Mirrors figma-reconcile.ts / file-identity.ts's safeSlug exactly. */
function safeSlug(raw) {
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "unknown";
}
/** Mirrors html-export.ts's toSafeFilename exactly (component-name → sidecar slug). */
function toSafeFilename(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "component";
}
/** fileKey verbatim when present, else slugged fileName, else 'unknown' — the canonical chain. */
function fileIdentity(fileKey, fileName) {
  if (typeof fileKey === "string" && fileKey.trim() !== "") return fileKey;
  return safeSlug(fileName ?? "");
}

// ─── Correction content hash (duplicated from figma-agent/shared/supervised-memory.ts) ─
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function correctionContentHash(value) {
  const text = canonical(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function buildCorrectionEvent(input) {
  const body = { ...input, v: 1 };
  return { ...body, contentHash: correctionContentHash(body) };
}

// ─── Fixture generation ─────────────────────────────────────────────────────────
const CATEGORIES = [
  "Button", "Card", "Modal", "Input", "Select", "Checkbox", "Radio", "Switch", "Slider",
  "Tooltip", "Badge", "Avatar", "Alert", "Toast", "Banner", "Tabs", "Accordion",
  "Breadcrumb", "Pagination", "Table", "List", "Menu", "Dropdown", "Navbar", "Sidebar",
  "Footer", "Header", "Hero", "Form", "Label", "Chip", "Tag", "Progress", "Spinner",
  "Skeleton", "Divider", "Drawer", "Popover", "Stepper", "Timeline",
];
const VARIANT_WORDS = [
  "Primary", "Secondary", "Tertiary", "Compact", "Large", "Small", "Outline", "Ghost",
  "Filled", "Rounded", "Square", "Default", "Active", "Disabled", "Hover",
];
const CHANGE_PROP_POOL = ["fills", "cornerRadius", "itemSpacing", "name", "layoutMode", "paddingTop"];

/** Spreadsheet-style base-26 letters, 0→a, 25→z, 26→aa … — unique per index, letters only
 *  (NAME_PATTERN requires [A-Za-z]+, no digits, so an index cannot be embedded numerically). */
function toLetters(nIn) {
  let n = nIn + 1;
  let s = "";
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function componentName(i) {
  const category = CATEGORIES[i % CATEGORIES.length];
  const variantWord = VARIANT_WORDS[(i * 7) % VARIANT_WORDS.length];
  return `${category}/${variantWord}${toLetters(i)}`;
}

/** ~50 deliberate case-only near-duplicates in the LAST 50 slots (the slug-collision
 *  path — two valid, distinct registry names whose sidecar slug collides). */
const CASE_DUP_COUNT = 50;

function buildRegistry(componentCount, rand) {
  const components = [];
  for (let i = 0; i < componentCount; i++) {
    const isDup = i >= componentCount - CASE_DUP_COUNT;
    const name = isDup ? componentName(i - (componentCount - CASE_DUP_COUNT)).toUpperCase() : componentName(i);
    components.push({
      name,
      category: name.split("/")[0],
      markup: "<div></div>",
      tokensUsed: [],
      scope: rand() < 0.2 ? "global" : "local",
      description: `Generated fixture component ${i}`,
    });
  }
  return { version: "0.1.0", components };
}

const FILES = [
  { fileKey: "aAbBcCdDeEfFgGhH01", fileName: "Marketing Site" },
  { fileKey: "zZyYxXwWvVuUtTsSrR02", fileName: "Design System" },
  { fileKey: null, fileName: "Free Tier Sandbox" }, // Figma-Free file — exercises the fileName-slug branch
];

function buildChangeLog(frameCount, components, rand) {
  const lines = [];
  const ops = ["created", "updated", "deleted"];
  const opWeights = [0.1, 0.7, 0.2];
  for (let j = 0; j < frameCount; j++) {
    const file = FILES[j % FILES.length];
    const component = components[j % components.length];
    let r = rand();
    let op = ops[ops.length - 1];
    let acc = 0;
    for (let k = 0; k < ops.length; k++) {
      acc += opWeights[k];
      if (r <= acc) { op = ops[k]; break; }
    }
    const propCount = 1 + Math.floor(rand() * 3);
    const changedProps = [];
    for (let k = 0; k < propCount; k++) {
      const p = CHANGE_PROP_POOL[Math.floor(rand() * CHANGE_PROP_POOL.length)];
      if (!changedProps.includes(p)) changedProps.push(p);
    }
    const frame = {
      v: 1,
      ts: j,
      op,
      nodeId: `${j % FILES.length}:${component.name}`,
      nodeName: op === "deleted" && rand() < 0.05 ? null : component.name,
      nodeType: "COMPONENT",
      changedProps,
      origin: rand() < 0.3 ? "REMOTE" : "LOCAL",
      scopeHint: component.scope === "global" ? "global" : "local",
      page: "Page 1",
      fileKey: file.fileKey,
      ...(typeof file.fileName === "string" && { fileName: file.fileName }),
    };
    lines.push(JSON.stringify(frame));
  }
  return lines.join("\n") + "\n";
}

function buildSidecars(designDir, components, rand) {
  let written = 0;
  const target = Math.min(2000, components.length);
  const step = Math.max(1, Math.floor(components.length / target));
  for (let i = 0; i < components.length && written < target; i += step) {
    const c = components[i];
    const file = FILES[written % FILES.length];
    const fileSlug = fileIdentity(file.fileKey, file.fileName);
    const dir = join(designDir, "components", safeSlug(fileSlug));
    mkdirSync(dir, { recursive: true });
    const node = {
      type: "FRAME",
      name: c.name,
      layoutMode: rand() < 0.5 ? "HORIZONTAL" : "VERTICAL",
      itemSpacing: Math.floor(rand() * 24),
      fills: [{ type: "SOLID", color: { r: rand(), g: rand(), b: rand(), a: 1 } }],
    };
    const sidecar = { version: "0.1.0", name: c.name, node };
    writeFileSync(join(dir, `${toSafeFilename(c.name)}.figma.json`), JSON.stringify(sidecar, null, 2) + "\n", "utf8");
    written += 1;
  }
  return written;
}

const UNRESOLVED_COUNT = 1200;

function buildCorrections(eventCount, components, rand) {
  const lines = [];
  const nonFreeFiles = FILES.filter((f) => f.fileKey !== null);
  for (let k = 0; k < eventCount; k++) {
    const file = nonFreeFiles[k % nonFreeFiles.length];
    const component = components[k % components.length];
    const unresolved = k < UNRESOLVED_COUNT;
    const event = buildCorrectionEvent({
      eventId: `${unresolved ? "correction" : "agent"}-${k}-${component.name.replace(/[^a-z0-9]/gi, "-")}`,
      fileKey: file.fileKey,
      nodeId: `corr:${k}`,
      source: unresolved ? "designer" : "agent",
      kind: unresolved ? "designer-correction" : "agent-operation",
      timestamp: new Date(1_700_000_000_000 + k * 1000).toISOString(),
      ...(unresolved && { unresolved: true }),
      traits: { changeType: "PROPERTY_CHANGE", properties: ["fills"], seed: Math.floor(rand() * 1000) },
    });
    lines.push(JSON.stringify(event));
  }
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rand = mulberry32(opts.seed);
  const designDir = join(opts.out, "design");
  mkdirSync(designDir, { recursive: true });
  mkdirSync(join(designDir, "memory"), { recursive: true });

  const registry = buildRegistry(opts.components, rand);
  writeFileSync(join(designDir, "component-registry.json"), JSON.stringify(registry, null, 2) + "\n", "utf8");

  const changeLog = buildChangeLog(opts.changes, registry.components, rand);
  writeFileSync(join(designDir, "figma.changes.jsonl"), changeLog, "utf8");

  const sidecarsWritten = buildSidecars(designDir, registry.components, rand);

  const corrections = buildCorrections(5000, registry.components, rand);
  writeFileSync(join(designDir, "memory", "figma-corrections.jsonl"), corrections, "utf8");

  console.log(JSON.stringify({
    out: opts.out,
    seed: opts.seed,
    components: registry.components.length,
    frames: opts.changes,
    sidecars: sidecarsWritten,
    correctionEvents: 5000,
    unresolvedCorrections: UNRESOLVED_COUNT,
  }, null, 2));
}

main();
