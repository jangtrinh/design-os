/**
 * The three project-level questions (spec 033 FR-003, FR-004, FR-011, FR-014): detected in memory by `ui onboard`,
 * written by `ui onboard questions` in one pass, honoured once answered, and every answer built from the claude answer
 * key alone is accepted. AC-18, the source-authority part of AC-22, AC-25.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appRootsEmitter } from "../src/core/owner-rulings/kind-app-roots.js";
import { scanBudgetEmitter } from "../src/core/owner-rulings/kind-scan-budget.js";
import { sourceAuthorityEmitter } from "../src/core/owner-rulings/kind-source-authority.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { resolveDetections } from "../src/core/owner-rulings/resolve-detections.js";
import { readRulingStore } from "../src/core/owner-rulings/ruling-store.js";
import { scanProject } from "../src/core/project-scan.js";
import { scanRulingsOf } from "../src/core/project-scan-rulings.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { TWO_APPS, TWO_SOURCES, keyOf, projectWith, severalClusters, submit, tokenDoc, wideFiles } from "./project-kinds-helpers.js";

const kindsOf = (project: string): string[] => readPending(project).clusters.map((c) => c.kind).sort();
const json = (out: string): { data?: Record<string, unknown>; error?: { code: string; message: string } } => JSON.parse(out) as never;

describe("scan-budget", () => {
  it("`ui onboard` reports it read-only: exit 0, the tree hash unchanged, one pending question, nothing written", () => {
    const project = projectWith({ "package.json": "{}", ...wideFiles("bulk") });
    const before = hashTree(project);
    const r = capture(["onboard", "--cwd", project, "--json", "--no-banner"]);
    expect(r.code).toBe(0);
    expect((json(r.out).data as { rulings: { pending: number } }).rulings.pending).toBe(1);
    expect(hashTree(project)).toBe(before);
    expect(existsSync(join(project, ".design-os"))).toBe(false);
  });
  it("`ui onboard questions` raises the scan-budget cluster, names the directory that spent the budget, and writes pending.json", () => {
    const project = projectWith({ "package.json": "{}", ...wideFiles("bulk") });
    const r = capture(["onboard", "questions", "--cwd", project]);
    expect(r.code).toBe(0);
    const clusters = readPending(project).clusters;
    expect(clusters.map((c) => c.kind)).toEqual(["scan-budget"]);
    expect(clusters[0]!.members).toContain("bulk");
    expect(clusters[0]!.question).toContain("bulk");
    expect(clusters[0]!.labels!["bulk"]).toMatch(/^\d+ entries$/);
    // the tool's own state directory now exists; a directory the walk never enters is not a consumer of the budget
    capture(["onboard", "questions", "--cwd", project]);
    expect(readPending(project).clusters[0]!.members).toEqual(["bulk"]);
  });
  it("an option names what it skips, its consequence is computed for that option, and no option is positional", () => {
    const project = projectWith({ "package.json": "{}", ...wideFiles("bulk"), "src/a.css": "" });
    capture(["onboard", "questions", "--cwd", project]);
    const c = readPending(project).clusters[0]!;
    const skipLargest = c.options.find((o) => o.id === "skip:bulk")!;
    expect(skipLargest.assigns).toMatchObject({ bulk: "skip" });
    expect(skipLargest.consequence).toMatch(/^\d+ of the 4000 entries are no longer spent in bulk/);
    expect(c.options.map((o) => o.id)).toEqual(expect.arrayContaining(["keep-all", "review-individually"]));
    for (const o of c.options) expect(o.id).not.toMatch(/first|:0$/);
    expect(c.options.at(-1)!.id).toBe("review-individually");
  });
  it("several directories: largest first (owner decision D15), ties in scan order, and the consequences count what each option frees", () => {
    const d = scanBudgetEmitter.detect({ truncated: true, limit: 4000, skipped: [], budget: [{ dir: "a", visited: 100 }, { dir: "b", visited: 300 }, { dir: "c", visited: 300 }] })!;
    const asked = d.ask(d.members);
    expect(asked.options.map((o) => o.id)).toEqual(["skip:b", "skip-all", "keep-all", "review-individually"]);
    expect(asked.options[0]!.consequence).toBe("300 of the 4000 entries are no longer spent in b; the other 2 stay walked");
    expect(asked.options[1]!.consequence).toBe("700 of the 4000 entries are no longer spent in these 3 directories");
    expect(Object.keys(asked.memberChoices!)).toEqual(["b", "c", "a"]);
  });
  it("skipping the directory dissolves the question: the walk is under the cap, no stale ruling, nothing is asked again", () => {
    const project = projectWith({ "package.json": "{}", ...wideFiles("bulk") });
    capture(["onboard", "questions", "--cwd", project]);
    const key = keyOf(project).find((k) => k.kind === "scan-budget")!;
    expect(submit(project, [{ fingerprint: key.fingerprint, choice: "skip:bulk" }]).code).toBe(0);
    expect(scanRulingsOf(project).skip).toEqual(["bulk"]);
    expect(scanProject(project, scanRulingsOf(project)).truncated).toBe(false);
    const status = json(capture(["onboard", "--cwd", project, "--json", "--no-banner"]).out).data as { rulings: { pending: number; stale: number; recorded: number } };
    expect(status.rulings).toMatchObject({ pending: 0, stale: 0, recorded: 1 });
    expect(capture(["onboard", "questions", "--cwd", project]).code).toBe(1); // NO_PENDING_QUESTIONS
  });
  it("keep-all is an answer: the map stays truncated, the scan says so, and the question is not asked again", () => {
    const project = projectWith({ "package.json": "{}", ...wideFiles("bulk") });
    capture(["onboard", "questions", "--cwd", project]);
    const key = keyOf(project).find((k) => k.kind === "scan-budget")!;
    expect(submit(project, [{ fingerprint: key.fingerprint, choice: "keep-all" }]).code).toBe(0);
    expect(scanProject(project, scanRulingsOf(project)).truncated).toBe(true);
    expect(capture(["onboard", "questions", "--cwd", project]).code).toBe(1);
  });
  it("renaming the directory is a new member and is asked again; the old ruling is stale, not applied", () => {
    const project = projectWith({ "package.json": "{}", ...wideFiles("bulk") });
    capture(["onboard", "questions", "--cwd", project]);
    submit(project, [{ fingerprint: keyOf(project)[0]!.fingerprint, choice: "skip:bulk" }]);
    const rulings = readRulingStore(project).rulings;
    const renamed = scanBudgetEmitter.detect({ truncated: true, limit: 4000, budget: [{ dir: "renamed", visited: 3000 }], skipped: [] })!;
    const resolved = resolveDetections([renamed], rulings);
    expect(resolved.open.map((c) => c.members)).toEqual([["renamed"]]);
    expect(resolved.stale).toHaveLength(1);
  });
});

describe("app-roots", () => {
  const project = (): string => projectWith({ "package.json": "{}", ...TWO_APPS });
  it("is raised when more than one nested app root exists, never for one", () => {
    expect(appRootsEmitter.detect(appRootsEmitter.sense!(project()))!.members).toEqual(["apps/docs", "apps/web"]);
    const single = projectWith({ "package.json": "{}", "apps/web/package.json": "{}" });
    expect(appRootsEmitter.detect(appRootsEmitter.sense!(single))!.members).toEqual([]);
  });
  it("puts the recommended set first (the roots that name a framework), then the rest, each option's consequence computed", () => {
    const p = project();
    capture(["onboard", "questions", "--cwd", p]);
    const c = readPending(p).clusters.find((x) => x.kind === "app-roots")!;
    expect(c.options.map((o) => o.id)).toEqual(["keep:recommended", "member:apps/docs"]);
    expect(c.options[0]).toMatchObject({ recommended: true, selects: ["apps/web"] });
    expect(c.options[0]!.consequence).toBe("1 app root(s) walked with 1 component dir(s); 1 left out with 0 component dir(s) that leave the map");
    expect(c.options[1]!.consequence).toBe("1 app root(s) walked with 0 component dir(s); 1 left out with 1 component dir(s) that leave the map");
    expect(c.labels).toEqual({ "apps/docs": "no framework, 0 component dir(s)", "apps/web": "next, 1 component dir(s)" });
  });
  it("with no framework to tell them apart there is no recommendation: largest first by component directories, ties in scan order", () => {
    const p = projectWith({ "package.json": "{}", "apps/a/package.json": "{}", "apps/b/package.json": "{}", "apps/c/package.json": "{}", "apps/c/components/x.tsx": "", "apps/c/components/y.tsx": "", "apps/c/components/z.tsx": "" });
    const d = appRootsEmitter.detect(appRootsEmitter.sense!(p))!;
    const ids = d.ask(d.members).options.map((o) => o.id);
    expect(ids).toEqual(["member:apps/c", "member:apps/a", "member:apps/b"]);
  });
  it("when every root names a framework nothing separates them: no recommended option, largest first by component directories", () => {
    const p = projectWith({ "package.json": "{}", "apps/a/package.json": JSON.stringify({ dependencies: { next: "15" } }), "apps/b/package.json": JSON.stringify({ dependencies: { react: "19" } }), "apps/b/components/x.tsx": "", "apps/b/components/y.tsx": "", "apps/b/components/z.tsx": "" });
    const d = appRootsEmitter.detect(appRootsEmitter.sense!(p))!;
    const options = d.ask(d.members).options;
    expect(options.some((o) => o.recommended === true)).toBe(false);
    expect(options.map((o) => o.id)).toEqual(["member:apps/b", "member:apps/a"]);
  });
  it("answering `keep apps/web` stores keep/drop per root and `ui scan` stops walking the other", () => {
    const p = project();
    capture(["onboard", "questions", "--cwd", p]);
    const key = keyOf(p).find((k) => k.kind === "app-roots")!;
    expect(submit(p, [{ fingerprint: key.fingerprint, choice: ["keep:recommended"] }]).code).toBe(0);
    expect(readRulingStore(p).rulings[0]!.members).toEqual({ "apps/docs": "drop", "apps/web": "keep" });
    const scanned = json(capture(["scan", "--cwd", p, "--json"]).out).data as { apps: { path: string }[]; honoured: { roots: string[] } };
    expect(scanned.apps.map((a) => a.path)).toEqual(["apps/web"]);
    expect(scanned.honoured.roots).toEqual(["apps/web"]);
    // the dropped root still exists, so the detector still sees both and nothing is asked or stale
    expect(json(capture(["onboard", "--cwd", p, "--json", "--no-banner"]).out).data).toMatchObject({ rulings: { pending: 0, stale: 0, recorded: 1 } });
  });
});

describe("source-authority", () => {
  const project = (): string => projectWith({ "package.json": "{}", ...TWO_SOURCES });
  it("is raised for a sealed store beside a differing second source, with the measured difference and both files named", () => {
    const p = project();
    capture(["onboard", "questions", "--cwd", p]);
    const c = readPending(p).clusters.find((x) => x.kind === "source-authority")!;
    expect(c.members).toEqual(["design/design.tokens.json", "design/tokens.json"]);
    expect(c.question).toContain("1 only in the store, 1 only in design/tokens.json, 1 with a different value");
    expect(c.labels).toEqual({ "design/design.tokens.json": "the sealed store, 2 tokens", "design/tokens.json": "the second source, 2 tokens" });
    expect(c.options.map((o) => o.id)).toEqual(["authority:design/design.tokens.json", "authority:design/tokens.json", "review-individually"]);
    expect(c.options[0]!.consequence).toContain("its 1 token that design/design.tokens.json lacks");
  });
  it("is not raised when the sets are equal (key order and whitespace are not a difference) or the sealed file is declared derived", () => {
    const same = projectWith({ "design/design.tokens.json": tokenDoc({ a: "#111111" }), "design/tokens.json": `{ "color": { "a": { "$value": "#111111", "$type": "color" } } }` });
    expect(sourceAuthorityEmitter.detect(sourceAuthorityEmitter.sense!(same))!.members).toEqual([]);
    const derived = projectWith({ ...TWO_SOURCES, "design/design-dir.json": JSON.stringify({ version: 1, derived: [{ path: "design/design.tokens.json", derived_from: "design/tokens.json" }] }) });
    expect(sourceAuthorityEmitter.detect(sourceAuthorityEmitter.sense!(derived))!.members).toEqual([]);
    expect(sourceAuthorityEmitter.sense!(projectWith({ "design/tokens.json": tokenDoc({ a: "#111111" }) }))).toBeNull();
  });
  it("the answer names the source by file: `authority:design/tokens.json` stores authoritative for that file and not for the other", () => {
    const p = project();
    capture(["onboard", "questions", "--cwd", p]);
    const key = keyOf(p).find((k) => k.kind === "source-authority")!;
    expect(submit(p, [{ fingerprint: key.fingerprint, choice: "authority:design/tokens.json" }]).code).toBe(0);
    expect(readRulingStore(p).rulings[0]!.members).toEqual({ "design/design.tokens.json": "not-authoritative", "design/tokens.json": "authoritative" });
    expect(json(capture(["onboard", "--cwd", p, "--json", "--no-banner"]).out).data).toMatchObject({ rulings: { pending: 0, stale: 0, recorded: 1 } });
  });
  it("a per-file answer that names two sources, or none, is refused BAD_ANSWER and nothing is recorded", () => {
    const p = project();
    capture(["onboard", "questions", "--cwd", p]);
    const key = keyOf(p).find((k) => k.kind === "source-authority")!;
    for (const value of ["authoritative", "not-authoritative"]) {
      const members = Object.fromEntries(key.perMemberAnswer!.members.map((m) => [m, value]));
      const r = submit(p, [{ fingerprint: key.fingerprint, choice: key.perMemberAnswer!.choice, members }]);
      expect(r.code).toBe(1);
      expect(json(r.out).error!.code).toBe("BAD_ANSWER");
    }
    expect(readRulingStore(p).rulings).toEqual([]);
  });
});

describe("one `ui onboard questions` call raises every up-front project-level cluster (AC-18)", () => {
  it("a truncated scan, two app roots and two differing token files: three questions in one pass, in the owner's order", () => {
    const p = severalClusters();
    const r = capture(["onboard", "questions", "--cwd", p, "--json"]);
    expect(r.code).toBe(0);
    expect(kindsOf(p)).toEqual(["app-roots", "scan-budget", "source-authority"]);
    const listed = (json(r.out).data as { clusters: { kind: string }[] }).clusters.map((c) => c.kind);
    expect(listed).toEqual(["scan-budget", "app-roots", "source-authority"]); // ask order: the answer that can dissolve the others first
  });
  it("`ui onboard` reports all three read-only and prints the count; after the answers it prints none pending", () => {
    const p = severalClusters();
    const before = hashTree(p);
    const text = capture(["onboard", "--cwd", p, "--no-banner"]);
    expect(text.code).toBe(0);
    expect(text.out).toContain("questions to ready: 0 answered, 3 pending");
    expect(hashTree(p)).toBe(before);
  });
  it("an answer built from the claude key alone is accepted for each kind: an option answer and the per-member answer", () => {
    for (const mode of ["option", "per-member"] as const) {
      const p = severalClusters();
      const key = keyOf(p);
      expect(key.map((k) => k.kind)).toEqual(["scan-budget", "app-roots", "source-authority"]);
      const answers = key.map((k) => {
        if (mode === "option") return { fingerprint: k.fingerprint, choice: k.multiSelect ? [k.options[0]!.id] : k.options[0]!.id };
        const per = k.perMemberAnswer!;
        const members = Object.fromEntries(per.members.map((m, i) => [m, k.multiSelect ? "keep" : k.kind === "source-authority" ? (i === 0 ? "authoritative" : "not-authoritative") : k.memberChoices![m]![0]!.id]));
        return { fingerprint: k.fingerprint, choice: per.choice, members };
      });
      const r = submit(p, answers);
      expect(r.code, r.out).toBe(0);
      expect(readRulingStore(p).rulings.map((x) => x.kind).sort()).toEqual(["app-roots", "scan-budget", "source-authority"]);
    }
  });
});

describe("`ui design lint` points at the question it matches", () => {
  it("on a project with a sealed store beside a differing second source, the finding's fix names the question `ui onboard questions` raises", () => {
    const p = projectWith({ "package.json": "{}", "design/ds.manifest.json": JSON.stringify({ version: 1 }), ...TWO_SOURCES });
    execFileSync("git", ["-C", p, "init", "-q"]);
    execFileSync("git", ["-C", p, "add", "-A"]);
    const lint = json(capture(["design", "lint", p, "--json"]).out) as unknown as { data: { findings: { checkId: string; fix: string }[] } };
    const finding = lint.data.findings.find((f) => f.checkId === "two-token-sources")!;
    expect(finding.fix).toContain("Answer the source-authority question: ui onboard questions");
    expect(capture(["onboard", "questions", "--cwd", p, "--format", "markdown"]).out).toContain("## source-authority");
  });
});

describe("`ui ds import` runs the same detectors and blocks even when `ui onboard questions` never ran (AC-18)", () => {
  const flat = (): string => join(projectWith({ "tokens.json": JSON.stringify({ colors: { primary: "#3366ff" } }) }), "tokens.json");
  it("a sealed store beside a differing second token source: exit 1 ONBOARD_BLOCKED on source-authority, pending.json written, the tree otherwise unchanged", () => {
    const p = projectWith({ "package.json": "{}", ...TWO_SOURCES });
    const before = hashTree(p);
    const r = capture(["ds", "import", flat(), "--dir", p, "--force", "--json"]);
    expect(r.code).toBe(1);
    expect(json(r.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(kindsOf(p)).toEqual(["source-authority"]);
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("all three project-level questions block one import, and once they are answered the import goes through", () => {
    const p = severalClusters();
    const src = flat();
    expect(capture(["ds", "import", src, "--dir", p, "--force", "--json"]).code).toBe(1);
    expect(kindsOf(p)).toEqual(["app-roots", "scan-budget", "source-authority"]);
    const answers = keyOf(p).map((k) => ({ fingerprint: k.fingerprint, choice: k.multiSelect ? [k.options[0]!.id] : k.options[0]!.id }));
    expect(submit(p, answers).code).toBe(0);
    const again = capture(["ds", "import", src, "--dir", p, "--force", "--json"]);
    expect(again.code, again.out).toBe(0);
  });
  it("a project with none of the three is not asked anything", () => {
    const p = projectWith({ "package.json": "{}" });
    expect(capture(["ds", "import", flat(), "--dir", p, "--json"]).code).toBe(0);
    expect(existsSync(join(p, ".design-os"))).toBe(false);
  });
});
