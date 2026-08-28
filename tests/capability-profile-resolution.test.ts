import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
      qualificationEvidence: "knowledge/native-macos/pilot-01-evidence.json#sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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
const ROOT = fileURLToPath(new URL("..", import.meta.url));

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

  it("routes an available provisional v2 native arm without HTML fallback", () => {
    const parsed = parseCapabilityCatalog(readFileSync(join(ROOT, "knowledge", "capability-profiles.json"), "utf8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = resolveCapabilityActivation(
      request("native-macos", "Build a native macOS workspace", "native macOS workspace"),
      parsed.catalog,
      "sha256:catalog",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const receipt = result.receipt as unknown as Record<string, unknown>;
    expect(receipt).toMatchObject({
      version: 2,
      routingDisposition: "ROUTED",
      assurance: "PROVISIONAL",
      claimPolicy: "QUALIFIED_DELIVERY_FORBIDDEN",
      route: "native-macos",
      artifact: "native-macos-application",
    });
    expect(receipt["route"]).not.toBe("generate");
    expect(receipt["artifact"]).not.toBe("html");
  });

  it("normalizes v1 catalog profiles without granting an implicit provisional route", () => {
    const parsed = parseCapabilityCatalog(JSON.stringify(catalog));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const profiles = parsed.catalog.profiles as unknown as Array<Record<string, unknown>>;
    expect(profiles.find((profile) => profile["id"] === "web-marketing")).toMatchObject({
      availability: "available", assurance: "qualified",
    });
    expect(profiles.find((profile) => profile["id"] === "native-macos")).toMatchObject({
      availability: "unavailable", assurance: "unassessed", workflow: null,
    });
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

  it("keeps the actual native catalog available but explicitly provisional", () => {
    const parsed = parseCapabilityCatalog(readFileSync(join(ROOT, "knowledge", "capability-profiles.json"), "utf8"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const native = parsed.catalog.profiles.find((profile) => profile.id === "native-macos");
    expect(native).toBeDefined();
    if (native === undefined) return;

    const profile = native as unknown as Record<string, unknown>;
    expect(profile["availability"]).toBe("available");
    expect(profile["assurance"]).toBe("provisional");
    expect(profile["workflow"]).toBe("native-macos");
    expect(profile["requiredKnowledge"]).toContain("native-macos-craft");
    expect(profile["assuranceEvidence"]).toMatch(
      /^knowledge\/native-macos\/pilot-01-evidence\.json#sha256:[a-f0-9]{64}$/,
    );
    const result = resolveCapabilityActivation(
      request("native-macos", "Build a native macOS workspace", "native macOS workspace"),
      parsed.catalog,
      "sha256:catalog",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const receipt = result.receipt as unknown as Record<string, unknown>;
    expect(receipt).toMatchObject({
      routingDisposition: "ROUTED",
      assurance: "PROVISIONAL",
      claimPolicy: "QUALIFIED_DELIVERY_FORBIDDEN",
      route: "native-macos",
    });
    expect(receipt["selectedKnowledge"]).toContain("native-macos-craft");
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
    const missingNativeEvidence = structuredClone(catalog) as unknown as { profiles: Array<Record<string, unknown>> };
    delete missingNativeEvidence.profiles[1]!["qualificationEvidence"];
    expect(parseCapabilityCatalog(JSON.stringify(missingNativeEvidence)).ok).toBe(false);
    const unregisteredNative = structuredClone(catalog) as unknown as { profiles: Array<Record<string, unknown>> };
    unregisteredNative.profiles[1]!["id"] = "unregistered-native";
    expect(parseCapabilityCatalog(JSON.stringify(unregisteredNative)).ok).toBe(false);
  });

  it.each([1, 2] as const)("rejects duplicate capability IDs in v%s catalogs", (version) => {
    const source = (version === 1 ? structuredClone(catalog) : {
      version: 2,
      profiles: [{
        id: "web-marketing", availability: "available", assurance: "qualified",
        acceptedInputKinds: ["words"], workflow: "generate", artifact: "html",
        requiredKnowledge: ["need-routing"], machineWitnesses: ["gate"],
        renderedWitnesses: ["1440px"], manualWitnesses: ["owner-visible-acceptance"],
        assuranceEvidence: "knowledge/qualified-delivery.md",
      }],
    }) as unknown as { profiles: Array<Record<string, unknown>> };
    source.profiles.push(structuredClone(source.profiles[0]!));
    const parsed = parseCapabilityCatalog(JSON.stringify(source));
    expect(parsed).toMatchObject({
      ok: false,
      code: "CAPABILITY_PROFILE_DUPLICATE",
      message: "CAPABILITY_PROFILE_DUPLICATE: duplicate capability profile id 'web-marketing'",
    });
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
