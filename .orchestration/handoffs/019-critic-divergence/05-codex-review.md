VERDICT: BLOCKER

<!-- Codex (gpt-5.6-sol) via `codex exec --sandbox read-only`, 2026-07-25.
     Review range: git diff 0a56699..11c6d5f. Output below is VERBATIM and unedited. -->

1. **BLOCKER** · **specs/019-model-routing-benchmark/panel-2-RUN-PLAN.md:3** · The claimed preregistration is not auditable. The plan, all candidates, amendment, result, and secret map first entered Git in the same commit. Moreover, the plan's filesystem modification time is after the imagery-suppressed candidates existed. That is compatible with appending Amendment A1, but there is no immutable pre-candidate revision or hash proving that lines 61–74 existed unchanged beforehand. For an evidence record, the statement "preregistered before any candidate existed" therefore exceeds the preserved evidence.

2. **MEDIUM** · **specs/019-model-routing-benchmark/benchmark-result.md:106** · "What replicated: A5 first on both briefs" is a post-hoc interpretation not preregistered by the plan. The plan only pre-committed that a one-brief A1/A5 difference would be noise; it did not define a two-brief A5 lead as replication or evidence. The record correctly labels it directional and does not make it a routing rule, but "replicated" gives the favorable secondary result more epistemic weight than the preregistration supports.

3. **MEDIUM** · **specs/019-model-routing-benchmark/panel-2/secret-map.json:1** · Blinding depended only on the judge obeying "DO NOT OPEN." The arm map sat beside the served viewer and had no access control or sealed custody; depending on the static-server root, it could also have been requested directly. The served candidate paths and visible pages use neutral labels, and the leak scan found no model/arm tokens, so there is no demonstrated leak—but the record cannot claim strong blinding integrity, only procedural blinding.

4. **LOW** · **specs/019-model-routing-benchmark/benchmark-result.md:112** · The warning comparison undercounts A5 Cadence. Its qualification record contains eight `taste-lint` warnings plus one `validate-layout` warning. "A5 shipped 8 advisory warnings" is accurate only if explicitly scoped to `taste-lint`; "all advisory warnings" would total nine. Ledger event e18 repeats the ambiguity.

5. **INFO** · **specs/019-model-routing-benchmark/benchmark-result.md:99** · Correctness/logic review: the primary outcome is internally classified correctly. A0 was last on Cadence but middle on Haven, which falls squarely under the preregistered "split or A0 mid → unresolved" case. The reviewed prose and e18 explicitly reject a DESIGN:OS-versus-bare win. Amendment A1 is also honestly assigned to the orchestrator's constraint rather than a missing DESIGN:OS rule.

6. **INFO** · **git diff 0a56699..11c6d5f** · Scope verification passed: no `knowledge/`, workflow template, CLI/source, schema, taste-profile, routing-default, or deterministic-threshold file changed. The diff is confined to the evidence/handoff, ledger and generated graph, panel machinery, and benchmark builds.

7. **INFO** · **specs/019-model-routing-benchmark/benchmark-result.md:130** · The stated limits are adequate for the explicitly directional and unresolved claims. They would not support a routing rule, durable winner, or generalized judge advantage. The record consistently disclaims those stronger conclusions, apart from the overstated word "replicated" noted above.

8. **MEDIUM** · **specs/019-model-routing-benchmark/panel-2/make-panel.mjs:126** · OWASP Top-10 checklist: A01 access control—secret map not protected; A02 cryptographic failures—not applicable; A03 injection—no observed exploit, but generated candidates run in same-origin unsandboxed iframes; A04 insecure design—procedural-only blinding is the principal weakness; A05 misconfiguration—server-root isolation is unspecified; A06 vulnerable components—no added dependencies; A07 authentication failures—not applicable; A08 integrity failures—candidate code is copied and leak-scanned but not hashed or sandboxed; A09 logging/monitoring—no tamper-evident vote/map access log; A10 SSRF—no network-fetch path found. No credential or remote-resource exposure was found in the reviewed artifacts.

---

## Opus reconciliation

**Route note.** `domain: complicated` does not fire Stage 6, so per ORCHESTRATION.md
§ "Settlement without Stage 6" **Opus is the settler** here. (An earlier line in HANDOFF.md
asserted Fable holds the last word; that was wrong for this domain and is corrected below.)

### 1. BLOCKER — preregistration not auditable — **CONFIRMED REAL**

Codex is right, and the finding is sharper than it looks. The plan *was* authored before any
builder was spawned — but the repository cannot prove it, and on an evidence record whose entire
methodology rests on preregistration, "trust the author" is precisely the thing preregistration
exists to eliminate. The claim as written exceeds the preserved evidence.

The mtime observation is also correct and has an innocent cause (Amendment A1 was appended on
2026-07-25 per the plan's own no-edit rule), but an innocent cause is not an audit trail.

**This cannot be repaired retroactively** — no rebuild creates a commit that did not happen. The
remedy is therefore to correct the *claim*, not the artifact:
- weaken "preregistered before any candidate existed" to what the evidence supports, and
- record the process rule that prevents recurrence: **commit the preregistration in its own commit
  before generating the first candidate.** A plan that is not committed first is not preregistered
  in any auditable sense.

Loop Rule note: a confirmed BLOCKER routes to Stage 3, and the "build" for this task is the evidence
record itself — so amending the record IS the Stage-3 pass, not a candidate rebuild. Candidates are
untouched; their content was never in question.

### 2. MEDIUM — "replicated" overstates — **AGREED, FIXED**

Correct. The plan pre-committed only that a *one-brief* A1/A5 difference is noise; it never defined
a two-brief lead as replication. "Replicated" smuggles in weight the preregistration did not grant,
and it does so in the favourable direction — the exact bias preregistration guards against.
Rewritten to state the observation and explicitly note the plan did not pre-define a criterion for it.

### 3. MEDIUM — blinding is procedural only — **AGREED IN SUBSTANCE, ONE PART NARROWED**

Agreed that the record must claim *procedural* blinding, not strong blinding. The map's protection
was the owner not opening it, full stop.

Narrowing one clause on verified fact: the server was rooted at `panel-2/viewer/`, and
`secret-map.json` lives in `panel-2/` — its parent. `python3 -m http.server` does not serve above
its root, so the map was **not** reachable over the panel URL. Codex hedged this correctly
("depending on the static-server root"); the answer is that it was outside the root. This narrows
the exposure but does not change the conclusion, which stands.

### 4. LOW — warning count ambiguity — **AGREED, FIXED**

Correct: a5-cadence carried 8 `taste-lint` warnings **plus** 1 `validate-layout` warning
(`absolute-without-relative`) = 9 advisory total. The prose said "8 advisory warnings" while the
contrast being drawn was against A1's clean *machine floor* generally. Scoped explicitly to
taste-lint, with the ninth stated. Ledger `e18` carries the same ambiguity and gets a correction event.

### 5, 6, 7. INFO — **ACCEPTED**

Finding 6 is the one I most wanted independently verified: an outside model confirming from the diff
— not from the prose — that no `knowledge/`, schema, workflow, routing default, taste profile, or
deterministic threshold changed. That is the invariant the whole task was built to protect.

### 8. MEDIUM — OWASP — **RECORDED, NON-BLOCKING**

Accepted as accurate and correctly scoped. For a local, offline, single-judge research artifact
serving self-generated pages on `localhost`, A01/A04/A05/A08/A09 describe real properties but not
exploitable risk: there is no adversary, no network exposure, and no credential surface. Two are
worth carrying forward as cheap hardening if this harness is reused:
- add `sandbox="allow-scripts"` to the candidate iframes (A03/A08), and
- move `secret-map.json` outside the panel tree entirely, or hash-seal it (A01).

Neither is blocking; both are recorded in the run plan's Amendments.

### Settlement

Findings 2, 3, 4 fixed in the record. Finding 1 confirmed and unfixable retroactively — the claim is
corrected and the preventive rule recorded. No candidate is rebuilt; no verdict changes; the ranking
result and its UNRESOLVED primary classification are untouched and were independently endorsed
(finding 5).

**Post-fix status:** `VERDICT: CONCERNS-RESOLVED` (Opus, settler on a no-Stage-6 route).
The BLOCKER is discharged by claim-correction, and the recurrence rule is now written down.
