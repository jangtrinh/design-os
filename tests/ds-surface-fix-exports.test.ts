/**
 * Every export is read or counted, and nothing is read that is not an export (review fix round, section D): an exported
 * upper-case binding that is not read as a component is listed under `unread` with its file and a reason; strings and
 * template literals are blanked before the export patterns run; a `.js` file with JSX is read like a `.jsx` file.
 */
import { describe, expect, it } from "vitest";
import { readComponentExports } from "../src/core/ds-surface/source-export-reader.js";
import { envelope, pkg, projectFrom, surface } from "./ds-surface-helpers.js";

const names = (file: string, src: string): string[] => readComponentExports(file, src).components.map((c) => c.name);
const unread = (file: string, src: string): { name: string; reason: string }[] => readComponentExports(file, src).unread.map(({ name, reason }) => ({ name, reason }));
const JSX = "<div className=\"x\" />";

describe("an exported upper-case binding that is not read is listed with a reason", () => {
  it("the barrel form: a binding not declared in this file", () => {
    expect(unread("x/A.tsx", `export { Missing };\n`)).toEqual([{ name: "Missing", reason: "the exported binding is not declared in this file" }]);
  });
  it("an all-caps name", () => {
    const u = unread("x/A.tsx", `export const UI = () => ${JSX};\nexport function H1() { return ${JSX}; }\n`);
    expect(u.map((x) => x.name)).toEqual(["UI", "H1"]);
    expect(u[0]!.reason).toContain("no lower-case letter");
  });
  it("the second declarator of one const statement", () => {
    const src = `export const Left = () => ${JSX}, Right = () => ${JSX};\n`;
    expect(names("x/A.tsx", src)).toEqual(["Left"]);
    expect(unread("x/A.tsx", src)).toEqual([{ name: "Right", reason: "the second declarator of one const statement is not read: give it its own export statement" }]);
  });
  it("the second declarator on a later line", () => {
    const src = `export const Left = () => ${JSX},\n  Right = () => ${JSX};\n`;
    expect(unread("x/A.tsx", src).map((x) => x.name)).toEqual(["Right"]);
  });
  it("an object holding markup is not a component", () => {
    const src = `export const Icons = {\n  a: <svg />,\n  b: <svg />,\n};\n`;
    expect(names("x/A.tsx", src)).toEqual([]);
    expect(unread("x/A.tsx", src)).toEqual([{ name: "Icons", reason: "an object or array holding markup is not read as a component" }]);
  });
  it("a lower-case export is not a component and is not listed (it is not an upper-case binding)", () => {
    expect(unread("x/A.tsx", `export const helper = () => ${JSX};\n`)).toEqual([]);
  });
});

describe("strings and template literals are blanked before the export patterns run", () => {
  it("an `export function` inside a template literal is not a component", () => {
    const src = "export const Real = () => <div />;\nconst doc = `\nexport function Ghost() { return <i />; }\n`;\n";
    expect(names("x/A.tsx", src)).toEqual(["Real"]);
  });
  it("an `export` inside a one-line string is not a component, and JSX text with an apostrophe does not hide the exports after it", () => {
    const src = "const s = 'export const Ghost = () => <i />';\nexport const A = () => <p>Don't</p>;\nexport const Bb = () => <p>It's</p>;\n";
    expect(names("x/A.tsx", src)).toEqual(["Bb"]); // `A` has no lower-case letter: it is listed as unread below
    expect(unread("x/A.tsx", src).map((x) => x.name)).toEqual(["A"]);
  });
});

describe("the shapes that were right stay right", () => {
  const cases: [string, string, string[]][] = [
    ["default export", `export default function Card() { return ${JSX}; }\n`, ["Card"]],
    ["default export of a declared binding", `const Card = () => ${JSX};\nexport default Card;\n`, ["Card"]],
    ["export { X }", `const Card = () => ${JSX};\nexport { Card };\n`, ["Card"]],
    ["export { X as Y }", `const Card = () => ${JSX};\nexport { Card as Panel };\n`, ["Panel"]],
    ["several per file", `export const Aa = () => ${JSX};\nexport const Bb = () => ${JSX};\n`, ["Aa", "Bb"]],
    ["forwardRef", `export const Fr = forwardRef((p, r) => ${JSX});\n`, ["Fr"]],
    ["memo", `export const Mm = memo(() => ${JSX});\n`, ["Mm"]],
    ["class", `export class Cc extends Component { render() { return ${JSX}; } }\n`, ["Cc"]],
    ["styled", "export const Sd = styled.div`\n  color: red;\n`;\nexport const Se = () => <i />;\n", ["Se"]],
  ];
  for (const [label, src, expected] of cases) it(label, () => expect(names("x/A.tsx", src), label).toEqual(expected));
  it("a .jsx file and a .vue file are read, a barrel is a re-export", () => {
    expect(names("x/A.jsx", `export const Jj = () => ${JSX};\n`)).toEqual(["Jj"]);
    expect(names("x/Panel.vue", "<template><div/></template>\n")).toEqual(["Panel"]);
    expect(readComponentExports("x/index.ts", `export * from "./a";\n`).reExports).toHaveLength(1);
  });
});

describe("a .js file with JSX is read the way a .jsx file is read", () => {
  it("the reader returns its component", () => {
    expect(names("x/JsComp.js", `export const JsComp = () => ${JSX};\n`)).toEqual(["JsComp"]);
  });
  it("the surface lists it from a component directory", () => {
    const p = projectFrom({
      "package.json": pkg({ react: "18" }),
      "src/components/A.tsx": `export const Aaa = () => ${JSX};\n`, "src/components/B.tsx": `export const Bbb = () => ${JSX};\n`, "src/components/C.tsx": `export const Ccc = () => ${JSX};\n`,
      "src/components/JsComp.js": `export const JsComp = () => ${JSX};\n`,
    });
    expect(envelope(surface(p).out).data!["components"].map((c: { name: string }) => c.name)).toContain("JsComp");
  });
});
