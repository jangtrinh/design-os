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
      acceptedInputKinds: ["words", "visual-reference"],
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
  const receiptFor = (value: ReturnType<typeof request>) => {
    const parsed = parseCapabilityCatalog(JSON.stringify(catalog));
    if (!parsed.ok) throw new Error(parsed.message);
    const result = resolveCapabilityActivation(value, parsed.catalog, "sha256:catalog");
    if (result.ok) return result.receipt;
    if (result.receipt !== undefined) return result.receipt;
    throw new Error(result.message);
  };

  it.each([
    ["requestedSurface", (value: ReturnType<typeof request>) => ({ ...value, requestedSurface: "native-macos" })],
    ["inputKind", (value: ReturnType<typeof request>) => ({ ...value, inputKind: "visual-reference" })],
    ["selectionEvidence", (value: ReturnType<typeof request>) => ({
      ...value,
      selectionEvidence: { kind: "quoted-request", quote: "AgentTour", role: "requested-artifact" },
    })],
  ])("binds requestDigest to %s", (_field, mutate) => {
    const base = request("web-marketing", "Build a landing page for AgentTour", "landing page");
    expect(receiptFor(mutate(base)).requestDigest).not.toBe(receiptFor(base).requestDigest);
  });

  it("canonicalizes typed request and selectionEvidence key ordering in requestDigest", () => {
    const base = request("web-marketing", "Build a landing page for AgentTour", "landing page");
    const reordered: ReturnType<typeof request> = {
      selectionEvidence: { role: "requested-artifact", quote: "landing page", kind: "quoted-request" },
      inputKind: base.inputKind, requestedSurface: base.requestedSurface, rawRequest: base.rawRequest,
      version: base.version, kind: base.kind,
    };
    expect(receiptFor(reordered).requestDigest).toBe(receiptFor(base).requestDigest);
  });

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
