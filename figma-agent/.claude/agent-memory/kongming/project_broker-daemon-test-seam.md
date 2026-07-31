---
name: broker-daemon-test-seam
description: Daemon-harness ruling (concurrency wave closing round) resolved as core-extraction seam, not env-var test mode
metadata:
  type: project
---

Ruled 2026-07-31: to test broker-daemon.ts's dispatch closures, extract `startBrokerCore(deps)` (state + closures + onConnection, ZERO timers, injected `shutdown`) leaving `runBrokerDaemon` as the shell (ad-check/exit, port bind 9410-9419, writeAdvertisement, all 5 intervals, signal handlers). Core returns `tickWatchdog(now)`/`sweepParked(now)` handles; scenario tests pass a future `now` instead of waiting 125s or faking timers.

**Why:** hazards are RECURRING, not startup-only — ad-refresh interval rewrites `/tmp/figma-agent-broker.json` every 30s, idle/ad-takeover intervals call `process.exit`, 5 non-unref'd intervals leak into the vitest worker, and this is the dogfooded dev machine with a live broker session. An env-var test mode (option a) would need ~4 separate gates and still leave exits/timers in the tested path; BROKER_FILE's hardcodedness is the single-broker discovery invariant (deliberate, per "assume it is a decision").

**How to apply:** future broker-daemon test work should go through `startBrokerCore` + wire-protocol assertions (fake plugin must send real PLUGIN_HELLO with `instanceId` + `caps:['fileGuard']`, per the strict-mock scar). Existing repo knobs: `FIGMA_AGENT_CHANGES_DIR` ("tests MUST set it"), `envMs` timing knobs (broker-daemon.ts:49-57), `FIGMA_AGENT_IDLE_MS`. No override exists (on purpose) for BROKER_FILE or the port range.
