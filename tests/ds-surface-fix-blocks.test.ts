/**
 * Which questions block a read and which a write (review fix round, section A): a question blocks a read only when what
 * the read shows depends on its answer, and every open question of the command blocks a write, `--app` given or not.
 */
import { describe, expect, it } from "vitest";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { hashTree } from "./owner-rulings-helpers.js";
import { wideFiles } from "./project-kinds-helpers.js";
import { WORKSPACE_ONE_APP, envelope, pkg, projectFrom, surface } from "./ds-surface-helpers.js";

describe("an open app-roots question blocks every write, also when --app is given", () => {
  const withOpenRoots = (): string => { const p = projectFrom(WORKSPACE_ONE_APP); surface(p); return p; };
  it("--register --apply writes nothing and exits 1 ONBOARD_BLOCKED_NEEDS_OWNER_RULING", () => {
    const p = withOpenRoots();
    expect(readPending(p).clusters.map((c) => c.kind)).toContain("app-roots");
    const before = hashTree(p, [".design-os"]);
    const r = surface(p, "--app", "apps/web", "--register", "--apply");
    expect(r.code, r.out).toBe(1);
    expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("--out writes nothing either", () => {
    const p = withOpenRoots();
    const before = hashTree(p, [".design-os"]);
    const r = surface(p, "--app", "apps/web", "--out", "surface.json");
    expect(r.code, r.out).toBe(1);
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("a read still goes through", () => {
    expect(surface(withOpenRoots(), "--app", "apps/web").code).toBe(0);
  });
});

describe("a read with open questions says so in the JSON envelope", () => {
  it("carries the count of open questions and the pending path", () => {
    const p = projectFrom(WORKSPACE_ONE_APP);
    const d = envelope(surface(p).out).data!;
    expect(d["pending"]).toEqual({ count: 1, path: ".design-os/onboard/pending.json" });
  });
  it("is absent when nothing is open", () => {
    const p = projectFrom({ "package.json": pkg({ react: "18" }), "src/components/A.tsx": "export const Aaa = () => <i />;\n" });
    expect(envelope(surface(p).out).data!["pending"]).toBeUndefined();
  });
});

describe("the project-level detectors run first on the paths that end in an app-choice error", () => {
  it("a capped scan asks its budget question before an --app that is not a root is refused", () => {
    const p = projectFrom({ "package.json": pkg({ react: "18" }), "src/components/A.tsx": "export const Aaa = () => <i />;\n", ...wideFiles("bulk") });
    const r = surface(p, "--app", "nowhere");
    expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(readPending(p).clusters.map((c) => c.kind)).toContain("scan-budget");
  });
});
