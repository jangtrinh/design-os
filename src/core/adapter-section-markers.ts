/**
 * What a host file holds for one pair of section markers. A section is safe to replace only when the file holds none, or
 * exactly one start marker followed by exactly one end marker: any other shape (a start without an end, an end without
 * a start, the end before the start, more than one of either) would make a replace span text the kernel did not write.
 */
export type MarkerShape = "none" | "one" | "malformed";
export interface MarkerReport { shape: MarkerShape; begins: number; ends: number }

const count = (text: string, marker: string): number => (marker === "" ? 0 : text.split(marker).length - 1);

export function classifySectionMarkers(content: string, begin: string, end: string): MarkerReport {
  const begins = count(content, begin);
  const ends = count(content, end);
  if (begins === 0 && ends === 0) return { shape: "none", begins, ends };
  const ordered = begins === 1 && ends === 1 && content.indexOf(begin) < content.indexOf(end);
  return { shape: ordered ? "one" : "malformed", begins, ends };
}

/** The sentence both the writer and the agents command say: what was found, that nothing was written, the action. */
export function malformedSectionMessage(file: string, report: MarkerReport): string {
  return `${file} holds ${report.begins} start marker line(s) and ${report.ends} end marker line(s) of the section, so nothing was written; make them one start line followed by one end line, or remove them, then run the command again`;
}
