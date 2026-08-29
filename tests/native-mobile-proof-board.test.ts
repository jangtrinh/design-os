import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { renderNativeMobileProofBoard } from "../scripts/native-mobile-proof/render-proof-board.mjs";

const manifest = JSON.parse(readFileSync("showcase/native-mobile-proof-pilot/proof-manifest.json", "utf8"));

describe("native mobile proof board", () => {
  it("renders the exact provisional boundary and all arm-tier cells", () => {
    const html = renderNativeMobileProofBoard(manifest);
    expect(html).toContain("AVAILABLE · PROVISIONAL · QUALIFIED DELIVERY FORBIDDEN");
    expect(html).toContain("native-ios-application");
    expect(html).toContain("native-ipados-application");
    expect(html.match(/data-tier=/g)).toHaveLength(12);
    expect(html).toContain("No physical device connected");
    expect(html).not.toMatch(/overall score\s*:|\d+\/100|data-score=/i);
  });

  it("embeds a deterministic manifest digest and no external assets", () => {
    const first = renderNativeMobileProofBoard(manifest);
    const second = renderNativeMobileProofBoard(manifest);
    expect(first).toBe(second);
    expect(first).toMatch(/data-manifest-sha256="[a-f0-9]{64}"/);
    expect(first).not.toMatch(/<script[^>]+src=|<link[^>]+href=/i);
  });

  it("labels the frozen repository input as a base, not the proof artifact itself", () => {
    const html = renderNativeMobileProofBoard(manifest);
    expect(manifest).toHaveProperty("routingBaseGitSha");
    expect(manifest).not.toHaveProperty("repositorySha");
    expect(html).toContain("<dt>Routing base commit</dt>");
    expect(html).toContain("<dt>Proof identity</dt>");
  });

  it("escapes manifest-controlled text before rendering", () => {
    const hostile = structuredClone(manifest);
    hostile.knownFailures = ["<script>alert(1)</script>"];
    const html = renderNativeMobileProofBoard(hostile);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders PNG evidence as an inline visual witness", () => {
    const withScreenshot = structuredClone(manifest);
    withScreenshot.arms[0].tiers[2].evidence.push({
      path: "evidence/screenshots/native-ios-proof.png",
      sha256: "a".repeat(64),
    });
    const html = renderNativeMobileProofBoard(withScreenshot);
    expect(html).toContain('<img src="evidence/screenshots/native-ios-proof.png"');
    expect(html).toContain('alt="Visual witness for native-ios-proof.png"');
  });

  it("renders Tier 3 behavior and visual dispositions separately from its aggregate status", () => {
    const html = renderNativeMobileProofBoard(manifest);
    expect(html).toContain('data-behavior-disposition="PASS"');
    expect(html).toContain('data-visual-disposition="UNASSESSED"');
    expect(html).toContain("Behavior: PASS");
    expect(html).toContain("Visual: UNASSESSED");
    expect(html).toContain("PENDING");
    expect(html).not.toContain("Visual: PASS");
  });
});
