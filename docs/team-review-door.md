# Team review door

How a team puts a human approver in front of the design decisions an agent records.
The kernel stays deterministic; the door is a PR review on the project's `design/`
directory plus an `approved_by` trail on each ruling.

## Approval matrix

| Role | Owns | Signs off on |
|---|---|---|
| `PM` | spec and scope | rulings that change what a feature does or which screens it covers |
| `design-lead` | design quality | rulings about layout, components, tokens, motion, taste |
| `BA` | second taste rater | an independent read of the same rulings; a tie-breaker, not a veto |
| `owner` | interim final say | any ruling, while the team above is not yet staffed |
| `source` | provenance | a ruling whose approval is the cited source itself (a signed-off spec, a shipped decision) |

The `owner` role is interim: once a PM and a design lead exist, their sign-offs stand
without it. A ruling needs at least one approval from the role that owns its subject.

## CODEOWNERS pattern

A project adds this to `.github/CODEOWNERS`; ease-design ships no CODEOWNERS of its own.

```
# design decisions: the design lead reviews every change
/design/                    @your-org/design-leads
# scope-shaping rulings also need the PM
/design/knowledge/          @your-org/design-leads @your-org/product-managers
```

Turn on "Require review from Code Owners" in branch protection for the default branch, so
a ruling cannot land without the owning team's approving review.

## Filling `approved_by`

`approved_by` is an optional array on each ruling in `design/knowledge/rulings.json`. The
draft shape is in `schemas/rulings.schema.json`. Each entry has three required keys:

```json
"approved_by": [
  { "role": "design-lead", "person": "Jane Doe", "at": "2026-09-26" },
  { "role": "PM", "person": "Sam Lee", "at": "2026-09-27" }
]
```

- `role` is one of `PM`, `design-lead`, `BA`, `owner`, `source`.
- `person` is the approver's name as the team knows them.
- `at` is the approval date, `YYYY-MM-DD`.

The PR author adds an entry only after the approver has said yes in the PR review. An
agent may draft a ruling; it never fills `approved_by` for a human.

## Status

`ui knowledge lint <rulings.json>` validates `approved_by` against `schemas/rulings.schema.json`. Nothing else in `ui` reads it yet: the trail is a record for reviewers and the promotion gate, not a runtime switch.

## Install check

Before a team adopts the door, prove the install on a machine that has never seen it: `scripts/fresh-install-proof.sh` packs the checkout, installs the tarball into a throwaway npm prefix and cache (never the real global prefix), then runs `ui doctor`, `ui init --all` in an empty project and `ui doctor --cwd`, printing wall time per step. Verified on a fresh prefix on 2026-09-27: 6.9 seconds end to end (0.1 minutes), 95 adapter files written, both doctor runs exit 0. `--tarball <file>` re-runs it against any tarball; `UI_FRESH_INSTALL=1 npm test -- fresh-install-proof` runs it from the test suite.
