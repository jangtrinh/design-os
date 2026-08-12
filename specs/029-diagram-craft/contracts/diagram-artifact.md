# Contract: Diagram Artifact

The workflow writes one offline-openable HTML file with one owned inline SVG diagram. Metadata may use documented `data-*` attributes or an inert JSON block, but no executable script.

Required declarations:

- grammar;
- reading order;
- focal element ID;
- source kind and optional source reference;
- accessible SVG title and description;
- product-flow source IDs and fidelity-ledger reference/content.

Project tokens are consumed during authoring and expressed as resolved CSS custom properties or values in the artifact. No upstream palette/font sentinel may remain. A fallback visual system must be explicitly declared.

The artifact is a derived presentation. It never becomes semantic authority over `flow.json`.
