/**
 * Derives a recommended `copyLanguage` from the script of `rawRequest`.
 * Only letters that are distinctively Vietnamese count (ă đ ơ ư and the stacked
 * tone-mark block U+1EA0–U+1EF9), so French or Spanish accents never read as `vi`.
 */
import type { COPY_LANGUAGES } from "./brief-validate.js";

export type CopyLanguage = (typeof COPY_LANGUAGES)[number];

const VI_LETTER = /[ăđơưẠ-ỹ]/i;
/** Share of words carrying a Vietnamese letter at or above which the source reads as Vietnamese. */
const VI_SHARE = 0.25;

export function deriveCopyLanguage(rawRequest: string): { language: CopyLanguage; reason: string } {
  const words = rawRequest.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const vi = words.filter((w) => VI_LETTER.test(w)).length;
  const share = words.length === 0 ? 0 : vi / words.length;
  const language: CopyLanguage = vi === 0 ? "en" : share >= VI_SHARE ? "vi" : "mixed";
  return { language, reason: `rawRequest script: ${vi} of ${words.length} words carry Vietnamese letters` };
}
