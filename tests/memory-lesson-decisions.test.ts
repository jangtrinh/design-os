import { expect, it } from "vitest";
import { compileLessons } from "../src/core/memory-lessons.js";
import type { MemoryEvent } from "../src/core/memory-events.js";

const base: MemoryEvent[] = [
  { v: 1, id: "e1", t: "2026-10-09T00:00:00Z", type: "manual_edit", data: { summary: "Owner feedback" },
    artifact: { ref: "proof.txt", fingerprint: "sha256:" + "a".repeat(64) } },
  { v: 1, id: "e2", t: "2026-10-09T00:00:00Z", type: "lesson_proposed", refs: ["e1"],
    data: { text: "Short labels", scope: { kind: "project" }, dsRevision: "sha256-" + "a".repeat(43) } },
];
for (const decision of [["accept"], ["reject"], ["revoke"], null, 0, {}, true]) {
  it(`rejects non-string review decision ${JSON.stringify(decision)} during replay`, () => {
    const event: MemoryEvent = { v: 1, id: "e3", t: "2026-10-09T00:00:00Z", type: "lesson_reviewed", actor: "owner", refs: ["e2"],
      data: { lessonId: "e2", decision, reason: "Owner decision", approvalRef: "approval.json", approvalFingerprint: "sha256:" + "b".repeat(64) } };
    expect(() => compileLessons([...base, event])).toThrow(/review decision/);
    expect(compileLessons(base)[0]?.status).toBe("pending");
  });
}
