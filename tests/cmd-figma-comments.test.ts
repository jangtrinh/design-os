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

const TGT = ["--delivery-target", "figma-canvas"];
const FULL = ["figma", "comments", COMMENTS, "--nodes", NODES, "--file-tree", TREE, ...TGT];

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
    const { code, out } = capture(["figma", "comments", COMMENTS, ...TGT]);
    expect(code).toBe(0);
    expect(out).toContain("7 shown");
    expect(out).toContain("[frame]"); // knows the frame, declines to claim an element
  });

  it("refuses a missing path with READ_ERROR", () => {
    const { code, out } = capture(["figma", "comments", resolve(FIX, "nope.json"), ...TGT, "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error.code).toBe("READ_ERROR");
  });

  it("refuses a payload that is not a comments response", () => {
    const { code, out } = capture(["figma", "comments", NODES, ...TGT, "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error.code).toBe("BAD_COMMENTS_PAYLOAD");
  });

  it("requires the payload path", () => {
    const { code, out } = capture(["figma", "comments", ...TGT, "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error.code).toBe("BAD_ARG");
  });
});

describe("ui figma comments — delivery target is required", () => {
  it("refuses a batch that does not say what 'done' means", () => {
    // The most expensive error measured on a real run: a batch aimed at the wrong artifact
    // that then passed every gate defined for the wrong one. Required, not defaulted.
    const { code, out } = capture(["figma", "comments", COMMENTS, "--json"]);
    expect(code).toBe(1);
    const err = JSON.parse(out).error;
    expect(err.code).toBe("BAD_ARG");
    expect(err.message).toContain("--delivery-target");
  });

  it("rejects a target outside the closed set", () => {
    const { code, out } = capture(["figma", "comments", COMMENTS, "--delivery-target", "canvas", "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error.code).toBe("BAD_ARG");
  });

  it("stamps the accepted target into the envelope", () => {
    const { code, out } = capture([...FULL, "--json"]);
    expect(code).toBe(0);
    expect(JSON.parse(out).data.deliveryTarget).toBe("figma-canvas");
  });
});

describe("ui figma comments — shared-instance warning", () => {
  it("flags a pin that lands inside a component instance", () => {
    const { out } = capture([...FULL, "--json"]);
    const threads = JSON.parse(out).data.threads as { id: string; anchor: { sharedInstance: boolean } }[];
    // The fixture's PayButton is an INSTANCE; the plain frames are not.
    const byId = new Map(threads.map((t) => [t.id, t]));
    expect(byId.get("c-anchored-2")?.anchor.sharedInstance).toBe(true);
    expect(byId.get("c-anchored-1")?.anchor.sharedInstance).toBe(false);
  });
});

describe("ui figma comments — our own resolved threads are never filtered away", () => {
  // Regression. The verdict feature first shipped returning all zeros on live data: verdicts
  // are read from threads WE posted, the owner resolves those as soon as he replies, and the
  // default view filters resolved threads. The feature built to read verdicts had filtered
  // away every thread that had one — the same blind spot as the original resolve filter, one
  // layer up. A zero that looks plausible is the most expensive kind.
  it("shows a RESOLVED thread we authored, so its verdict can be read", () => {
    const { code, out } = capture([...FULL, "--authored-by", "Dana", "--json"]);
    expect(code).toBe(0);
    const threads = JSON.parse(out).data.threads as { id: string; verdict?: { verdict: string } }[];
    const resolvedOurs = threads.find((t) => t.id === "c-resolved");
    expect(resolvedOurs, "our own resolved thread must stay visible").toBeDefined();
    expect(resolvedOurs?.verdict?.verdict).toBe("silent");
  });

  it("still hides a resolved thread we did NOT author", () => {
    const { out } = capture([...FULL, "--authored-by", "Someone Else", "--json"]);
    const threads = JSON.parse(out).data.threads as { id: string }[];
    expect(threads.some((t) => t.id === "c-resolved")).toBe(false);
  });

  it("hides it too when no handle is given — nothing is ours without one", () => {
    const { out } = capture([...FULL, "--json"]);
    const threads = JSON.parse(out).data.threads as { id: string }[];
    expect(threads.some((t) => t.id === "c-resolved")).toBe(false);
  });
});
