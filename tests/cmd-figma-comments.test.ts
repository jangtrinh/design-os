/**
 * `ui figma comments` — the command surface for comment triage.
 *
 * Drives run() exactly as the sibling cmd-* tests do. Asserts the digest a human reads
 * at 8am, the JSON envelope a host model drives one-by-one from, graceful degradation
 * when supporting payloads were not captured, and every error path.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

const FIX = resolve(__dirname, "fixtures/figma-comments");
const COMMENTS = resolve(FIX, "comments.json");
const NODES = resolve(FIX, "nodes.json");
const TREE = resolve(FIX, "file-tree.json");

const FULL = ["figma", "comments", COMMENTS, "--nodes", NODES, "--file-tree", TREE];

describe("ui figma comments — digest", () => {
  it("leads with counts that account for everything pulled", () => {
    const { code, out } = capture(FULL);
    expect(code).toBe(0);
    expect(out).toContain("9 pulled");
    expect(out).toContain("1 resolved hidden");
    expect(out).toContain("1 reply folded");
    expect(out).toContain("7 shown");
  });

  it("groups by frame and labels the page, so duplicate frame names stay distinct", () => {
    const { out } = capture(FULL);
    expect(out).toContain("Product / Checkout");
    expect(out).toContain("Archive / Checkout");
  });

  it("shows the ancestor chain rather than a junk leaf", () => {
    const { out } = capture(FULL);
    expect(out).toContain("OrderSummary › PriceRow");
    expect(out).not.toContain("Rectangle 47");
  });

  it("prints the comment verbatim and folds its replies underneath", () => {
    const { out } = capture(FULL);
    expect(out).toContain("The total is cramped against the divider");
    expect(out).toContain("↳ Bao: Agreed. 8px is not enough at this density.");
  });

  it("buckets bare-canvas pins instead of dropping or mis-attributing them", () => {
    const { out } = capture(FULL);
    expect(out).toContain("Unanchored (pinned to bare canvas)");
  });

  it("flags a comment whose frame was deleted", () => {
    const { out } = capture(FULL);
    expect(out).toContain("deleted since the comment");
  });

  it("hides resolved threads by default and reveals them on request", () => {
    expect(capture(FULL).out).not.toContain("Spacing on the header was off");
    const { out } = capture([...FULL, "--include-resolved"]);
    expect(out).toContain("Spacing on the header was off");
  });
});

describe("ui figma comments — JSON envelope", () => {
  it("emits threads with resolved anchors and honest confidence labels", () => {
    const { code, out } = capture([...FULL, "--json"]);
    expect(code).toBe(0);
    const env = JSON.parse(out) as {
      ok: boolean;
      data: { stats: Record<string, number>; threads: { id: string; anchor: { confidence: string; chain: string[] } }[] };
    };
    expect(env.ok).toBe(true);
    expect(env.data.stats["shown"]).toBe(7);

    const byId = new Map(env.data.threads.map((t) => [t.id, t]));
    expect(byId.get("c-anchored-1")?.anchor.confidence).toBe("region");
    expect(byId.get("c-anchored-2")?.anchor.confidence).toBe("element");
    expect(byId.get("c-orphaned")?.anchor.confidence).toBe("orphaned");
    expect(byId.get("c-unanchored-vector")?.anchor.confidence).toBe("unanchored");
    expect(byId.get("c-anchored-1")?.anchor.chain).toEqual(["Checkout", "OrderSummary", "PriceRow"]);
  });
});

describe("ui figma comments — --under scoping", () => {
  it("keeps only comments inside the named subtree and counts what it excluded", () => {
    const { code, out } = capture([...FULL, "--under", "10:2"]);
    expect(code).toBe(0);
    expect(out).toContain("Product / Checkout");
    expect(out).not.toContain("Archive / Checkout"); // other page
    expect(out).not.toContain("Unanchored"); // no frame at all
    expect(out).toContain("outside scope");
  });

  it("refuses when the scope node is absent rather than silently showing the whole file", () => {
    const { code, out } = capture([...FULL, "--under", "99:99", "--json"]);
    expect(code).toBe(1);
    const err = JSON.parse(out).error;
    expect(err.code).toBe("BAD_ARG");
    expect(err.message).toContain("99:99");
  });
});

describe("ui figma comments — degradation and errors", () => {
  it("still groups by frame when no supporting payloads were captured", () => {
    const { code, out } = capture(["figma", "comments", COMMENTS]);
    expect(code).toBe(0);
    expect(out).toContain("7 shown");
    expect(out).toContain("[frame]"); // knows the frame, declines to claim an element
  });

  it("refuses a missing path with READ_ERROR", () => {
    const { code, out } = capture(["figma", "comments", resolve(FIX, "nope.json"), "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error.code).toBe("READ_ERROR");
  });

  it("refuses a payload that is not a comments response", () => {
    const { code, out } = capture(["figma", "comments", NODES, "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error.code).toBe("BAD_COMMENTS_PAYLOAD");
  });

  it("requires the payload path", () => {
    const { code, out } = capture(["figma", "comments", "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error.code).toBe("BAD_ARG");
  });
});
