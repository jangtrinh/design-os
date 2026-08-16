/**
 * Verdict classification — reading the owner's answer off a thread we posted.
 *
 * Every fixture here is a real message from the pilot run. The two that matter most are the
 * ones that shipped defects: a resolved thread with no reply that was read as acceptance,
 * and a reversal that was read as done.
 */
import { describe, expect, it } from "vitest";

import { classifyVerdict, summariseVerdicts } from "../src/core/figma-comment-verdict.js";
import type { CommentThread } from "../src/core/figma-comment-types.js";

const ME = "Giang Trinh";

function thread(replies: string[], author = ME): CommentThread {
  return {
    id: "t1",
    orderId: "1",
    author,
    createdAt: "2026-08-15T03:00:00Z",
    message: "✅ design:os · AM-12 — delivered",
    replies: replies.map((message, i) => ({
      id: `r${i}`,
      author: ME,
      createdAt: `2026-08-15T04:0${i}:00Z`,
      message,
    })),
    anchor: { kind: "frame", nodeId: "1:1", offset: { x: 0, y: 0 } },
  };
}

describe("classifyVerdict", () => {
  it("treats a resolved thread with NO reply as silent, never accepted", () => {
    // 7 of 26 handoff threads in the pilot run were closed in silence and all 7 were read
    // as acceptance. This single assertion is the reason the module exists.
    expect(classifyVerdict(thread([]), ME)?.verdict).toBe("silent");
  });

  it("accepts a bare acknowledgement", () => {
    expect(classifyVerdict(thread(["Done"]), ME)?.verdict).toBe("accepted");
    expect(classifyVerdict(thread(["ok nhé"]), ME)?.verdict).toBe("accepted");
  });

  it("does NOT accept an acknowledgement that carries a caveat", () => {
    // Real reply. "Done." alone is acceptance; this is a task.
    const v = classifyVerdict(thread(["Done. Có manual adjust cần scan và document lại."]), ME);
    expect(v?.verdict).toBe("conditional");
    expect(v?.evidence).toContain("manual adjust");
  });

  it("reads a withdrawal of the requirement as reversed", () => {
    // AM-17: shipped as done with the opposite requirement still in the thread.
    const v = classifyVerdict(
      thread(["Theo comment thì phần land-scape bây giờ chỉ cần 1 layer thôi. Không cần layer cha con."]),
      ME,
    );
    expect(v?.verdict).toBe("reversed");
  });

  it("reads a new instruction as conditional", () => {
    expect(
      classifyVerdict(thread(["Transformation plan need to demonstrate multiple states."]), ME)?.verdict,
    ).toBe("conditional");
  });

  it("judges only the LAST reply — a thread can be answered twice", () => {
    expect(classifyVerdict(thread(["Done", "Thêm nút X để xoá."]), ME)?.verdict).toBe("conditional");
  });

  it("returns null for a thread we did not author", () => {
    // A reviewer's own request has no verdict to read; inventing one is the category error
    // this module exists to prevent.
    expect(classifyVerdict(thread(["Done"], "Hải Phạm"), ME)).toBeNull();
  });

  it("returns null when no handle was supplied rather than guessing an identity", () => {
    expect(classifyVerdict(thread(["Done"]), "")).toBeNull();
  });

  it("biases the ambiguous case to conditional, not accepted", () => {
    expect(classifyVerdict(thread(["hmm để xem lại"]), ME)?.verdict).toBe("conditional");
  });
});

describe("summariseVerdicts", () => {
  it("counts everything that is not a clean yes as awaiting a verdict", () => {
    const s = summariseVerdicts([
      classifyVerdict(thread(["Done"]), ME),
      classifyVerdict(thread([]), ME),
      classifyVerdict(thread(["Không cần layer cha con."]), ME),
      classifyVerdict(thread(["Done. Nhưng cần scan lại."]), ME),
      classifyVerdict(thread(["Done"], "Hải Phạm"), ME), // not ours — ignored
    ]);
    expect(s).toEqual({ accepted: 1, conditional: 1, reversed: 1, silent: 1, awaitingVerdict: 3 });
  });
});
