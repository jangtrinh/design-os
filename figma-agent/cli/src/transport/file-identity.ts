// The ONE canonical file-identity chain for this package (registry-integrity phase 03
// review round, finding 1) — extracted here because `project-bind.ts` and
// `edit-feed-log.ts` each grew their OWN copy, and the copies drifted: `editFeedPath` used
// to slug the fileKey too (lowercasing it), while `fileIdentity` and the kernel's
// `fileSlugOf` (src/core/figma-reconcile.ts, a separate package/bundle that must duplicate
// this logic rather than import it) both return the fileKey RAW. An uppercase-bearing
// fileKey therefore partitioned the edit feed under a DIFFERENT identity than the reconcile
// pipeline used for the exact same file.
//
// Ruling: raw fileKey is canonical everywhere — Figma fileKeys are alphanumeric and
// already filesystem-safe, uniqueness wins over cosmetic lowercasing, and a slug can
// collide two keys differing only by case. Both `project-bind.ts` and `edit-feed-log.ts`
// import THIS module's `fileIdentity` rather than deriving their own, so the two schemes
// cannot drift apart again inside this package. The kernel's copy is a separate concern
// (it cannot import figma-agent at all) — its own parity with this chain is enforced by
// the duplicated fixture list in `tests/cmd-figma-reconcile.test.ts` and
// `figma-agent/tests/project-bind.test.ts` (each names the other as its twin), NOT by a
// prose comment claiming sameness — a comment cannot catch drift; a test that runs on
// every change can.
export function safeSlug(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.length > 0 ? s : 'unknown';
}

/** fileKey when present (verbatim, never slugged), else slugged fileName, else 'unknown'. */
export function fileIdentity(fileKey: string | null | undefined, fileName: string | null | undefined): string {
  if (typeof fileKey === 'string' && fileKey.trim() !== '') return fileKey;
  return safeSlug(fileName ?? '');
}
