# World-class benchmark

Historical controlled views:

```text
?case=d01|d02|d03&variant=raw|enhanced|qualified|art-directed
```

Serve this directory over HTTP. The benchmark toolbar is excluded from scoring and exists only to
switch preserved views. Visual section boards live under `assets/boards`; they are evidence and are
not used as production page assets.

Local URL: `http://localhost:4177/`

```sh
python3 -m http.server 4177
node --test tests/benchmark.test.mjs
```

Evidence is recorded in `evidence/browser-qa-2026-07-19.md`. Current results are
maker-preview only; a randomized blind evaluator is still required before learning
promotion.

The prompt-orchestration development extension lives in `evidence/prompt-plans/` and
`orchestration-development-results.md`. It preserves content-led and golden contracts for D01-D03
without claiming blind visual wins. Default rollout remains blocked until the ten-case gate.
