import { describe, expect, it } from "vitest";

import {
  parseCapabilityCatalog,
  resolveCapabilityActivation,
} from "../src/core/capability-activation.js";

const catalog = {
  version: 1,
  profiles: [
    {
      id: "web-marketing",
      status: "qualified",
      acceptedInputKinds: ["words"],
      workflow: "generate",
      artifact: "html",
      requiredKnowledge: ["need-routing"],
      machineWitnesses: ["gate"],
      renderedWitnesses: ["1440px"],
      manualWitnesses: ["owner-visible-acceptance"],
      qualificationEvidence: "knowledge/qualified-delivery.md",
    },
    {
      id: "native-macos",
      status: "unqualified",
      acceptedInputKinds: ["words"],
      workflow: null,
      artifact: "native-macos-application",
      refusalCode: "CAPABILITY_UNQUALIFIED",
      action: "Do not run generate.",
      advisoryKnowledge: ["content-design"],
      qualificationRequirements: ["SwiftUI knowledge"],
    },
  ],
};

const request = (surface: string, rawRequest: string, quote: string) => ({
  kind: "capability-activation-request",
  version: 1,
  rawRequest,
  requestedSurface: surface,
  inputKind: "words",
  selectionEvidence: { kind: "quoted-request", quote, role: "requested-artifact" },
});

describe("capability activation core", () => {
  it("qualifies marketing and preserves marketing-for-native-app subject context", () => {
    const parsed = parseCapabilityCatalog(JSON.stringify(catalog));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const raw of ["Build a landing page", "Build a landing page for a native macOS app"]) {
      const result = resolveCapabilityActivation(
        request("web-marketing", raw, "landing page"),
        parsed.catalog,
        "sha256:catalog",
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.receipt.route).toBe("generate");
        expect(result.receipt.artifact).toBe("html");
      }
    }
  });

  it("refuses native macOS without an implicit HTML fallback", () => {
    const parsed = parseCapabilityCatalog(JSON.stringify(catalog));
    if (!parsed.ok) throw new Error(parsed.message);
    const result = resolveCapabilityActivation(
      request("native-macos", "Build a native macOS workspace", "native macOS workspace"),
      parsed.catalog,
      "sha256:catalog",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CAPABILITY_UNQUALIFIED");
      expect(result.receipt?.route).toBeNull();
    }
  });

  it("rejects selection evidence whose quote is absent from the raw request", () => {
    const parsed = parseCapabilityCatalog(JSON.stringify(catalog));
    if (!parsed.ok) throw new Error(parsed.message);
    const result = resolveCapabilityActivation(
      request("web-marketing", "Build a product page", "native macOS app"),
      parsed.catalog,
      "sha256:catalog",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("BAD_ACTIVATION");
  });

  it("rejects catalogs that violate qualified or unqualified profile contracts", () => {
    const missingEvidence = structuredClone(catalog);
    delete (missingEvidence.profiles[0] as { qualificationEvidence?: string }).qualificationEvidence;
    expect(parseCapabilityCatalog(JSON.stringify(missingEvidence)).ok).toBe(false);
    const extraField = structuredClone(catalog) as unknown as { profiles: Array<Record<string, unknown>> };
    extraField.profiles[1]!["fallbackWorkflow"] = "generate";
    expect(parseCapabilityCatalog(JSON.stringify(extraField)).ok).toBe(false);
  });

  it("rejects activation request fields outside the public schema", () => {
    const parsed = parseCapabilityCatalog(JSON.stringify(catalog));
    if (!parsed.ok) throw new Error(parsed.message);
    const withExtra = { ...request("web-marketing", "Build a landing page", "landing page"), trusted: true };
    const result = resolveCapabilityActivation(withExtra, parsed.catalog, "sha256:catalog");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("BAD_ACTIVATION");
  });
});
