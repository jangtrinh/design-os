/**
 * Fix round 2, section O: a code name that equals a registered record's name only after the kernel's normalisation (case,
 * spacing) joins the `component-source-match` question on every store. "Same" links to the existing record and keeps its
 * name; "separate" registers `<code name> · code`. Member identity stays the code name with the record's source id and the file.
 */
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { envelope, surface } from "./ds-surface-helpers.js";
import { answerMatch, apply, figma, pending, readyProject, registryOf } from "./ds-surface-source-match-helpers.js";

const NEAR = (): unknown[] => [figma("card", 1, ["color.ink"]), figma("badge", 2, [])];
const CARD = "Card#figma:1:1,src/components/ui/Card.tsx";
const BADGE = "Badge#figma:2:1,src/components/ui/Badge.tsx";

describe("a near name is asked on a store that is not kit-bound", () => {
  it("raises the question with a member per near name, and the label shows both spellings", () => {
    const p = readyProject(NEAR());
    const [c] = pending(p);
    expect(c!.members).toEqual([BADGE, CARD]);
    expect(c!.labels![CARD]).toBe("Card (the registry spells it card)");
    expect(c!.labels![BADGE]).toBe("Badge (the registry spells it badge)");
    const sheet = capture(["onboard", "questions", "--format", "markdown", "--cwd", p]).out;
    expect(sheet).toContain(`- Card (the registry spells it card) (${CARD})`);
  });
  it("--apply is blocked until it is answered, and the preview lists the names awaiting a ruling", () => {
    const p = readyProject(NEAR());
    const d = envelope(surface(p, "--register").out).data!["register"];
    expect(d["awaitingSourceMatch"].map((i: { name: string }) => i.name).sort()).toEqual(["Badge", "Card"]);
    expect(d["wouldRefuse"].count).toBe(0);
    expect(envelope(apply(p).out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
  });
});

describe("the outcome of each answer", () => {
  const answered = (same: string, separate: string): string => {
    const p = readyProject(NEAR());
    const done = answerMatch(p, (k) => ({ choice: k.perMemberAnswer!.choice, members: { [same]: "same", [separate]: "separate" } }));
    expect(done.code, done.out + done.err).toBe(0);
    return p;
  };
  it("same: the record `card` gains the code reference and keeps its name; no `Card` record is registered", () => {
    const p = answered(CARD, BADGE);
    const a = apply(p);
    expect(a.code, a.out).toBe(0);
    const names = registryOf(p).components.map((c) => c.name);
    expect(names).toContain("card");
    expect(names).not.toContain("Card");
    expect(registryOf(p).components.find((c) => c.name === "card")!.code?.sourceRef).toContain("Card.tsx");
  });
  it("separate: `Badge · code` is registered next to the untouched record `badge`", () => {
    const p = answered(CARD, BADGE);
    apply(p);
    const names = registryOf(p).components.map((c) => c.name);
    expect(names).toContain("badge");
    expect(names).toContain("Badge · code");
    expect(names).not.toContain("Badge");
  });
});
