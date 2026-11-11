/**
 * `screen-pages` (FR-009): the scan carries frames on more than one page. A multi-select question: which pages'
 * frames count as existing screens. The evidence per page is the frame count and how many of those frames are built
 * from library instances; the recommended set is the pages that hold at least one instance-built frame. A single page
 * raises nothing. The member is the page id.
 */
import type { KindDetection, KindEmitter } from "./kind-emitter.js";
import { setValuedOptions } from "./set-valued-options.js";

export interface ScreenPagesInput {
  pages: { id: string; name: string; frames: number; instanceBuilt: number }[];
}

function detect(raw: unknown): KindDetection | null {
  const input = raw as ScreenPagesInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.pages)) return null;
  const by = new Map(input.pages.map((p) => [p.id, p]));
  const frames = (id: string): number => by.get(id)?.frames ?? 0;
  const built = (id: string): number => by.get(id)?.instanceBuilt ?? 0;
  const nameOf = (id: string): string => by.get(id)?.name ?? id;
  const ids = input.pages.map((p) => p.id);
  const recommended = ids.filter((id) => built(id) > 0);
  return {
    kind: "screen-pages",
    members: input.pages.length > 1 ? ids : [],
    domain: ids,
    ask(members) {
      const list = members.map((m) => `${nameOf(m)} (${frames(m)} frames, ${built(m)} built from instances)`).join(", ");
      return {
        question: `Frames sit on ${members.length} pages: ${list}. Which pages' frames are existing screens?`,
        options: setValuedOptions({
          members,
          recommended,
          weight: frames,
          describe(group, role) {
            const f = group.reduce((n, m) => n + frames(m), 0);
            const b = group.reduce((n, m) => n + built(m), 0);
            const label = role === "recommended" ? `Keep the ${group.length} page(s) with instance-built frames` : role === "single" ? `Keep ${nameOf(group[0] ?? "")}` : `Keep the other ${group.length} pages`;
            return { label, consequence: `${f} frames kept, ${b} built from instances` };
          },
        }),
        labels: Object.fromEntries(members.map((m) => [m, nameOf(m)])),
      };
    },
  };
}

export const screenPagesEmitter: KindEmitter = { kind: "screen-pages", detect };
