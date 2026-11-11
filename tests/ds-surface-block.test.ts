/**
 * `ui ds surface` runs the project-level detectors itself (spec 033 FR-002, FR-003, FR-019): an unanswered scan-budget,
 * source-authority or app-roots question blocks it with exit 1 ONBOARD_BLOCKED_NEEDS_OWNER_RULING, writes the question to
 * pending.json although `ui onboard questions` was never run, and writes nothing else. With a ruling, `--app` follows
 * the rulings (controller ruling R1): exactly one kept root is the default, two are refused by name, a root the owner
 * ruled out and a directory that is not an app root are refused by name.
 */
import { describe, expect, it } from "vitest";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { TWO_SOURCES, wideFiles } from "./project-kinds-helpers.js";
import { WORKSPACE_ONE_APP, WORKSPACE_TWO_APPS, answerKind, envelope, pkg, projectFrom, surface } from "./ds-surface-helpers.js";

const appRoots = (p: string) => readPending(p).clusters.filter((c) => c.kind === "app-roots");
const keepOnly = (keep: string[]) => (k: { perMemberAnswer?: { members: string[] } }) =>
  ({ choice: ["review-individually"], members: Object.fromEntries((k.perMemberAnswer as { members: string[] }).members.map((m) => [m, keep.includes(m) ? "keep" : "drop"])) });

describe("the blocking leg of AC-10: a capped scan", () => {
  const capped = (): string => projectFrom({ "package.json": pkg({ react: "18" }), "src/components/A.tsx": "export const Aaa = () => <i />;\n", "src/components/B.tsx": "export const Bbb = () => <i />;\n", "src/components/C.tsx": "export const Ccc = () => <i />;\n", ...wideFiles("bulk") });
  it("exits 1 ONBOARD_BLOCKED_NEEDS_OWNER_RULING and writes the scan-budget cluster to pending.json with no prior ui onboard questions", () => {
    const p = capped();
    expect(readPending(p).clusters).toEqual([]); // the question list does not exist yet
    const r = surface(p);
    expect(r.code).toBe(1);
    const e = envelope(r.out);
    expect(e.error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(e.data!["blocked"].clusters.map((c: { kind: string }) => c.kind)).toEqual(["scan-budget"]);
    expect(readPending(p).clusters.map((c) => c.kind)).toEqual(["scan-budget"]);
  });
  it("writes nothing but the pending questions, in text mode too, and names the next command", () => {
    const p = capped();
    const before = hashTree(p, [".design-os"]);
    const r = capture(["ds", "surface", "--cwd", p]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(r.err).toContain("ui onboard questions --format claude");
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("is answered from the claude key alone and then reads the app", () => {
    const p = capped();
    surface(p);
    expect(answerKind(p, "scan-budget", (k) => ({ choice: k.options[0]!.id })).code).toBe(0);
    const r = surface(p);
    expect(r.code, r.out).toBe(0);
    expect(envelope(r.out).data!["components"]).toHaveLength(3);
  });
  it("a differing second token source blocks it as well", () => {
    const p = projectFrom({ "package.json": pkg({ react: "18" }), ...TWO_SOURCES, "src/components/A.tsx": "export const Aaa = () => <i />;\n", "src/components/B.tsx": "export const Bbb = () => <i />;\n", "src/components/C.tsx": "export const Ccc = () => <i />;\n" });
    const e = envelope(surface(p).out);
    expect(e.data!["blocked"].clusters.map((c: { kind: string }) => c.kind)).toEqual(["source-authority"]);
  });
});

describe("app-roots when a default can be chosen", () => {
  it("does not stop a read once an app root is chosen, and leaves its question in pending.json", () => {
    const p = projectFrom(WORKSPACE_ONE_APP);
    const r = surface(p);
    expect(r.code, r.out).toBe(0);
    expect(appRoots(p)).toHaveLength(1);
  });
  it("with no default at all it exits ONBOARD_BLOCKED_NEEDS_OWNER_RULING and names --app", () => {
    const p = projectFrom({ "package.json": pkg({}), "packages/shared/package.json": pkg({}) });
    const r = surface(p);
    expect(r.code).toBe(1);
    const e = envelope(r.out).error!;
    expect(e.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(e.message).toContain("--app <root>");
  });
});

describe("--app with owner rulings", () => {
  const ruled = (keep: string[]): string => {
    const p = projectFrom(WORKSPACE_TWO_APPS);
    surface(p);
    expect(answerKind(p, "app-roots", keepOnly(keep)).code).toBe(0);
    return p;
  };
  it("the one root the owner kept is the default, and the one ruled out is not walked", () => {
    const p = ruled(["apps/web"]);
    const r = surface(p);
    expect(r.code, r.out).toBe(0);
    expect(envelope(r.out).data!["app"]).toBe("apps/web");
    expect(envelope(r.out).data!["components"]).toHaveLength(3);
  });
  it("two kept roots have no default: refused with the roots named and --app <root>, never the first", () => {
    const p = ruled(["apps/admin", "apps/web"]);
    const r = surface(p);
    expect(r.code).toBe(1);
    const e = envelope(r.out);
    expect(e.error!.code).toBe("SURFACE_APP_AMBIGUOUS");
    expect(e.error!.message).toContain("'apps/admin', 'apps/web'");
    expect(e.error!.message).toContain("--app <root>");
    expect(e.data).toBeUndefined();
    expect(envelope(surface(p, "--app", "apps/admin").out).data!["app"]).toBe("apps/admin");
  });
  it("an --app that names a root ruled drop is refused by name", () => {
    const e = envelope(surface(ruled(["apps/web"]), "--app", "apps/admin").out).error!;
    expect(e.code).toBe("SURFACE_APP_DROPPED");
    expect(e.message).toContain("apps/admin");
  });
  it("an --app that is not an app root is refused by name, and the roots found are listed", () => {
    const e = envelope(surface(projectFrom(WORKSPACE_ONE_APP), "--app", "apps/web/components").out).error!;
    expect(e.code).toBe("SURFACE_APP_NOT_A_ROOT");
    expect(e.message).toContain("apps/web/components");
    expect(e.message).toContain("'apps/web'");
  });
  it("the scan root is a valid --app when it holds a package.json", () => {
    const r = surface(projectFrom({ "package.json": pkg({ react: "18" }), "src/components/A.tsx": "export const Aaa = () => <i />;\n", "src/components/B.tsx": "export const Bbb = () => <i />;\n", "src/components/C.tsx": "export const Ccc = () => <i />;\n" }), "--app", ".");
    expect(envelope(r.out).data!["app"]).toBe(".");
  });
});
