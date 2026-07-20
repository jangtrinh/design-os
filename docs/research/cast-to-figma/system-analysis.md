# System Analysis

## System Statements

**Cast** turns CLI tool calls and designer edit pauses into Figma canvas mutations plus
compact recalled context for an external agent, under the constraint that its community
plugin stays open.

**ease-design figma-agent** turns typed CLI commands, HTML, and component change events
into idiomatic Figma nodes and deterministic on-disk design-system reconciliation, under
the constraint that the plugin is an optional non-deterministic hand while `ui` remains
network-free and deterministic.

## Boundaries and Value

### Cast

- observed — the public package contains a Node CLI, an HTTP/WebSocket bridge, a cowork
  polling command, and an agent skill. The Figma plugin implementation is external.
- documented — its narrow value is ambient collaboration: observe human edits, recall
  traits/corrections, and let an agent resume after an idle pause.
- observed — side effects include Figma edits, temp screenshot/JSON artifacts, file-local
  skill/memory updates through plugin tools, and optional GitHub update checks.

### ease-design

- observed — the plugin source, CLI, broker, shared protocol, and tests are all in-repo:
  [`figma-agent/README.md`](../../../figma-agent/README.md).
- observed — the plugin is deliberately outside the deterministic `ui` package and uses
  the public Figma Plugin API.
- observed — its scope is broader: typed primitives, HTML conversion, variables/styles,
  DS scanning/audit, PNG export, live component-change capture, and mirror reconciliation.

## Data and State

### Cast

- documented — memory is file-local and hyperlink-shaped: nodes, events, traits,
  agent-touched nodes, and corrections:
  [README](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/README.md#L86-L104).
- observed — bridge state is process-local: pending requests, a maximum 100-event FIFO,
  active socket, and cowork flags:
  [bridge](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/bridge/cast-server.js#L18-L38).
- inferred (medium confidence) — durable memory resides in plugin-owned Figma shared data,
  but storage schema, pruning, migration, and correction detection cannot be inspected.

### ease-design

- observed — shared TypeScript types define protocol frames, errors, timeouts, chunking,
  and connection state:
  [`figma-agent/shared/protocol.ts`](../../../figma-agent/shared/protocol.ts).
- observed — component changes are coalesced and appended to
  `design/figma.changes.jsonl`; a cursor and deterministic `ui figma reconcile` own apply.
- observed — full mirrored node specs live in sidecars referenced by registry records,
  keeping the registry lean and the file contract runtime-neutral.

## Execution

### Cast critical path

`CLI → ensure fixed-port bridge → HTTP /exec → active WebSocket plugin → tool result →
artifact normalization → CLI output/recall`

Cowork:

`CLI starts cowork → plugin observes pause → bridge queues event → CLI polls /events →
prints DS/memory/corrections/inspect targets → external agent decides next action`

- observed — request correlation uses numeric IDs and a 30-second timeout:
  [bridge](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/bridge/cast-server.js#L89-L117).
- observed — cowork polls every 500ms by default and returns one cycle.
- inferred — the event queue can lose old events beyond 100 and is consumed wholesale by
  whichever polling client reads first.

### ease-design critical path

`CLI → discovered broker → routed plugin → typed request → main-thread executor → typed
reply`, with chunked payloads and command-specific timeouts.

HTML import:

`HTML in hidden UI renderer → FigmaExportPayload → styles/variables → node tree → token
bindings → placement/selection`.

Live sync:

`documentchange → component filter/coalesce → append-only log → idle prompt →
deterministic reconcile/apply → registry + sidecars`.
