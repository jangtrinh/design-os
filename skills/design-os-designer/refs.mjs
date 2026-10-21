// refs.mjs — find every resource reference in an HTML or CSS text, the same way for build.mjs (what to copy)
// and validate.mjs (what is remote, what is missing). Whole-document scan: multi-line tags, unquoted values,
// comments ignored, `data-*` attributes never mistaken for `src`/`href`. Offline, built-ins only.
import { dirname, resolve } from "node:path";

/** A reference: { ref (as written), line, tag (label for messages), fetches (the browser would load it) }. */
const NAVIGATION_RELS = new Set(["canonical", "alternate", "author", "license", "next", "prev", "help", "search", "bookmark", "tag", "me", "pingback"]);
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);
const ATTRIBUTE = /\s*([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

export const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/** Blank out HTML comments, keeping newlines so line numbers survive. */
export function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment.replace(/[^\n]/g, " "));
}

export function isRemote(ref) {
  return /^(?:https?:|wss?:|ftp:)?\/\//i.test(ref.trim());
}

/** The decoded local path a reference points at, or null when it is not a local file reference. */
export function localTarget(ref) {
  const value = ref.trim().split(/[?#]/)[0];
  if (value === "" || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(value)) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Absolute path of a local reference made from the file at `fromAbs`, or null. */
export function resolveLocal(fromAbs, ref) {
  const target = localTarget(ref);
  return target === null ? null : resolve(dirname(fromAbs), target);
}

export function cssReferences(css, fullText = css, offset = 0) {
  const found = [];
  const imports = [];
  for (const m of css.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s;"')]+))/gi)) {
    imports.push([m.index, m.index + m[0].length]);
    found.push({ ref: m[1] ?? m[2] ?? m[3], line: lineAt(fullText, offset + m.index), tag: "css @import", fetches: true });
  }
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s][^)]*?))\s*\)/gi)) {
    if (imports.some(([from, to]) => m.index >= from && m.index < to)) continue;
    found.push({ ref: m[1] ?? m[2] ?? m[3], line: lineAt(fullText, offset + m.index), tag: "css url()", fetches: true });
  }
  return found;
}

function attributeMap(source, start) {
  const attrs = new Map();
  let pos = start;
  while (pos < source.length) {
    while (source[pos] === "/" || /\s/.test(source[pos] ?? "")) pos++;
    if (source[pos] === ">" || source[pos] === undefined || source[pos] === "<") break;
    ATTRIBUTE.lastIndex = pos;
    const m = ATTRIBUTE.exec(source);
    if (m === null) break;
    const name = m[1].toLowerCase();
    if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? m[4] ?? "");
    pos = ATTRIBUTE.lastIndex;
  }
  return { attrs, end: pos };
}

function candidates(tag, attrs) {
  const out = [];
  const add = (ref, fetches, label = tag) => { if (ref !== undefined && ref.trim() !== "") out.push({ ref: ref.trim(), tag: label, fetches }); };
  const srcset = (value, label) => String(value).split(",").forEach((c) => add(c.trim().split(/\s+/)[0], true, label));
  if (tag === "link") {
    const rels = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const navigationOnly = rels.length > 0 && rels.every((r) => NAVIGATION_RELS.has(r));
    add(attrs.get("href"), !navigationOnly);
    if (attrs.has("imagesrcset")) srcset(attrs.get("imagesrcset"), "link srcset");
  } else if (["script", "img", "source", "video", "audio", "iframe", "embed", "track", "input", "frame"].includes(tag)) {
    add(attrs.get("src"), true);
    if (attrs.has("srcset")) srcset(attrs.get("srcset"), `${tag} srcset`);
    if (tag === "video") add(attrs.get("poster"), true, "video poster");
  } else if (tag === "object") add(attrs.get("data"), true);
  else if (tag === "image" || tag === "use") add(attrs.get("href") ?? attrs.get("xlink:href"), true);
  else if (tag === "a" || tag === "area") add(attrs.get("href"), false);
  return out;
}

/** Every reference in an HTML document, including <style> blocks and style="" attributes. */
export function htmlReferences(html) {
  const text = stripHtmlComments(html);
  const found = [];
  const tagStart = /<([a-zA-Z][\w:-]*)/g;
  let m;
  while ((m = tagStart.exec(text)) !== null) {
    const tag = m[1].toLowerCase();
    const { attrs, end } = attributeMap(text, m.index + m[0].length);
    const line = lineAt(text, m.index);
    for (const c of candidates(tag, attrs)) found.push({ ...c, line });
    if (attrs.has("style")) found.push(...cssReferences(attrs.get("style"), text, m.index));
    tagStart.lastIndex = Math.max(end, tagStart.lastIndex);
    if (RAW_TEXT_TAGS.has(tag)) {
      const close = text.toLowerCase().indexOf(`</${tag}`, end);
      const bodyEnd = close < 0 ? text.length : close;
      if (tag === "style") found.push(...cssReferences(text.slice(end + 1, bodyEnd), text, end + 1));
      tagStart.lastIndex = bodyEnd;
    }
  }
  return found;
}

/** References in a file by kind: HTML, CSS, or none for other assets. */
export function referencesIn(path, text) {
  if (/\.html?$/i.test(path)) return htmlReferences(text);
  if (/\.css$/i.test(path)) return cssReferences(stripBom(text));
  return [];
}

export const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
