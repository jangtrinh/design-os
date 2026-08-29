import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyNativeMobileProofManifest } from "../scripts/native-mobile-proof/verify-proof-manifest.mjs";
import { copyCheckedProofTree } from "./helpers/native-mobile-proof-fixtures.js";

const iosAppRoot = "apps/native-ios-tocchien-modernization";

describe("native mobile proof source integrity", () => {
  it("invalidates Tier 2 when exact generated source bytes drift", () => {
    const { manifest, root } = copyCheckedProofTree();
    const source = join(root, iosAppRoot, "TocChienModernization/Models/DictionaryEntry.swift");
    writeFileSync(source, `${readFileSync(source, "utf8")}\n// drift probe\n`);
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain("native-ios tier 2 source tree digest mismatch");
  });

  it("invalidates Tier 2 when a generated source file is added or removed", () => {
    const added = copyCheckedProofTree();
    writeFileSync(
      join(added.root, iosAppRoot, "TocChienModernization/Unexpected.swift"),
      "struct Unexpected {}\n",
    );
    expect(verifyNativeMobileProofManifest(added.manifest, added.root)).toContain("native-ios tier 2 source tree digest mismatch");
    const removed = copyCheckedProofTree();
    rmSync(join(removed.root, iosAppRoot, "TocChienModernization/Models/DictionaryEntry.swift"));
    expect(verifyNativeMobileProofManifest(removed.manifest, removed.root)).toContain("native-ios tier 2 source tree digest mismatch");
  });

  it("does not hide compileable Swift inside DerivedData", () => {
    const { manifest, root } = copyCheckedProofTree();
    const hidden = join(root, iosAppRoot, "TocChienModernization/DerivedData");
    mkdirSync(hidden, { recursive: true });
    writeFileSync(join(hidden, "Injected.swift"), "struct Injected {}\n");
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain("native-ios tier 2 source tree digest mismatch");
  });

  it("binds the generated iPad Info.plist build input", () => {
    const { manifest, root } = copyCheckedProofTree();
    const plist = join(root, "apps/native-ipados-project-workspace/Sources/ProjectBriefWorkspace/Info.plist");
    writeFileSync(plist, `${readFileSync(plist, "utf8")}\n<!-- drift probe -->\n`);
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain("native-ipados tier 2 source tree digest mismatch");
  });

  it("does not hide compileable Swift inside xcuserdata", () => {
    const { manifest, root } = copyCheckedProofTree();
    const hidden = join(root, iosAppRoot, "TocChienModernization/xcuserdata");
    mkdirSync(hidden, { recursive: true });
    writeFileSync(join(hidden, "Injected.swift"), "struct InjectedFromUserData {}\n");
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain("native-ios tier 2 source tree digest mismatch");
  });

  it("does not hide nested resources behind an app-root metadata basename", () => {
    const { manifest, root } = copyCheckedProofTree();
    const resource = join(root, iosAppRoot, "TocChienModernization/activation-receipt.json");
    writeFileSync(resource, "{\"injected\":true}\n");
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain("native-ios tier 2 source tree digest mismatch");
  });

  it("rejects a symlinked generated-app root that escapes the proof tree", () => {
    const { manifest, root } = copyCheckedProofTree();
    const appRoot = join(root, iosAppRoot);
    const external = join(root, "..", "external-native-ios");
    renameSync(appRoot, external);
    symlinkSync(external, appRoot, "dir");
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain(
      "native-ios tier 2 source tree invalid: source tree root must be a real directory inside the proof root",
    );
  });
});
