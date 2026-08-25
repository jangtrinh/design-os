/**
 * Stable public surface for the deterministic Figma reconcile core.
 *
 * Consumers keep one import path while implementation responsibilities stay in focused
 * modules: on-disk contract types, JSONL validation, cross-batch coalescing, and preview
 * delta computation. This facade contains no behavior of its own.
 */
export * from "./figma-reconcile-types.js";
export * from "./figma-change-log-parser.js";
export * from "./figma-change-coalescer.js";
export * from "./figma-preview-delta.js";
