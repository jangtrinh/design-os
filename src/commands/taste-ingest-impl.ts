/**
 * `ui taste ingest` — scan taste/inbox/<genre>/ (+ optional --dir sources),
 * dedup by exact sha256 and PNG dHash (near-dup, warn-only), then move
 * (inbox) or copy (--dir) originals into corpus/<genre>/ and append items.jsonl.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, copyFileSync } from "node:fs";
import { extname, join } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import {
  resolveTasteRoot, loadItems, appendItem, inboxDir, corpusDir, TasteLedgerError,
} from "../core/taste-store.js";
import type { TasteItem } from "../core/taste-store.js";
import { dhashPng, hamming } from "../core/taste-dhash.js";

const CMD = "taste ingest";
const IMG_RE = /\.(png|jpe?g)$/i;
const NEAR_DUP_HAMMING = 6;

interface Source { path: string; genre: string; moveNotCopy: boolean }

/** *.png|jpg direct children of dir, sorted by name (missing dir → empty). */
function listImages(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile() && IMG_RE.test(f.name)).map((f) => f.name).sort();
}

/** inbox/<genre>/ subfolders (sorted) each contributing their own sorted files. */
function inboxSources(root: string): Source[] {
  const base = inboxDir(root);
  if (!existsSync(base)) return [];
  const genres = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  return genres.flatMap((genre) => {
    const dir = join(base, genre);
    return listImages(dir).map((f): Source => ({ path: join(dir, f), genre, moveNotCopy: true }));
  });
}

/** Extra directories passed via --dir (comma-separated), all tagged with one --genre. */
function extraSources(dirFlag: string, genre: string): Source[] {
  return dirFlag.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
    .flatMap((d) => listImages(d).map((f): Source => ({ path: join(d, f), genre, moveNotCopy: false })));
}

export function runTasteIngest(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const dirFlag = parsed.flags["dir"];
  const genreFlag = parsed.flags["genre"];
  if (dirFlag === true) return err("E_TASTE_BAD_FLAGS", "--dir requires a path value");
  const hasDir = typeof dirFlag === "string" && dirFlag.trim() !== "";
  if (hasDir && typeof genreFlag !== "string") {
    return err("E_TASTE_BAD_FLAGS", "--dir requires --genre (the tag applied to every file it contributes)");
  }

  const root = resolveTasteRoot(parsed);
  if (typeof root !== "string") return err("E_TASTE_BAD_FLAGS", root.err);

  let items: TasteItem[];
  try {
    items = loadItems(root);
  } catch (e) {
    if (e instanceof TasteLedgerError) return err("E_TASTE_LEDGER", e.message);
    throw e;
  }

  const sources = [
    ...inboxSources(root),
    ...(hasDir && typeof dirFlag === "string" && typeof genreFlag === "string" ? extraSources(dirFlag, genreFlag) : []),
  ];

  const sourceUrl = typeof parsed.flags["source-url"] === "string" ? parsed.flags["source-url"] : undefined;
  const addedAt = new Date().toISOString();
  const knownSha = new Set(items.map((it) => it.sha256));
  const byGenreDhash = new Map<string, { id: string; dhash: string }[]>();
  for (const it of items) {
    if (it.dhash === undefined) continue;
    const arr = byGenreDhash.get(it.genre);
    if (arr) arr.push({ id: it.id, dhash: it.dhash }); else byGenreDhash.set(it.genre, [{ id: it.id, dhash: it.dhash }]);
  }

  let added = 0, skippedDup = 0;
  const warnings: string[] = [];
  const addedItems: { id: string; genre: string; file: string }[] = [];

  for (const src of sources) {
    const buf = readFileSync(src.path);
    const sha256 = createHash("sha256").update(buf).digest("hex");
    if (knownSha.has(sha256)) { skippedDup++; continue; }

    const id = sha256.slice(0, 12);
    const ext = extname(src.path).slice(1).toLowerCase();
    const dhash = ext === "png" ? dhashPng(buf) : undefined;
    if (dhash !== undefined) {
      for (const other of byGenreDhash.get(src.genre) ?? []) {
        if (hamming(dhash, other.dhash) <= NEAR_DUP_HAMMING) warnings.push(`near-dup of ${other.id}`);
      }
    }

    const destDir = corpusDir(root, src.genre);
    mkdirSync(destDir, { recursive: true });
    const file = `corpus/${src.genre}/${id}.${ext}`;
    if (src.moveNotCopy) renameSync(src.path, join(destDir, `${id}.${ext}`));
    else copyFileSync(src.path, join(destDir, `${id}.${ext}`));

    const item: TasteItem = { v: 1, id, sha256, file, genre: src.genre, addedAt };
    if (dhash !== undefined) item.dhash = dhash;
    if (sourceUrl !== undefined) item.sourceUrl = sourceUrl;
    appendItem(root, item);

    items.push(item);
    knownSha.add(sha256);
    if (dhash !== undefined) {
      const arr = byGenreDhash.get(src.genre);
      if (arr) arr.push({ id, dhash }); else byGenreDhash.set(src.genre, [{ id, dhash }]);
    }
    added++;
    addedItems.push({ id, genre: src.genre, file });
  }

  if (useJson) return okJson(CMD, { added, skippedDup, warnings, items: addedItems });
  return ok(addedItems.map((i) => `${i.id}  ${i.genre}  ${i.file}`).join("\n") + (addedItems.length > 0 ? "\n" : ""));
}
