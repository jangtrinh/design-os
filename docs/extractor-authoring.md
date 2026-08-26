# Writing an extractor

An extractor turns one language's source into **DesignFacts**. The 36 `tell`
rules already exist and are language-independent; adding a platform means adding
an extractor, and **editing no rule**.

SwiftUI and Flutter are each ~150 lines plus two fixtures. That is the bar.

## The contract

1. **Register a profile** in `src/core/design-facts/extractor-registry.ts`:
   an id, the extensions it claims, a tier label, whether it is an `undercount`,
   and — per fact kind — the strongest confidence it can reach.
2. **Emit into a `FactCollector`** built from that profile. The collector refuses
   an undeclared kind, a foreign extractor id, or a confidence stronger than
   declared. Those are thrown, not warned: a wrong fact is worse than an absent one.
3. **Never guess.** A value behind a variable, a theme lookup or a ternary is
   *unresolvable*. Call `noteUnresolved()` with a NAMED reason and emit nothing.
   "12 theme lookups" is actionable; "12 unresolved" is not; a plausible invented
   hex is a finding about a page that does not exist.
4. **Declare only what you can see.** A line scanner cannot read view nesting, so
   it declares no `structure` — and every nesting rule is reported NOT-EVALUATED
   instead of quietly passing. Under-declaring is honest; over-declaring is a
   silent false green.

## Confidence

| Tier | Meaning |
|---|---|
| `rendered` | read off a real rendered page |
| `resolved` | computed through a real cascade or AST — the value that WILL render |
| `literal` | a literal in source, surrounding context unresolved (line scanners) |
| `heuristic` | inferred from a name or shape (`.card` implies a card role) |

## Platform defaults belong in the extractor

Flutter's default font **is** Roboto, so a `TextStyle` with no `fontFamily`
emits Roboto once per file and `overused-font` fires — correctly. SwiftUI's
default is SF, a *system* face, which is not a badly-made choice, so nothing is
emitted and the rule stays silent.

That asymmetry lives in the extractor that knows the platform. A rule that had to
know which platform it was judging would not be language-independent any more.

## Owner identity, not line numbers

A resolved cascade stamps each fact with its element's `nodeRef`, so identity is
exact. A scanner has no such handle: SwiftUI and Flutter spell one view as a
chain of modifiers on consecutive lines.

`sameOwner()` in `tell-rules.ts` is what rules use: exact when both facts name a
node, a tight line window otherwise. Matching on line equality made `side-tab`
and `pulsing-dot` dead rules on every native file — a cascade assumption leaking
into a rule that must not have one.

## Use the shared base

`src/core/extractors/scanner/line-scanner.ts` provides `stripNoise` (blanks
comments and string bodies, preserving offsets), `lineIndex`, `scan`, `num`,
`hex6` and `unitRgbToHex`. One implementation, not one per language: a second
copy is how two extractors drift apart on the same bug.

Read from the STRIPPED copy so a commented-out modifier never counts; read font
names and text content from the RAW source, since stripping blanks string bodies.

## Fixtures

Two, minimum, and both are required:

- `tell-<platform>-slop.<ext>` — carries the tells, and the test names which ids
  must fire;
- `tell-<platform>-clean.<ext>` — carries none, and the test asserts zero.

A rule that only ever fires has not been shown to discriminate. Add a third
fixture for any platform-specific asymmetry — `tell-flutter-no-family.dart`
exists solely to pin the Roboto default.

## Regex traps paid for already

- `[^)]{0,120}` closes on the first `)` — so a nested `Color(0xFF7C3AED)` hides
  the `width:` after it and the rule looks implemented while never firing. Use
  `[\s\S]{0,120}?` and bound it.
- A trailing `-->` or `*/` parses as a `--` separator. Strip the comment tail
  before matching, then anchor.
- Test every break, not a sample. Five of eight probes on the `tell` family came
  back green the first time; each was "obviously" covered by a nearby assertion
  that tested something else.
