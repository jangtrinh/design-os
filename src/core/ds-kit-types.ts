import type { Registry } from './registry-store.js';
export type { Registry } from './registry-store.js';
export interface KitFile { path: string; hash: string }
export interface KitFinding { code: string; message: string; sourceId?: string }
export class KitError extends Error {
  constructor(readonly code: string, message: string, readonly details: KitFinding[] = []) {
    super(message); this.name = 'KitError';
  }
}
export interface KitSource {
  id: string; kind: 'figma' | 'registry'; path: string; hash: string;
  scope: 'partial' | 'complete'; limitations: string[];
}
export interface KitCase {
  id: string; kind: 'build' | 'render' | 'behavior' | 'review'; subject: string; description: string;
}
export interface KitMapping {
  sourceId: string; name: string; disposition: 'component' | 'icon' | 'screen' | 'excluded' | 'unresolved';
  reason?: string;
  implementation?: { path: string; export: string; strategy: 'reuse' | 'adapt' | 'custom'; primitives: string[] };
  markup?: string; variants?: string[]; states?: string[]; cases?: string[]; tokensUsed?: string[];
}
export interface KitSpec {
  version: 1; name: string; intent: string; target: 'react-shadcn-tailwind'; minimumComponents: number;
  sources: KitSource[]; tokens: string; theme: string; aliases: Record<string, string>;
  mappings: KitMapping[]; artifacts: string[]; cases: KitCase[]; evidence: string;
}
export interface KitPreparation {
  spec: KitSpec; capturedCount: number; tokens: unknown; registry: Registry; content: KitFile[]; contentHash: string;
  tokensHash: string; registryHash: string; findings: KitFinding[]; complete: boolean;
}
export interface KitLock {
  version: 1; status: 'verified' | 'stale'; staleReasons: string[]; contentHash: string;
  content: KitFile[]; evidence: KitFile[]; registry: Registry; tokensHash: string; registryHash: string;
}
