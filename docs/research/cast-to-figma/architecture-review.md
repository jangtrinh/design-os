# Architecture Review

## Trade-offs

| Quality | Cast | ease-design |
|---|---|---|
| Human collaboration | Strong: ambient pause cycle, corrections, local skill | Limited: activity/sync panel, explicit CLI workflows |
| Determinism | Weak/unknown plugin-side | Strong boundary: plugin captures; `ui` reconciles |
| Protocol rigor | Simple HTTP + WS, fixed v1 | Typed frames, version errors, chunking, timeouts |
| Multi-file routing | Last connected/activated socket | Registry + most-recent activity + file-name pin |
| Visual supervision | Explicit screenshot contract after every visual edit | PNG export exists; workflow enforcement is mostly knowledge |
| Extensibility | Many wrapped edits, procedural user tools, raw script | Typed commands, batch, raw exec-js, modular executors |
| Test evidence | Four small CLI tests; plugin tests unavailable | Broad CLI/plugin unit suite across transport and fidelity |

## Interfaces and Integration

### Valuable Cast seams

- observed — `inspect` combines structure and screenshot, then marks the artifact
  `required: true` with `VISUAL_CHECK_REQUIRED`:
  [CLI](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/bin/cast#L443-L487).
- documented — non-destructive commands resolve target as explicit node, current
  selection, then recently edited node; broad/destructive tools still require IDs:
  [README](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/README.md#L99-L104).
- documented — wrapped trait cloning preserves unspecified properties, a useful
  surgical-edit primitive.
- documented — user tools separate reusable, scoped procedures from ad-hoc raw scripts.

### Existing ease-design strengths

- observed — broker discovery uses a port range and advertisement rather than assuming a
  single fixed port.
- observed — chunk frames support payloads over 512 KiB.
- observed — application heartbeat detects half-open browser WebSockets, and reconnect
  uses exponential backoff with jitter.
- observed — multiple plugin instances remain connected; routing can be pinned by file.
- observed — `BATCH` executes typed operations sequentially and can stop on error.

## Security and Resilience

### Cast

- positive — defaults to `127.0.0.1`, correlates replies, times out requests, reports
  CLI/plugin protocol versions, and restricts `run-script` to a short reason label.
- risk — the HTTP bridge exposes `/exec` without authentication and accepts
  `Access-Control-Allow-Origin: null`:
  [bridge](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/bridge/cast-server.js#L145-L151).
- risk — `CAST_BRIDGE_HOST` can widen binding; no authorization or origin token is visible.
- risk — the six-word reason is audit labeling, not a capability restriction.
- risk — active-file routing is mutable and last-activation based.
- risk — bridge reads JSON bodies without a size limit; screenshot base64 is written to
  temp storage without visible lifecycle cleanup.

### ease-design

- positive — typed command allowlist, structured error codes, protocol mismatch handling,
  per-command timeouts, bounded plugin wait, heartbeat/reconnect, multi-file routing.
- positive — mirror capture is a transport artifact; deterministic disk writes happen in
  the `ui` command layer.
- risk — `EXEC_JS` remains a powerful code-execution escape hatch.
- risk — local WebSocket broker has no strong caller authentication.
- risk — `loadAllPagesAsync()` at plugin boot may become expensive on very large files.
- documented limitation — descendant deletion cannot be mapped to a removed parent
  component because Figma provides only reduced `RemovedNode` data.

## Provenance and License

- observed — public Cast CLI/bridge/skill code is MIT:
  [LICENSE](https://github.com/newfiction/cast-to-figma/blob/e38266008fd6b2a7901589f9443bff30b752591e/LICENSE#L1-L20).
- recommendation — adopt concepts by independent reimplementation. If code is copied,
  preserve the MIT copyright/permission notice.
- caveat — plugin source is absent from this repo, so do not infer that unpublished plugin
  code is available under the repository license.
