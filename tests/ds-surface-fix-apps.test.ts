/**
 * One app's run does not erase another app's question (review fix round, section F), and `--app` is normalised before it
 * is checked (section H): an absolute path inside the project and `apps/./web` name the same root as `apps/web`.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { WORKSPACE_TWO_APPS, answerKind, envelope, projectFrom, surface } from "./ds-surface-helpers.js";

const code = (n: string): string => `export const ${n}Thing = () => <i />;\n`;
/** Two apps that each export the same three names from `components` and from `ui`: a collision per app. */
const twoAppsWithCollisions = (): string => projectFrom({
  ...WORKSPACE_TWO_APPS,
  ...Object.fromEntries(["web", "admin"].flatMap((app) => ["A", "B", "C"].map((n) => [`apps/${app}/ui/${n}.tsx`, code(n)]))),
});
const collisions = (p: string) => readPending(p).clusters.filter((c) => c.kind === "component-name-collision");

describe("a run on one app replaces only what that app's run raised", () => {
  it("--app apps/web then --app apps/admin leaves both apps' questions in pending.json", () => {
    const p = twoAppsWithCollisions();
    surface(p, "--app", "apps/web");
    const first = collisions(p);
    expect(first).toHaveLength(1);
    expect(first[0]!.members[0]).toContain("apps/web/");
    surface(p, "--app", "apps/admin");
    const both = collisions(p);
    expect(both).toHaveLength(2);
    expect(both.map((c) => c.members[0]!.includes("apps/web/"))).toContain(true);
    expect(both.map((c) => c.raisedBy).sort()).toEqual(["ds surface --app apps/admin", "ds surface --app apps/web"]);
  });
  it("a sheet answered from the first app's question still lands after the second app was read", () => {
    const p = twoAppsWithCollisions();
    surface(p, "--app", "apps/web");
    surface(p, "--app", "apps/admin");
    const r = answerKind(p, "component-name-collision", (k) => ({ choice: k.options[0]!.id }));
    expect(r.code, r.out + r.err).toBe(0);
  });
  it("a run on the same app again replaces its own question (the collision goes when it is fixed)", () => {
    const p = twoAppsWithCollisions();
    surface(p, "--app", "apps/web");
    surface(p, "--app", "apps/web");
    expect(collisions(p)).toHaveLength(1);
  });
  it("another app's open question does not block this app's write", () => {
    const p = twoAppsWithCollisions();
    surface(p, "--app", "apps/web");
    answerKind(p, "app-roots", (k) => ({ choice: ["review-individually"], members: Object.fromEntries((k.perMemberAnswer as { members: string[] }).members.map((m) => [m, "keep"])) }));
    surface(p, "--app", "apps/admin");
    // apps/web's collision is still open and was raised by another run: apps/admin's own is the one that blocks here
    const r = surface(p, "--app", "apps/admin", "--out", "admin.json");
    expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(envelope(r.out).data!["blocked"].clusters.every((c: { raisedBy: string }) => c.raisedBy === "ds surface --app apps/admin" || c.raisedBy === "ds surface")).toBe(true);
  });
});

describe("--app is normalised before it is checked", () => {
  it("an absolute path inside the project, apps/./web and a trailing slash name apps/web", () => {
    const p = twoAppsWithCollisions();
    for (const spelling of [join(p, "apps/web"), "apps/./web", "apps/web/", "./apps/web"]) {
      expect(envelope(surface(p, "--app", spelling).out).data!["app"], spelling).toBe("apps/web");
    }
  });
  it("an absolute path outside the project is still refused by name", () => {
    const p = twoAppsWithCollisions();
    expect(envelope(surface(p, "--app", "/etc/nope").out).error?.code).toBe("SURFACE_APP_NOT_A_ROOT");
  });
});
