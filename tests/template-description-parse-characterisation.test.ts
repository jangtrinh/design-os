/**
 * Characterisation of the frontmatter `description:` grammar: quoted values,
 * missing description → null. The parse lives in the catalogue emitter.
 */
import { describe, expect, it } from "vitest";
import { parseTemplateDescription } from "../src/core/template-catalogue-parse.js";

const fm = (body: string) => `---\n${body}\n---\n\n# T\n`;

describe("template frontmatter description grammar", () => {
  it("returns null without frontmatter", () => {
    expect(parseTemplateDescription("# No frontmatter here\n\nBody.\n")).toBeNull();
  });
  it("returns null for an unterminated frontmatter block", () => {
    expect(parseTemplateDescription("---\ndescription: x\n")).toBeNull();
  });
  it("returns null when frontmatter has no description", () => {
    expect(parseTemplateDescription(fm("name: a"))).toBeNull();
  });
  it("returns null for an empty or empty-quoted description", () => {
    expect(parseTemplateDescription(fm('description: ""'))).toBeNull();
    expect(parseTemplateDescription(fm("description: ''"))).toBeNull();
  });
  it("strips surrounding double quotes and unescapes \\\"", () => {
    expect(parseTemplateDescription(fm('description: "Quoted text. Use when testing."'))).toBe("Quoted text. Use when testing.");
    expect(parseTemplateDescription(fm('description: "say \\"hi\\""'))).toBe('say "hi"');
  });
  it("strips surrounding single quotes", () => {
    expect(parseTemplateDescription(fm("description: 'Single. Use when x.'"))).toBe("Single. Use when x.");
  });
  it("keeps an unquoted value verbatim and ignores a description in the body", () => {
    expect(parseTemplateDescription(fm("name: a\ndescription: Plain words. Use when y."))).toBe("Plain words. Use when y.");
    expect(parseTemplateDescription("---\nname: a\n---\ndescription: in body\n")).toBeNull();
  });
});
