# Browser QA — 2026-07-19

## Executed

- 12 desktop views: D01–D03 × raw, enhanced, qualified, art-directed.
- 3 mobile art-directed views at 390 × 844.
- Visual inspection at desktop and mobile.
- D02 custom listbox open, keyboard navigation, selection, and close.
- Broken-image, horizontal-overflow, section, heading, and Phosphor-hook checks.

## Result

- 12/12 desktop views rendered.
- 3/3 mobile views rendered without horizontal overflow.
- 0 broken production images across the matrix.
- All rendered cases expose Phosphor icon hooks; no text arrow glyph is used in UI source.
- Custom selection works by pointer and keyboard.
- Scroll reveal, ambient motion, hover response, and reduced-motion fallback are present.

## Important limit

This is maker QA, not a blind quality verdict. It proves implementation integrity and
delivery-floor behavior. It does not prove that art direction caused a higher ceiling.
Promotion remains blocked until a randomized evaluator scores the four variants without
seeing workflow labels.
