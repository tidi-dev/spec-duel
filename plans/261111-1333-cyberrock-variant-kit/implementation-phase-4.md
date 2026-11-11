# Phase 4: code audit of cyberrock-variant

**Priority:** high · **Status:** done 2026-11-11 · Same rubric and metrics as `reports/openspec-vs-spec-kit-code-audit.md` §2–§3.

## Requirements
- Scope: `apps/` and `libs/`, `baseline-v1..HEAD`, kit-written code only.
- One read-only subagent using `lean-audit`, allowed to read `cyberrock-variant/` only, with the brief the other two auditors had.
- Output: `plans/reports/cyberrock-variant-code-audit.md`, same structure and 1–5 scorecard as the other two per-kit audits.
- The main session checks B1–B12 in the new code and re-reads every high and top medium finding.

## Related files
- Create: `plans/reports/cyberrock-variant-code-audit.md`.
- Read: `plans/reports/openspec-variant-code-audit.md` (structure only), the new variant's code.

## Implementation steps
1. Metrics for the new variant with the same commands as CA §3: diff size, source and spec lines, test cases, coverage, complexity (ESLint core rule), duplication (the local clone script if it survives in `runs/tools` or the audit's plan; otherwise the figure is marked not measured), raw queries, transactions, banned constructs, files over 200 lines.
2. Launch the auditor with the metrics and the rubric; it must not open reports or other variants.
3. B1–B12 table: for each bug, the file and line in the new code that avoids it or has it.
4. Re-verify high and top medium findings by reading the code.

## Todo
- [x] Metrics
- [x] Audit report
- [x] B1–B12 check
- [x] Verification

## Success criteria
The per-kit audit exists in `plans/reports/`; every B row has evidence; scores use the same scale.

## Risks
An auditor that knows the catalogue would grade to it: the auditor is given the rubric only, not `cr/risks.md` as a checklist, though it may read it as part of the variant.

## Next
Phase 5.
