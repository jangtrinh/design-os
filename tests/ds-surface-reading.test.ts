/**
 * `ui ds surface` reads an embedded application exactly and deterministically (spec 033 FR-019, AC-10): every exported
 * component with the tokens its source references, the pages and stories that import components, and what could not be
 * read. A style that resolves to no token is counted, never mapped to the nearest one; classes composed through `cn()`
 * are counted and map to no token; the same tree gives the same bytes.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readComponentExports } from "../src/core/ds-surface/source-export-reader.js";
import { readImports, resolveSpecifier } from "../src/core/ds-surface/source-import-reader.js";
import { blankHelperCalls, buildTokenLookup, readStyleReferences } from "../src/core/ds-surface/style-references.js";
import { readVariants } from "../src/core/ds-surface/variants-reader.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { ROOT_APP_WITH_EXAMPLE, WORKSPACE_ONE_APP, WORKSPACE_TWO_APPS, envelope, fixtureCopy, projectFrom, sealedFixture, surface } from "./ds-surface-helpers.js";

const surfaceOf = (project: string) => envelope(surface(project).out).data!;
const summary = (project: string) => surfaceOf(project)["components"].map((c: { name: string; file: string; tokens: string[]; unresolvedStyles: number }) => [c.name, c.file.replace("src/components/", ""), c.tokens, c.unresolvedStyles]);

describe("the embedded-app fixture", () => {
  const project = sealedFixture();
  it("lists every exported component of both component directories with its tokens and unresolved styles", () => {
    expect(summary(project)).toEqual([
      ["Avatar", "kit/Avatar.tsx", [], 0],
      ["Badge", "ui/Badge.tsx", [], 1],
      ["Button", "kit/Button.tsx", ["color.primary"], 0],
      ["Button", "ui/Button.tsx", ["color.primary", "color.surface"], 1],
      ["Card", "ui/Card.tsx", ["color.ink", "color.surface"], 0],
      ["Panel", "kit/Panel.tsx", ["color.surface"], 0],
      ["Tabs", "ui/Tabs.tsx", [], 0],
    ]);
  });
  it("counts a style that resolves to no token and never maps it to the nearest one", () => {
    const button = surfaceOf(project)["components"].find((c: { file: string }) => c.file.endsWith("ui/Button.tsx"));
    expect(button.unresolvedStyles).toBe(1); // var(--color-missing)
    expect(button.tokens).toEqual(["color.primary", "color.surface"]); // not color.ink, the nearest by name
  });
  it("counts the cn()-composed component under unresolvedStyles and resolves no token from its class list", () => {
    const badge = surfaceOf(project)["components"].find((c: { name: string }) => c.name === "Badge");
    expect(badge).toMatchObject({ tokens: [], unresolvedStyles: 1 }); // its classes name text-primary and text-ink, which would resolve outside cn()
  });
  it("lists the page files with the surface components each imports, by relative path and by alias", () => {
    expect(surfaceOf(project)["screens"]).toEqual([
      { file: "src/pages/home.tsx", components: ["Button", "Card", "Panel"] },
      { file: "src/pages/pricing.tsx", components: ["Card"] },
    ]);
  });
  it("lists the story files, one importing one component and one importing several, and the components no story imports", () => {
    const d = surfaceOf(project);
    expect(d["stories"]).toEqual([
      { file: "src/components/kit/Panel.stories.tsx", components: ["Panel"] },
      { file: "src/components/ui/Button.stories.tsx", components: ["Button"] },
      { file: "src/components/ui/Card.stories.tsx", components: ["Badge", "Card"] },
    ]);
    expect(d["unstoried"]).toEqual(["Avatar", "Button", "Tabs"]); // Button: the one in kit/ has no story
  });
  it("reports the planted collision, the Tailwind v4 entry, and nothing it could not read", () => {
    const d = surfaceOf(project);
    expect(d["schema"]).toBe("design-os-surface/1");
    expect(d["collisions"]).toEqual([{ name: "Button", files: ["src/components/kit/Button.tsx", "src/components/ui/Button.tsx"] }]);
    expect(d["tailwindCss"]).toBe("src/styles.css");
    expect(d["unread"]).toEqual({ files: [], exports: [], unresolvedImports: 0 });
  });
  it("gives the same bytes on a second run and from a copy of the tree in another place", () => {
    const again = surface(project).out;
    expect(again).toBe(surface(project).out);
    const other = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-surface-copy-"));
    cpSync(project, other, { recursive: true });
    expect(surface(other).out).toBe(again);
  });
  it("without a sealed store nothing resolves: every custom-property reference is counted and no token is listed", () => {
    const d = surfaceOf(fixtureCopy());
    expect(d["components"].every((c: { tokens: string[] }) => c.tokens.length === 0)).toBe(true);
    expect(d["components"].find((c: { file: string }) => c.file.endsWith("ui/Button.tsx")).unresolvedStyles).toBe(3);
  });
  it("names the store it resolved against: sealed, none, or unverified when the files drifted from their seal", () => {
    expect(surfaceOf(project)["tokenStore"]).toEqual({ status: "sealed" });
    expect(surfaceOf(fixtureCopy())["tokenStore"]).toEqual({ status: "none" });
    const drifted = sealedFixture();
    const file = join(drifted, "design", "design.tokens.json");
    writeFileSync(file, readFileSync(file, "utf8").replace("#1a2b3c", "#1a2b3d"));
    const d = surfaceOf(drifted);
    expect(d["tokenStore"]).toEqual({ status: "unverified", drifted: ["tokens"] });
    expect(d["components"].find((c: { file: string }) => c.file.endsWith("kit/Button.tsx")).tokens).toEqual(["color.primary"]); // read as it is on disk
  });
  it("refuses a write on a store that drifted from its seal, as every other writer does, and writes nothing", () => {
    const drifted = sealedFixture();
    const file = join(drifted, "design", "design.tokens.json");
    writeFileSync(file, readFileSync(file, "utf8").replace("#1a2b3c", "#1a2b3d"));
    const r = surface(drifted, "--out", "surface.json");
    expect(envelope(r.out).error?.code).toBe("DS_TAMPERED");
    expect(() => readFileSync(join(drifted, "surface.json"))).toThrow();
  });
  it("is read-only: the tree is byte-identical after a run, apart from the pending question list of the block contract", () => {
    const before = hashTree(project, [".design-os"]);
    expect(capture(["ds", "surface", "--cwd", project]).code).toBe(0);
    expect(hashTree(project, [".design-os"])).toBe(before);
  });
  it("a write (--out) is blocked while a collision has no ruling, and writes nothing", () => {
    const p = sealedFixture();
    const answered = surface(p, "--out", "surface.json");
    expect(envelope(answered.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING"); // an open collision blocks a write
    expect(() => readFileSync(join(p, "surface.json"))).toThrow();
  });
});

describe("the export reader", () => {
  const names = (src: string, file = "x/Thing.tsx") => readComponentExports(file, src).components.map((c) => [c.name, c.isDefault, c.startLine, c.endLine]);
  it("reads named, default and listed exports with their line spans", () => {
    expect(names('export function Alpha() {\n  return <div />;\n}\n\nexport const Beta = () => <b />;\nconst Gamma = () => <i />;\nexport { Gamma };\nexport default function Delta() { return <p />; }\n'))
      .toEqual([["Alpha", false, 1, 3], ["Beta", false, 5, 5], ["Gamma", false, 6, 6], ["Delta", true, 8, 8]]);
  });
  it("does not read a constant, a type, a hook or a declaration with no markup as a component", () => {
    const r = readComponentExports("x/a.tsx", 'export const API_URL = "x";\nexport const Colors = { a: 1 };\nexport function useThing() { return 1; }\nexport type Props = {};\nexport interface Q {}\n');
    expect(r.components).toEqual([]);
    expect(r.unread.map((u) => u.name)).toEqual(["Colors"]);
  });
  it("reports an anonymous default export as not read, with its line", () => {
    const r = readComponentExports("x/a.tsx", "export default function () { return <div />; }\n");
    expect(r.components).toEqual([]);
    expect(r.unread).toEqual([{ name: "(anonymous)", line: 1, reason: "the default export has no upper-camel name" }]);
  });
  it("ignores an export written inside a comment", () => {
    expect(names("// export function Ghost() { return <div />; }\n/* export const Phantom = () => <i />; */\n")).toEqual([]);
  });
  it("returns re-exports apart and reads a framework file as one component named by the file", () => {
    const r = readComponentExports("x/index.ts", 'export { A, B as C } from "./a";\nexport * from "./b";\n');
    expect(r.components).toEqual([]);
    expect(r.reExports).toEqual([{ names: [], star: true, spec: "./b" }, { names: [{ exported: "A", local: "A" }, { exported: "C", local: "B" }], star: false, spec: "./a" }]);
    expect(readComponentExports("x/Card.vue", "<template/>\n").components).toMatchObject([{ name: "Card", isDefault: true }]);
    expect(readComponentExports("x/card.svelte", "<p/>\n").unread).toHaveLength(1);
  });
});

describe("the import reader", () => {
  it("reads default, named (with aliases), namespace and multi-line imports, and skips type-only ones", () => {
    const src = 'import A, { B, C as D } from "./m";\nimport * as UI from "../ui";\nimport {\n  E,\n  F,\n} from "@/e";\nimport type { G } from "./g";\nimport "./side.css";\n';
    expect(readImports(src)).toEqual([
      { spec: "./m", defaultName: "A", named: [{ imported: "B", local: "B" }, { imported: "C", local: "D" }] },
      { spec: "../ui", namespace: "UI", named: [] },
      { spec: "@/e", named: [{ imported: "E", local: "E" }, { imported: "F", local: "F" }] },
    ]);
  });
  it("resolves a relative path, an alias, an index file; leaves a package external and counts a miss", () => {
    const files = new Set(["src/ui/Card.tsx", "src/ui/index.ts", "src/pages/a.tsx", "src/lib/one.ts", "src/lib/one.tsx"]);
    expect(resolveSpecifier("src/pages/a.tsx", "../ui/Card", files, "")).toEqual({ kind: "file", file: "src/ui/Card.tsx" });
    expect(resolveSpecifier("src/pages/a.tsx", "../ui", files, "")).toEqual({ kind: "file", file: "src/ui/index.ts" });
    expect(resolveSpecifier("src/pages/a.tsx", "@/ui/Card", files, "")).toEqual({ kind: "file", file: "src/ui/Card.tsx" });
    expect(resolveSpecifier("src/pages/a.tsx", "react", files, "")).toEqual({ kind: "external" });
    expect(resolveSpecifier("src/pages/a.tsx", "../ui/Missing", files, "")).toEqual({ kind: "unresolved" });
    expect(resolveSpecifier("src/pages/a.tsx", "../lib/one", files, "")).toEqual({ kind: "unresolved" }); // two files match: never pick one
  });
});

describe("the token references of one component", () => {
  const lookup = buildTokenLookup({ color: { primary: { $type: "color", $value: "#111" }, ink: { $type: "color", $value: "#000" } }, space: { md: { $type: "dimension", $value: "4px" } } });
  const read = (src: string) => readStyleReferences("x/A.tsx", src, lookup);
  it("resolves a custom property and a theme-key utility exactly, and counts the rest", () => {
    expect(read('export const A = () => <div style={{ color: "var(--color-primary)", margin: "var(--space-md)", border: "var(--nope)" }} className="bg-ink px-4" />;'))
      .toEqual({ tokens: ["color.ink", "color.primary", "space.md"], unresolvedStyles: 1 });
  });
  it("treats a custom property that two tokens carry as no token", () => {
    const l = buildTokenLookup({ a: { "b-c": { $type: "color", $value: "#1" } }, "a-b": { c: { $type: "color", $value: "#2" } } });
    expect(l.resolve("a-b-c")).toBeNull(); // a.b-c and a-b.c both carry it
    expect(l.resolve("b-c")).toBe("a.b-c");
    expect(buildTokenLookup(undefined).resolve("color-primary")).toBeNull();
  });
  it("blanks every helper call, counts each once, and keeps lines", () => {
    const out = blankHelperCalls('const a = cn("x", f(")"), 1);\nconst b = clsx(\n  "y",\n);\nconst c = notcn("z");');
    expect(out.calls).toBe(2);
    expect(out.text.split("\n")).toHaveLength(5);
    expect(out.text).toContain('notcn("z")');
  });
  it("reads variants only from a literal union of the component's own props type", () => {
    const src = 'interface BadgeProps { tone?: "a" | "b"; text: string; size: Size }\nexport const Badge = (p: BadgeProps) => <i />;\n';
    expect(readVariants("Badge", src)).toEqual(["Tone=a", "Tone=b"]);
    expect(readVariants("Other", src)).toEqual([]);
    expect(readVariants("Badge", "const looks = { a: 1 };\nexport const Badge = () => <i />;")).toEqual([]);
  });
});

describe("which app root is read (`--app` default, FR-019)", () => {
  it("defaults to the root application when only an example project sits beside it", () => {
    const r = envelope(surface(projectFrom(ROOT_APP_WITH_EXAMPLE)).out);
    expect(r.data!["app"]).toBe(".");
    expect(r.data!["components"].map((c: { file: string }) => c.file)).toEqual(["src/components/A.tsx", "src/components/B.tsx", "src/components/C.tsx"]);
  });
  it("defaults to the single application of a workspace root with no framework and two config packages", () => {
    const r = envelope(surface(projectFrom(WORKSPACE_ONE_APP)).out);
    expect(r.error).toBeUndefined();
    expect(r.data!["app"]).toBe("apps/web");
    expect(r.data!["components"]).toHaveLength(3);
  });
  it("blocks with the app-roots question when two applications compete and nothing is ruled", () => {
    const project = projectFrom(WORKSPACE_TWO_APPS);
    const r = surface(project);
    expect(r.code).toBe(1);
    const e = envelope(r.out);
    expect(e.error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(e.data!["blocked"].clusters.map((c: { kind: string }) => c.kind)).toEqual(["app-roots"]);
  });
});

describe("the walk honours the owner's rulings and says what it could not resolve", () => {
  const pack = (dir: string): Record<string, string> => Object.fromEntries(["Aaa", "Bbb", "Ccc"].map((n) => [`${dir}/${n}.tsx`, `export const ${n}Box = () => <i />;\n`]));
  it("does not read a directory the owner ruled to skip", () => {
    const project = projectFrom({ "package.json": JSON.stringify({ name: "x", dependencies: { react: "18" } }), ...pack("src/components"), ...pack("legacy/components") });
    expect(surfaceOf(project)["components"]).toHaveLength(6);
    const ruling = { kind: "scan-budget", fingerprint: "a".repeat(64), choice: "skip", covers: ["legacy"], actor: "owner", at: "2026-11-11T09:00:00Z" };
    mkdirSync(join(project, "design"), { recursive: true });
    writeFileSync(join(project, "design", "design-dir.json"), JSON.stringify({ version: 2, onboard: { rulings: [ruling] } }));
    expect(surfaceOf(project)["components"].map((c: { file: string }) => c.file)).toEqual(["src/components/Aaa.tsx", "src/components/Bbb.tsx", "src/components/Ccc.tsx"]);
  });
  it("counts an import of a project file that matches no single file, and never invents the target", () => {
    const project = fixtureCopy();
    writeFileSync(join(project, "src/pages/lost.tsx"), 'import { Ghost } from "../components/ui/Ghost";\nimport Card from "../components/ui/Card";\nexport default function Lost() { return <Card />; }\n');
    const d = surfaceOf(project);
    expect(d["unread"]["unresolvedImports"]).toBe(1);
    expect(d["screens"].find((s: { file: string }) => s.file.endsWith("lost.tsx")).components).toEqual(["Card"]);
  });
});

describe("what the project files say it is not", () => {
  it("lists a file the walk could not read with its reason instead of dropping it", () => {
    const project = fixtureCopy();
    writeFileSync(join(project, "src", "components", "ui", "Big.tsx"), `export const Big = () => <div />;\n${"// padding\n".repeat(220000)}`);
    const d = surfaceOf(project);
    expect(d["unread"]["files"]).toEqual([{ file: "src/components/ui/Big.tsx", reason: expect.stringContaining("larger") }]);
    expect(d["components"].some((c: { name: string }) => c.name === "Big")).toBe(false);
  });
});
