/**
 * Public surface of the DesignFacts IR. Extractors and rules import from here,
 * never from the individual modules, so the internal split (vocabulary vs
 * payloads vs contract) can change without touching consumers.
 */
export * from "./fact-model.js";
export * from "./fact-kinds.js";
export * from "./fact-collector.js";
export * from "./extractor-registry.js";
export * from "./rule-requirements.js";
