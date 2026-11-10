/**
 * Synthetic project for the `ui scan` nested-app and budget tests: a wide
 * directory with a neutral name next to an app root two levels down that uses
 * Tailwind v4 CSS-first. Generated at test time so no thousands of files are
 * committed; it reproduces a SHAPE (a normal user repository whose app is not
 * at the root and whose tree exhausts the entry cap), carries no project data.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
}

export const V4_CSS = '@import "tailwindcss";\n@theme {\n  --color-brand: #1a2b3c;\n}\n';

/**
 * Six wide first-level directories (`alpha` … `zeta`, 10 subdirectories x 100 files each, so the walk
 * exhausts the entry cap), an app at `apps/web` with its own Tailwind v4 CSS (named so it sorts before
 * the root entry), and plain files directly in the root next to the root's own v4 entry `styles.css`.
 */
export function manyDirectoriesProject(): string {
  const root = mkdtempSync(join(tmpdir(), "scan-many-"));
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "workspace-root", dependencies: { tailwindcss: "4.0.0" } }),
    "styles.css": V4_CSS,
    "notes.txt": "x\n",
    "changes.txt": "x\n",
    "apps/web/package.json": JSON.stringify({ name: "web", dependencies: { react: "19.0.0", tailwindcss: "4.0.0" } }),
    "apps/web/aaa.css": V4_CSS,
  };
  for (const dir of ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]) {
    for (let s = 0; s < 10; s++) {
      for (let f = 0; f < 100; f++) files[`${dir}/s${s}/f${String(f).padStart(3, "0")}.json`] = "{}";
    }
  }
  writeFiles(root, files);
  return root;
}

/**
 * `zdata/` holds `wideDirs` subdirectories of `filesPerDir` plain files each; the app
 * at `apps/web` sits two levels down. With 45 x 100 the walk exhausts the 4000-entry cap.
 */
export function wideAppProject(opts: { wideDirs: number; filesPerDir: number }): string {
  const root = mkdtempSync(join(tmpdir(), "scan-wide-"));
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "workspace-root" }),
    "apps/web/package.json": JSON.stringify({ name: "web", dependencies: { next: "15.0.0", tailwindcss: "4.0.0" } }),
    "apps/web/styles.css": V4_CSS,
    "apps/web/components/card.tsx": "export const Card = () => null;\n",
    "apps/web/components/button.tsx": "export const Button = () => null;\n",
    "apps/web/components/input.tsx": "export const Input = () => null;\n",
  };
  for (let d = 0; d < opts.wideDirs; d++) {
    for (let f = 0; f < opts.filesPerDir; f++) {
      files[`zdata/s${String(d).padStart(2, "0")}/f${String(f).padStart(3, "0")}.json`] = "{}";
    }
  }
  writeFiles(root, files);
  return root;
}
