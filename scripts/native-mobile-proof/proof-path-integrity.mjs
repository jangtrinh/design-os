import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, normalize, relative, sep } from "node:path";

function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) return false;
  const normalized = normalize(value);
  return normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

function assertRealDirectory(path, message) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(message);
}

export function resolveContainedPath(root, relativePath, expectedKind) {
  const message = `${expectedKind} must be a real ${expectedKind} inside the proof root`;
  if (!safeRelativePath(relativePath)) throw new Error(message);
  assertRealDirectory(root, message);

  const rootReal = realpathSync(root);
  const parts = normalize(relativePath).split(sep).filter(Boolean);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(message);
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(message);
  }

  const stat = lstatSync(current);
  if ((expectedKind === "directory" && !stat.isDirectory())
    || (expectedKind === "file" && !stat.isFile())) throw new Error(message);
  const resolved = realpathSync(current);
  const fromRoot = relative(rootReal, resolved);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error(message);
  return resolved;
}
