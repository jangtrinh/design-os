# Contract: `ui diagram lint`

## Invocation

```text
ui diagram lint <diagram.html> [--json]
```

## Success Envelope

```json
{
  "ok": true,
  "command": "diagram lint",
  "data": {
    "file": "diagram.html",
    "findings": [],
    "errorCount": 0,
    "warningCount": 0
  }
}
```

Exit `0` when error count is zero; exit `1` for error findings or file/user errors. Unknown flags follow the shared CLI error contract.

## V1 Owned Checks

- missing diagram SVG or multiple ambiguous owned diagram roots;
- missing/non-resolving/non-unique accessible-name IDs, empty title/description, unresolved template placeholders;
- embedded scripts or external runtime asset URLs in the self-contained artifact;
- missing/unknown grammar and missing reading-order/focal declarations;
- focal identifier that does not resolve;
- product-flow elements missing source identifiers;
- exact duplicate connector geometry or exact shared attachment points where safely detectable;
- diagonal off-axis `<line>` connectors;
- explicit upstream skin/font residue named in the contract fixture set.

Generic accessibility, layout, contrast, taste, and rendered quality remain owned by their existing commands and host critique.
