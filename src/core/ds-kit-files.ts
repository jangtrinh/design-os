import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { KitError, type KitFile } from './ds-kit-types.js';
export function hashKitBytes(buffer: Buffer): string { return `sha256:${createHash('sha256').update(buffer).digest('hex')}`; }
export function kitPath(path: unknown): string {
  if (typeof path !== 'string' || !path || path.includes('\\') || [...path].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c.codePointAt(0)! >= 0xD800 && c.codePointAt(0)! <= 0xDFFF) || /[<>:"|?*]/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p)))
    throw new KitError('KIT_PATH', `Invalid portable kit path: ${String(path)}`);
  return path;
}
export function ignoredKitPath(path: string): boolean {
  return /^(evidence|design|dist|node_modules)(\/|$)/.test(path) || path === 'kit.lock.json';
}
export function readKitFile(root: string, path: string): Buffer {
  kitPath(path);
  let fd: number | undefined;
  try {
    let current = resolve(root);
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) throw new KitError('KIT_PATH', 'Kit root must be a regular directory');
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (!readdirSync(current).includes(part)) throw new KitError('KIT_PATH', `Missing file or wrong path case: ${path}`);
      current = join(current, part);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new KitError('KIT_PATH', `Not a regular kit file: ${path}`);
    }
    fd = openSync(current, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!fstatSync(fd).isFile()) throw new KitError('KIT_PATH', `Not a regular kit file: ${path}`);
    return readFileSync(fd);
  } catch (error) {
    if (error instanceof KitError) throw error;
    throw new KitError('KIT_IO', `Cannot read ${path}: ${String(error)}`);
  } finally { if (fd !== undefined) closeSync(fd); }
}
export function uniqueKitPaths(paths: string[]): void {
  const seen = new Set<string>();
  for (const path of paths) {
    kitPath(path); const key = path.normalize('NFC').toLowerCase();
    if (seen.has(key)) throw new KitError('KIT_PATH', `Duplicate/case-colliding path: ${path}`);
    seen.add(key);
  }
}
export function verifyKitFiles(root: string, files: KitFile[]): void {
  uniqueKitPaths(files.map(f => f.path));
  for (const file of files) {
    if (typeof file.hash !== 'string' || file.hash.length !== 71 || !/^sha256:[a-f0-9]{64}$/.test(file.hash) || hashKitBytes(readKitFile(root, file.path)) !== file.hash)
      throw new KitError('KIT_TAMPERED', `Byte hash mismatch: ${file.path}`);
  }
}
export function indexKitContent(root: string, artifacts: string[]): KitFile[] {
  const paths = ['kit.json', ...artifacts.filter(p => p !== 'kit.json')];
  uniqueKitPaths(artifacts); uniqueKitPaths(paths);
  if (paths.some(ignoredKitPath)) throw new KitError('KIT_PATH', 'Generated/evidence trees cannot be content artifacts');
  const declared = new Set(paths);
  const walk = (prefix: string): void => {
    const names = readdirSync(join(root, prefix)).sort();
    uniqueKitPaths(names);
    for (const name of names) {
      const rel = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(join(root, rel));
      if (stat.isSymbolicLink()) throw new KitError('KIT_PATH', `Symlink: ${rel}`);
      if (ignoredKitPath(rel)) {
        if (rel !== 'kit.lock.json' && !stat.isDirectory()) throw new KitError('KIT_UNDECLARED', `Reserved tree is an ordinary file: ${rel}`);
        continue;
      }
      if (stat.isDirectory()) walk(rel);
      else if (!stat.isFile() || !declared.has(rel)) throw new KitError('KIT_UNDECLARED', `Undeclared file: ${rel}`);
    }
  };
  try { walk(''); } catch (error) {
    if (error instanceof KitError) throw error;
    throw new KitError('KIT_IO', String(error));
  }
  return paths.sort().map(path => ({ path, hash: hashKitBytes(readKitFile(root, path)) }));
}
