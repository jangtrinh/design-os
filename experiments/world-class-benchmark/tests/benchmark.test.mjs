import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("exposes the historical and orchestrated variants", async () => {
  const [html, cases] = await Promise.all([read("index.html"), read("scripts/cases.js")]);
  for (const variant of [
    "raw", "enhanced", "qualified", "orchestrated-content-led",
    "orchestrated-golden", "orchestrated-selected", "art-directed",
  ]) {
    assert.match(html, new RegExp(`value="${variant}"`));
  }
  for (const caseId of ["d01", "d02", "d03"]) assert.match(cases, new RegExp(`${caseId}:`));
});

test("D01 orchestration invests in every major region", async () => {
  const [render, css] = await Promise.all([
    read("scripts/render.js"), read("styles/orchestration.css"),
  ]);
  for (const region of [
    "architecture-hero", "land-section", "material-section",
    "architecture-process", "architecture-conclusion",
  ]) {
    assert.match(render, new RegExp(region));
    assert.match(css, new RegExp(region));
  }
  assert.doesNotMatch(render, /[—–]/u);
  assert.match(render, /"art-directed"/);
});

test("uses section-specific visual evidence instead of CSS material placeholders", async () => {
  const [render, css] = await Promise.all([
    read("scripts/render.js"), read("styles/orchestration.css"),
  ]);
  for (const asset of [
    "d01-site-analysis-v2.webp",
    "d01-material-timber-v2.webp",
    "d01-material-stone-v2.webp",
    "d01-material-plaster-v2.webp",
  ]) {
    assert.match(render, new RegExp(asset.replace(".", "\\.")));
  }
  assert.doesNotMatch(css, /repeating-linear-gradient/);
  assert.doesNotMatch(css, /background-size:18px 18px/);
  assert.match(css, /\.material img\{/);
});

test("orchestrates Nutrition and Planning with planned image assets", async () => {
  const [render, interactions] = await Promise.all([
    read("scripts/render.js"), read("scripts/interactions.js"),
  ]);
  for (const signature of [
    "renderNutritionTrial",
    "renderPlanningTrial",
    "d02-meal-analysis-v2.webp",
    "d02-next-meal-v2.webp",
    "d03-decision-room-v2.webp",
    "d03-conclusion-v2.webp",
  ]) {
    assert.match(render, new RegExp(signature.replace(".", "\\.")));
  }
  assert.match(render, /Interactive decision path/);
  assert.match(render, /customSelect\("Adjust today’s focus"/);
  assert.match(render, /data-decision-action/);
  assert.match(interactions, /is-resolved/);
  assert.match(interactions, /Owner confirmed/);
});

test("golden ratio is isolated and releases on mobile", async () => {
  const css = await read("styles/orchestration.css");
  assert.match(css, /data-proportion="golden"/);
  assert.match(css, /1\.618fr/);
  assert.match(css, /body\[data-proportion\].*grid-template-columns:1fr/);
  assert.match(css, /data-proportion="selected".*1\.618fr/);
});

test("does not use a global scroll-event animation loop", async () => {
  const interactions = await read("scripts/interactions.js");
  assert.doesNotMatch(interactions, /addEventListener\(["']scroll/);
  assert.match(interactions, /IntersectionObserver/);
});

test("keeps content visible when JavaScript does not run", async () => {
  const [base, render, html] = await Promise.all([
    read("styles/base.css"), read("scripts/render.js"), read("index.html"),
  ]);
  assert.match(base, /\.reveal\{opacity:1;transform:none\}/);
  assert.match(base, /\.js \.reveal\{opacity:0/);
  assert.match(render, /classList\.add\("js"\)/);
  assert.match(html, /<noscript>/);
  assert.match(html, /Start a project/);
});

test("uses icon components instead of text arrow glyphs", async () => {
  const source = await Promise.all([
    read("index.html"),
    read("scripts/render.js"),
    read("scripts/interactions.js")
  ]);
  assert.doesNotMatch(source.join("\n"), /[→←↗↘➜➤]/u);
  assert.match(source.join("\n"), /ph-\$\{name\}/);
});

test("includes responsive, motion, and reduced-motion contracts", async () => {
  const css = (await Promise.all([
    read("styles/base.css"),
    read("styles/variants.css"),
    read("styles/cases.css")
  ])).join("\n");
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /@keyframes breathe/);
  assert.match(css, /scroll-behavior:smooth/);
});

test("uses custom listbox behavior and approved logo provenance", async () => {
  const [render, interactions, manifest] = await Promise.all([
    read("scripts/render.js"),
    read("scripts/interactions.js"),
    read("benchmark-manifest.json")
  ]);
  assert.match(render, /role="listbox"/);
  assert.match(render, /role="option"/);
  assert.match(interactions, /ArrowDown/);
  assert.match(interactions, /ArrowUp/);
  assert.equal(JSON.parse(manifest).sharedConstraints.logos, "SVGL");
});

test("renders a meaningful case-specific method sequence", async () => {
  const [render, cases, interactions] = await Promise.all([
    read("scripts/render.js"),
    read("scripts/cases.js"),
    read("scripts/interactions.js")
  ]);
  assert.match(render, /methodSequence/);
  assert.match(render, /aria-controls="method-copy-/);
  assert.equal((cases.match(/methodTitle:/g) ?? []).length, 3);
  assert.equal((cases.match(/methodCopy:/g) ?? []).length, 3);
  assert.match(interactions, /IntersectionObserver/);
});

test("gives each topic a distinct section composition", async () => {
  const [render, css] = await Promise.all([read("scripts/render.js"), read("styles/cases.css")]);
  for (const signature of ["architecture-note", "nutrition-orbit", "planning-signal"]) {
    assert.match(render, new RegExp(signature));
    assert.match(css, new RegExp(signature));
  }
  assert.match(css, /D01 — architectural plate/);
  assert.match(css, /D02 — nutrition dashboard/);
  assert.match(css, /D03 — connected system/);
});
